import type { IStorage } from "../storage";
import type { Task } from "@shared/schema";
import { TASK_STATUSES, TASK_PRIORITIES } from "@shared/routes";

export function isValidTaskStatus(s: string): boolean {
  return (TASK_STATUSES as readonly string[]).includes(s);
}

export function isValidTaskPriority(p: string): boolean {
  return (TASK_PRIORITIES as readonly string[]).includes(p);
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assignedUserId?: number | null;
  threadId?: number | null;
  issueId?: number | null;
  priority?: string;
  dueDate?: Date | string | null;
}

export async function createTask(
  input: CreateTaskInput,
  createdByUserId: number,
  storage: IStorage,
): Promise<Task> {
  const task = await storage.createTask({
    title: input.title,
    description: input.description ?? null,
    assignedUserId: input.assignedUserId ?? null,
    threadId: input.threadId ?? null,
    issueId: input.issueId ?? null,
    createdByUserId,
    status: "Open",
    priority: input.priority ?? "Normal",
    dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
  });

  await storage.logActivity({
    entityType: "task",
    entityId: task.id,
    action: "task_created",
    userId: createdByUserId,
    metadata: { title: task.title, priority: task.priority },
  });

  if (task.threadId) {
    await storage.logActivity({
      entityType: "thread",
      entityId: task.threadId,
      action: "task_created",
      userId: createdByUserId,
      metadata: { taskId: task.id, taskTitle: task.title },
    });
  }

  return task;
}

export async function updateTask(
  taskId: number,
  updates: Partial<CreateTaskInput & { status?: string; priority?: string }>,
  actorUserId: number,
  storage: IStorage,
): Promise<Task> {
  const existing = await storage.getTask(taskId);
  if (!existing) {
    const err = new Error("Task not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.assignedUserId !== undefined) patch.assignedUserId = updates.assignedUserId;
  if (updates.threadId !== undefined) patch.threadId = updates.threadId;
  if (updates.issueId !== undefined) patch.issueId = updates.issueId;
  if (updates.dueDate !== undefined) patch.dueDate = updates.dueDate ? new Date(updates.dueDate as string) : null;

  if (updates.priority !== undefined) {
    if (!isValidTaskPriority(updates.priority)) {
      const err = new Error(`Invalid priority. Allowed: ${TASK_PRIORITIES.join(", ")}`) as Error & { status: number };
      err.status = 400;
      throw err;
    }
    patch.priority = updates.priority;
  }

  if (updates.status !== undefined) {
    if (!isValidTaskStatus(updates.status)) {
      const err = new Error(`Invalid status. Allowed: ${TASK_STATUSES.join(", ")}`) as Error & { status: number };
      err.status = 400;
      throw err;
    }
    if (updates.status !== existing.status) {
      patch.status = updates.status;
      await storage.logActivity({
        entityType: "task",
        entityId: taskId,
        action: "task_status_changed",
        userId: actorUserId,
        metadata: { from: existing.status, to: updates.status },
      });
    } else {
      patch.status = updates.status;
    }
  }

  if (updates.assignedUserId !== undefined && updates.assignedUserId !== existing.assignedUserId) {
    await storage.logActivity({
      entityType: "task",
      entityId: taskId,
      action: "task_assigned",
      userId: actorUserId,
      metadata: { assignedUserId: updates.assignedUserId },
    });
  }

  return storage.updateTask(taskId, patch as Parameters<IStorage["updateTask"]>[1]);
}
