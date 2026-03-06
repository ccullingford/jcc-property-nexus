/**
 * Background mailbox sync scheduler.
 *
 * Polls all mailboxes with autoSyncEnabled=true and runs syncMailbox()
 * based on their autoSyncIntervalMinutes setting.
 * Prevents concurrent syncs for the same mailbox.
 */

import { storage } from "../storage";
import { syncMailbox } from "./syncService";

const inProgress = new Set<number>();
let timer: ReturnType<typeof setInterval> | null = null;

async function runScheduledSyncs() {
  let mailboxes;
  try {
    mailboxes = await storage.getMailboxes();
  } catch (err) {
    console.error("[scheduler] Failed to fetch mailboxes:", err);
    return;
  }

  const now = Date.now();

  for (const mailbox of mailboxes) {
    const autoSyncEnabled = (mailbox as any).autoSyncEnabled ?? true;
    if (!autoSyncEnabled) continue;
    if (inProgress.has(mailbox.id)) continue;

    const intervalMs = ((mailbox as any).autoSyncIntervalMinutes ?? 5) * 60 * 1000;
    const lastSynced = (mailbox as any).lastSyncedAt
      ? new Date((mailbox as any).lastSyncedAt).getTime()
      : 0;

    if (now - lastSynced < intervalMs) continue;

    inProgress.add(mailbox.id);
    syncMailbox(mailbox)
      .then((result) => {
        const errCount = result.errors.length;
        console.log(
          `[scheduler] Mailbox #${mailbox.id} "${mailbox.name}": ` +
          `${result.threadsUpserted} threads, ${result.messagesUpserted} messages` +
          (errCount ? `, ${errCount} error(s)` : "")
        );
      })
      .catch((err) => {
        console.error(`[scheduler] Mailbox #${mailbox.id} sync failed:`, err);
      })
      .finally(() => {
        inProgress.delete(mailbox.id);
      });
  }
}

export function startSyncScheduler() {
  if (timer) return;
  console.log("[scheduler] Mailbox auto-sync scheduler started (tick: 60s)");
  timer = setInterval(runScheduledSyncs, 60_000);
  // Run once after a short delay on startup
  setTimeout(runScheduledSyncs, 5_000);
}

export function stopSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[scheduler] Mailbox auto-sync scheduler stopped");
  }
}
