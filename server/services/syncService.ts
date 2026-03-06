/**
 * Mailbox sync service.
 *
 * Pulls messages from Microsoft Graph for a configured mailbox,
 * groups them into threads by conversationId, and upserts into Postgres.
 *
 * Sync modes:
 *   application — uses app-only (client credentials) token (shared mailboxes).
 *   delegated   — uses the mailbox owner's stored OAuth token (personal mailboxes).
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
  fetchSentMessages,
  fetchMessageAttachments,
  type GraphMessage,
} from "./graphService";
import { refreshAccessToken, getOAuthConfig } from "./microsoftAuthService";
import { findContactByEmail } from "./contactIdentityService";
import { linkThreadContact } from "./contactService";
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
 * Returns undefined for application-mode mailboxes (graphService uses app-only token).
 * Returns a valid access token string for delegated-mode mailboxes.
 */
async function resolveSyncToken(mailbox: Mailbox): Promise<string | undefined> {
  if (mailbox.syncMode !== "delegated") return undefined;

  if (!mailbox.ownerUserId) {
    throw new Error(
      "Mailbox is set to delegated sync but has no ownerUserId. Assign an owner first."
    );
  }

  const user = await storage.getUser(mailbox.ownerUserId);
  if (!user) throw new Error(`Owner user ${mailbox.ownerUserId} not found.`);

  if (!user.msRefreshToken) {
    throw new Error(
      `No delegated token stored for ${user.email}. The owner must log in again to grant Mail.Read access.`
    );
  }

  const now = Date.now();
  const expiresAt = user.msTokenExpiresAt ? new Date(user.msTokenExpiresAt).getTime() : 0;
  const needsRefresh = expiresAt - now < 60_000;

  if (!needsRefresh && user.msAccessToken) return user.msAccessToken;

  const config = getOAuthConfig();
  if (!config) throw new Error("OAuth not configured — cannot refresh delegated token.");

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

/**
 * Auto-link a thread to contacts found via sender/recipient emails.
 */
async function autoLinkContacts(threadId: number, senderEmail: string, recipientEmails: string[]) {
  try {
    const emailsToCheck = [senderEmail, ...recipientEmails].filter(Boolean);
    for (const email of emailsToCheck) {
      const contact = await findContactByEmail(email);
      if (contact) {
        await linkThreadContact(threadId, contact.id, undefined);
        break; // Link first match as primary
      }
    }
  } catch {
    // Auto-linking is best-effort, never fail sync
  }
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

  // Compute sync window
  const syncHistoryDays = (mailbox as any).syncHistoryDays ?? 30;
  const since = new Date(Date.now() - syncHistoryDays * 24 * 60 * 60 * 1000);

  // Fetch inbox messages
  let inboxMessages: GraphMessage[] = [];
  try {
    inboxMessages = await fetchMailboxMessages(mailbox.microsoftMailboxId, {
      top: 100,
      token: syncToken,
      since,
    });
  } catch (err: any) {
    result.errors.push(`Inbox fetch failed: ${err.message}`);
  }

  // Fetch sent messages (if enabled)
  let sentMessages: GraphMessage[] = [];
  const includeSent = (mailbox as any).includeSentMail !== false;
  if (includeSent) {
    try {
      sentMessages = await fetchSentMessages(mailbox.microsoftMailboxId, {
        top: 100,
        token: syncToken,
        since,
      });
    } catch (err: any) {
      result.errors.push(`Sent fetch failed: ${err.message}`);
    }
  }

  // Build combined message set keyed by conversation, preserving direction
  const byConversation: Record<string, Array<{ msg: GraphMessage; direction: "inbound" | "outbound" }>> = {};

  for (const msg of inboxMessages) {
    const key = msg.conversationId || msg.id;
    if (!byConversation[key]) byConversation[key] = [];
    byConversation[key].push({ msg, direction: "inbound" });
  }

  for (const msg of sentMessages) {
    const key = msg.conversationId || msg.id;
    if (!byConversation[key]) byConversation[key] = [];
    // Avoid duplicating if already seen in inbox
    if (!byConversation[key].some(e => e.msg.id === msg.id)) {
      byConversation[key].push({ msg, direction: "outbound" });
    }
  }

  for (const conversationId of Object.keys(byConversation)) {
    const entries = byConversation[conversationId];
    try {
      entries.sort(
        (a, b) =>
          new Date(a.msg.receivedDateTime).getTime() -
          new Date(b.msg.receivedDateTime).getTime()
      );

      const newestEntry = entries[entries.length - 1];
      const newest = newestEntry.msg;
      const subject = newest.subject || "(no subject)";
      const lastMessageAt = new Date(newest.receivedDateTime);

      const existingThread = await db
        .select()
        .from(emailThreads)
        .where(eq(emailThreads.microsoftThreadId, conversationId))
        .limit(1);

      let threadId: number;
      const now = new Date();
      let isNewThread = false;

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
        isNewThread = true;
      }

      let firstSenderEmail = "";
      let firstRecipients: string[] = [];

      for (const { msg: gMsg, direction } of entries) {
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

        if (!firstSenderEmail && direction === "inbound") {
          firstSenderEmail = gMsg.from.emailAddress.address;
          firstRecipients = recipients;
        }

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
              direction,
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
              // Non-fatal
            }
          }
        }
      }

      // Auto-link contact for new threads
      if (isNewThread && firstSenderEmail) {
        await autoLinkContacts(threadId, firstSenderEmail, firstRecipients);
      }
    } catch (err: any) {
      result.errors.push(`Conversation ${conversationId}: ${err.message}`);
    }
  }

  // Update last synced timestamp
  try {
    await storage.updateMailboxLastSynced(mailbox.id, new Date());
  } catch {
    // Non-fatal
  }

  return result;
}
