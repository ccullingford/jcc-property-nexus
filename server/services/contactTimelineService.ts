import { db } from "../db";
import { emailThreads, threadContacts, notes, tasks, users } from "@shared/schema";
import { eq, inArray, or } from "drizzle-orm";
import type { ContactTimelineItem } from "@shared/routes";

export async function getContactTimeline(contactId: number): Promise<ContactTimelineItem[]> {
  const tcRows = await db
    .select({ threadId: threadContacts.threadId })
    .from(threadContacts)
    .where(eq(threadContacts.contactId, contactId));
  const directThreads = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.contactId, contactId));
  const threadIdSet = new Set<number>([
    ...tcRows.map(r => r.threadId),
    ...directThreads.map(r => r.id),
  ]);
  const threadIds = Array.from(threadIdSet);
  const timeline: ContactTimelineItem[] = [];
  if (threadIds.length === 0) return timeline;
  const [threadRows, noteRows, taskRows] = await Promise.all([
    db.select().from(emailThreads).where(inArray(emailThreads.id, threadIds)),
    db.select().from(notes).where(inArray(notes.threadId, threadIds)),
    db.select().from(tasks).where(inArray(tasks.threadId, threadIds)),
  ]);
  const userIds = Array.from(new Set(
    noteRows.map(n => n.userId).filter((id): id is number => id !== null),
  ));
  const userMap = new Map<number, string>();
  if (userIds.length) {
    const userRows = await db.select().from(users).where(inArray(users.id, userIds));
    for (const u of userRows) userMap.set(u.id, u.name);
  }
  for (const t of threadRows) {
    timeline.push({
      id: `thread-${t.id}`,
      type: "thread",
      timestamp: (t.lastMessageAt ?? t.createdAt).toISOString(),
      summary: t.subject,
      detail: `Status: ${t.status}`,
      entityId: t.id,
    });
  }
  for (const n of noteRows) {
    const author = n.userId ? (userMap.get(n.userId) ?? "Staff") : "Staff";
    timeline.push({
      id: `note-${n.id}`,
      type: "note",
      timestamp: n.createdAt.toISOString(),
      summary: `Note by ${author}`,
      detail: n.body.slice(0, 200),
      entityId: n.id,
    });
  }
  for (const t of taskRows) {
    timeline.push({
      id: `task-${t.id}`,
      type: "task",
      timestamp: t.createdAt.toISOString(),
      summary: t.title,
      detail: `${t.status} · ${t.priority}`,
      entityId: t.id,
    });
  }
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return timeline;
}
