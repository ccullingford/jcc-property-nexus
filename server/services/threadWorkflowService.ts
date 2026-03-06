import type { IStorage } from "../storage";

export type NoteWithUser = {
  id: number;
  threadId: number | null;
  userId: number | null;
  body: string;
  createdAt: Date;
  authorName: string | null;
  authorEmail: string | null;
};

export type ActivityWithUser = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId: number | null;
  metadata: unknown;
  createdAt: Date;
  actorName: string | null;
};

const ALLOWED_STATUSES = ["Open", "Waiting", "Closed", "Archived"] as const;
export type ThreadStatus = typeof ALLOWED_STATUSES[number];

export function isValidStatus(status: string): status is ThreadStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(status);
}

export async function claimThread(threadId: number, userId: number, storage: IStorage) {
  const thread = await storage.getThread(threadId);
  if (!thread) throw Object.assign(new Error("Thread not found"), { status: 404 });
  if (thread.assignedUserId !== null) throw Object.assign(new Error("Thread is already assigned"), { status: 409 });

  const updated = await storage.updateThread(threadId, {
    assignedUserId: userId,
    updatedAt: new Date(),
  });

  const actor = await storage.getUser(userId);
  await storage.logActivity({
    entityType: "thread",
    entityId: threadId,
    action: "claimed",
    userId,
    metadata: { actorName: actor?.name ?? actor?.email ?? null },
  });

  return updated;
}

export async function assignThread(
  threadId: number,
  assigneeId: number,
  actorId: number,
  storage: IStorage,
) {
  const thread = await storage.getThread(threadId);
  if (!thread) throw Object.assign(new Error("Thread not found"), { status: 404 });

  const assignee = await storage.getUser(assigneeId);
  if (!assignee) throw Object.assign(new Error("Assignee not found"), { status: 404 });

  const updated = await storage.updateThread(threadId, {
    assignedUserId: assigneeId,
    updatedAt: new Date(),
  });

  const actor = await storage.getUser(actorId);
  await storage.logActivity({
    entityType: "thread",
    entityId: threadId,
    action: "assigned",
    userId: actorId,
    metadata: {
      assigneeId,
      assigneeName: assignee.name ?? assignee.email,
      actorName: actor?.name ?? actor?.email ?? null,
    },
  });

  return updated;
}

export async function unassignThread(threadId: number, actorId: number, storage: IStorage) {
  const thread = await storage.getThread(threadId);
  if (!thread) throw Object.assign(new Error("Thread not found"), { status: 404 });

  const prevAssigneeId = thread.assignedUserId;
  const updated = await storage.updateThread(threadId, {
    assignedUserId: null,
    updatedAt: new Date(),
  });

  const actor = await storage.getUser(actorId);
  const prevAssignee = prevAssigneeId ? await storage.getUser(prevAssigneeId) : null;
  await storage.logActivity({
    entityType: "thread",
    entityId: threadId,
    action: "unassigned",
    userId: actorId,
    metadata: {
      actorName: actor?.name ?? actor?.email ?? null,
      previousAssigneeName: prevAssignee?.name ?? prevAssignee?.email ?? null,
    },
  });

  return updated;
}

export async function updateThreadStatus(
  threadId: number,
  status: ThreadStatus,
  actorId: number,
  storage: IStorage,
) {
  const thread = await storage.getThread(threadId);
  if (!thread) throw Object.assign(new Error("Thread not found"), { status: 404 });

  const oldStatus = thread.status;
  const updated = await storage.updateThread(threadId, {
    status,
    updatedAt: new Date(),
  });

  const actor = await storage.getUser(actorId);
  await storage.logActivity({
    entityType: "thread",
    entityId: threadId,
    action: "status_changed",
    userId: actorId,
    metadata: {
      from: oldStatus,
      to: status,
      actorName: actor?.name ?? actor?.email ?? null,
    },
  });

  return updated;
}

export async function addNote(
  threadId: number,
  userId: number,
  body: string,
  storage: IStorage,
): Promise<NoteWithUser> {
  const thread = await storage.getThread(threadId);
  if (!thread) throw Object.assign(new Error("Thread not found"), { status: 404 });

  const note = await storage.createNote({ threadId, userId, body });

  const author = await storage.getUser(userId);
  await storage.logActivity({
    entityType: "thread",
    entityId: threadId,
    action: "note_added",
    userId,
    metadata: { actorName: author?.name ?? author?.email ?? null },
  });

  return {
    ...note,
    authorName: author?.name ?? null,
    authorEmail: author?.email ?? null,
  };
}

export async function getNotesWithUsers(
  threadId: number,
  storage: IStorage,
): Promise<NoteWithUser[]> {
  const rawNotes = await storage.getNotesByThread(threadId);
  const result: NoteWithUser[] = [];
  for (const n of rawNotes) {
    const author = n.userId ? await storage.getUser(n.userId) : null;
    result.push({
      ...n,
      authorName: author?.name ?? null,
      authorEmail: author?.email ?? null,
    });
  }
  return result;
}

export async function getActivityWithUsers(
  threadId: number,
  storage: IStorage,
): Promise<ActivityWithUser[]> {
  const entries = await storage.getActivityByEntity("thread", threadId);
  const result: ActivityWithUser[] = [];
  for (const e of entries) {
    const actor = e.userId ? await storage.getUser(e.userId) : null;
    result.push({
      ...e,
      actorName: actor?.name ?? actor?.email ?? null,
    });
  }
  return result;
}
