import { db } from '../db';
import { issueThreads, tasks, emailThreads, users, issues } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { IssueThreadWithThread, TaskWithMeta } from '../../shared/routes';
import { storage } from '../storage';

async function enrichIssueThread(link: typeof issueThreads.$inferSelect): Promise<IssueThreadWithThread> {
  const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, link.threadId));
  return {
    ...link,
    threadSubject: thread?.subject ?? null,
    threadStatus: thread?.status ?? null,
    threadReceivedAt: thread?.lastMessageAt ? thread.lastMessageAt.toISOString() : null,
  };
}

export async function linkIssueThread(issueId: number, threadId: number, userId?: number): Promise<IssueThreadWithThread> {
  const existing = await db.select().from(issueThreads)
    .where(and(eq(issueThreads.issueId, issueId), eq(issueThreads.threadId, threadId)));

  if (existing.length > 0) {
    return enrichIssueThread(existing[0]);
  }

  const [link] = await db.insert(issueThreads).values({ issueId, threadId }).returning();

  await storage.logActivity({
    entityType: 'issue',
    entityId: issueId,
    action: 'thread_linked',
    userId: userId ?? null,
    metadata: { threadId },
  });

  return enrichIssueThread(link);
}

export async function unlinkIssueThread(issueId: number, threadId: number, userId?: number): Promise<void> {
  await db.delete(issueThreads)
    .where(and(eq(issueThreads.issueId, issueId), eq(issueThreads.threadId, threadId)));

  await storage.logActivity({
    entityType: 'issue',
    entityId: issueId,
    action: 'thread_unlinked',
    userId: userId ?? null,
    metadata: { threadId },
  });
}

export async function linkIssueTask(issueId: number, taskId: number, userId?: number): Promise<TaskWithMeta | null> {
  await db.update(tasks).set({ issueId }).where(eq(tasks.id, taskId));

  await storage.logActivity({
    entityType: 'issue',
    entityId: issueId,
    action: 'task_linked',
    userId: userId ?? null,
    metadata: { taskId },
  });

  const result = await storage.getTaskWithMeta(taskId);
  return result ?? null;
}

export async function unlinkIssueTask(issueId: number, taskId: number, userId?: number): Promise<TaskWithMeta | null> {
  await db.update(tasks).set({ issueId: null }).where(and(eq(tasks.id, taskId), eq(tasks.issueId, issueId)));

  await storage.logActivity({
    entityType: 'issue',
    entityId: issueId,
    action: 'task_unlinked',
    userId: userId ?? null,
    metadata: { taskId },
  });

  const result = await storage.getTaskWithMeta(taskId);
  return result ?? null;
}

export async function getIssueThreads(issueId: number): Promise<IssueThreadWithThread[]> {
  const links = await db.select().from(issueThreads).where(eq(issueThreads.issueId, issueId));
  return Promise.all(links.map(enrichIssueThread));
}

export async function getIssueTasks(issueId: number): Promise<TaskWithMeta[]> {
  const issueTasks = await db.select().from(tasks).where(eq(tasks.issueId, issueId));
  return Promise.all(issueTasks.map(async (task) => {
    const meta = await storage.getTaskWithMeta(task.id);
    return meta!;
  }));
}

export async function getThreadIssues(threadId: number): Promise<(typeof issues.$inferSelect)[]> {
  const links = await db.select().from(issueThreads).where(eq(issueThreads.threadId, threadId));
  if (links.length === 0) return [];
  const result = await Promise.all(links.map(l => db.select().from(issues).where(eq(issues.id, l.issueId))));
  return result.flat();
}
