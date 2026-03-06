/**
 * Mailbox sync service.
 *
 * Pulls messages from Microsoft Graph for a configured mailbox,
 * groups them into threads by conversationId, and upserts into Postgres.
 *
 * Design notes:
 * - This is a first-pass sync — straightforward message pull.
 * - Future: implement delta sync using Graph $deltaToken for efficiency.
 * - Duplicate prevention via microsoft_message_id UNIQUE index.
 * - Per-thread last_message_at is updated after each sync pass.
 */

import { db } from "../db";
import {
  emailThreads,
  messages as messagesTable,
  attachments as attachmentsTable,
  type Mailbox,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  fetchMailboxMessages,
  fetchMessageAttachments,
  type GraphMessage,
} from "./graphService";
// Uses Replit Outlook connector (REPLIT_CONNECTORS_HOSTNAME) or app-only credentials

export interface SyncResult {
  mailboxId: number;
  mailboxName: string;
  threadsUpserted: number;
  messagesUpserted: number;
  errors: string[];
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

  let graphMessages: GraphMessage[];
  try {
    graphMessages = await fetchMailboxMessages(mailbox.microsoftMailboxId, { top: 100 });
  } catch (err: any) {
    result.errors.push(`Graph fetch failed: ${err.message}`);
    return result;
  }

  // Group messages by conversationId
  const byConversation = new Map<string, GraphMessage[]>();
  for (const msg of graphMessages) {
    const key = msg.conversationId || msg.id;
    if (!byConversation.has(key)) byConversation.set(key, []);
    byConversation.get(key)!.push(msg);
  }

  for (const [conversationId, convMessages] of byConversation) {
    try {
      // Sort ascending so first = oldest
      convMessages.sort(
        (a, b) =>
          new Date(a.receivedDateTime).getTime() -
          new Date(b.receivedDateTime).getTime()
      );

      const newest = convMessages[convMessages.length - 1];
      const subject = newest.subject || "(no subject)";
      const lastMessageAt = new Date(newest.receivedDateTime);

      // Upsert thread
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

      // Upsert each message
      for (const gMsg of convMessages) {
        const existing = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.microsoftMessageId, gMsg.id))
          .limit(1);

        const recipients = gMsg.toRecipients.map((r) => r.emailAddress.address);
        const bodyText =
          gMsg.body.contentType === "text" ? gMsg.body.content : undefined;
        const bodyHtml =
          gMsg.body.contentType === "html" ? gMsg.body.content : undefined;

        let messageId: number;

        if (existing.length > 0) {
          messageId = existing[0].id;
          await db
            .update(messagesTable)
            .set({
              isRead: gMsg.isRead,
              updatedAt: now,
            })
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

          // Sync attachment metadata
          if (gMsg.hasAttachments) {
            try {
              const graphAttachments = await fetchMessageAttachments(
                mailbox.microsoftMailboxId!,
                gMsg.id
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
