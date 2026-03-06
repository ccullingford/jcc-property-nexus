/**
 * Mailbox sync service.
 *
 * Pulls messages from Microsoft Graph for a configured mailbox,
 * groups them into threads by conversationId, and upserts into Postgres.
 *
 * Sync modes:
 *   application — uses app-only (client credentials) token. Required for shared mailboxes.
 *   delegated   — uses the mailbox owner's stored OAuth token. Required for personal mailboxes
 *                 when the Exchange AppOnly AccessPolicy blocks app-only access.
 */

import { db } from "../db";
import {
  emailThreads,
  messages as messagesTable,
  attachments as attachmentsTable,
  type Mailbox,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { desc } from "drizzle-orm";
import {
  fetchMailboxMessages,
  fetchMessageAttachments,
  type GraphMessage,
} from "./graphService";
import { refreshAccessToken, getOAuthConfig } from "./microsoftAuthService";
import { storage } from "../storage";

export interface SyncResult {
  mailboxId: number;
  mailboxName: string;
  threadsUpserted: number;
  messagesUpserted: number;
  errors: string[];
}

/**
 * Resolve the Graph access token to use for a given mailbox.
 *
 * - syncMode "application": returns undefined — graphService will use app-only token.
 * - syncMode "delegated": fetches the owner user's stored token, refreshing if expired.
 *   Returns the valid access token string.
 *
 * Throws if delegated mode is requested but no owner token is available.
 */
async function resolveSyncToken(mailbox: Mailbox): Promise<string | undefined> {
  if (mailbox.syncMode !== "delegated") return undefined;

  if (!mailbox.ownerUserId) {
    throw new Error(
      "Mailbox is set to delegated sync but has no ownerUserId. Assign an owner first."
    );
  }

  const user = await storage.getUser(mailbox.ownerUserId);
  if (!user) {
    throw new Error(`Owner user ${mailbox.ownerUserId} not found.`);
  }

  if (!user.msRefreshToken) {
    throw new Error(
      `No delegated token stored for ${user.email}. The owner must log in again to grant Mail.Read access.`
    );
  }

  const now = Date.now();
  const expiresAt = user.msTokenExpiresAt ? new Date(user.msTokenExpiresAt).getTime() : 0;
  const needsRefresh = expiresAt - now < 60_000;

  if (!needsRefresh && user.msAccessToken) {
    return user.msAccessToken;
  }

  const config = getOAuthConfig();
  if (!config) {
    throw new Error("OAuth not configured — cannot refresh delegated token.");
  }

  const refreshed = await refreshAccessToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    tenantId: config.tenantId,
    refreshToken: user.msRefreshToken,
  });

  await storage.updateUserTokens(user.id, {
    msAccessToken: refreshed.access_token,
    msRefreshToken: refreshed.refresh_token ?? user.msRefreshToken,
    msTokenExpiresAt: new Date(now + refreshed.expires_in * 1000),
  });

  return refreshed.access_token;
}

export async function syncMailbox(mailbox: Mailbox): Promise<SyncResult> {
  const result: SyncResult = {
    mailboxId: mailbox.id,
    mailboxName: mailbox.name,
    threadsUpserted: 0,
    messagesUpserted: 0,
    errors: [],
  };

  if (!mailbox.microsoftMailboxId) {
    result.errors.push("No Microsoft mailbox ID configured.");
    return result;
  }

  let syncToken: string | undefined;
  try {
    syncToken = await resolveSyncToken(mailbox);
  } catch (err: any) {
    result.errors.push(`Token resolution failed: ${err.message}`);
    return result;
  }

  let graphMessages: GraphMessage[];
  try {
    graphMessages = await fetchMailboxMessages(mailbox.microsoftMailboxId, {
      top: 100,
      token: syncToken,
    });
  } catch (err: any) {
    result.errors.push(`Graph fetch failed: ${err.message}`);
    return result;
  }

  const byConversation: Record<string, GraphMessage[]> = {};
  for (const msg of graphMessages) {
    const key = msg.conversationId || msg.id;
    if (!byConversation[key]) byConversation[key] = [];
    byConversation[key].push(msg);
  }

  for (const conversationId of Object.keys(byConversation)) {
    const convMessages = byConversation[conversationId];
    try {
      convMessages.sort(
        (a: GraphMessage, b: GraphMessage) =>
          new Date(a.receivedDateTime).getTime() -
          new Date(b.receivedDateTime).getTime()
      );

      const newest = convMessages[convMessages.length - 1];
      const subject = newest.subject || "(no subject)";
      const lastMessageAt = new Date(newest.receivedDateTime);

      const existingThread = await db
        .select()
        .from(emailThreads)
        .where(eq(emailThreads.microsoftThreadId, conversationId))
        .limit(1);

      let threadId: number;
      const now = new Date();

      if (existingThread.length > 0) {
        threadId = existingThread[0].id;
        await db
          .update(emailThreads)
          .set({ lastMessageAt, updatedAt: now })
          .where(eq(emailThreads.id, threadId));
      } else {
        const [newThread] = await db
          .insert(emailThreads)
          .values({
            mailboxId: mailbox.id,
            subject,
            microsoftThreadId: conversationId,
            status: "Open",
            lastMessageAt,
            updatedAt: now,
          })
          .returning();
        threadId = newThread.id;
        result.threadsUpserted++;
      }

      for (const gMsg of convMessages) {
        const existing = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.microsoftMessageId, gMsg.id))
          .limit(1);

        const recipients = gMsg.toRecipients.map((r: any) => r.emailAddress.address);
        const bodyText =
          gMsg.body.contentType === "text" ? gMsg.body.content : undefined;
        const bodyHtml =
          gMsg.body.contentType === "html" ? gMsg.body.content : undefined;

        let messageId: number;

        if (existing.length > 0) {
          messageId = existing[0].id;
          await db
            .update(messagesTable)
            .set({ isRead: gMsg.isRead, updatedAt: now })
            .where(eq(messagesTable.id, messageId));
        } else {
          const [newMsg] = await db
            .insert(messagesTable)
            .values({
              threadId,
              microsoftMessageId: gMsg.id,
              senderEmail: gMsg.from.emailAddress.address,
              senderName: gMsg.from.emailAddress.name,
              recipients,
              subject: gMsg.subject,
              bodyPreview: gMsg.bodyPreview,
              bodyText,
              bodyHtml,
              receivedAt: new Date(gMsg.receivedDateTime),
              hasAttachments: gMsg.hasAttachments,
              isRead: gMsg.isRead,
              updatedAt: now,
            })
            .returning();
          messageId = newMsg.id;
          result.messagesUpserted++;

          if (gMsg.hasAttachments) {
            try {
              const graphAttachments = await fetchMessageAttachments(
                mailbox.microsoftMailboxId!,
                gMsg.id,
                syncToken
              );
              for (const att of graphAttachments) {
                await db
                  .insert(attachmentsTable)
                  .values({
                    messageId,
                    microsoftAttachmentId: att.id,
                    filename: att.name,
                    contentType: att.contentType,
                    sizeBytes: att.size,
                  })
                  .onConflictDoNothing();
              }
            } catch {
              // Non-fatal: attachment sync failure
            }
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`Conversation ${conversationId}: ${err.message}`);
    }
  }

  return result;
}
