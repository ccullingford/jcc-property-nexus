import { db } from '../db';
import { tasks, notes, emailThreads, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import type { IssueTimelineItem } from '../../shared/routes';
import { storage } from '../storage';

export async function getIssueTimeline(issueId: number): Promise<IssueTimelineItem[]> {
  const items: IssueTimelineItem[] = [];

  const activities = await storage.getActivityByEntity('issue', issueId);

  for (const act of activities) {
    let actorName: string | null = null;
    if (act.userId) {
      const user = await storage.getUser(act.userId);
      if (user) actorName = user.name || user.email;
    }

    const meta = act.metadata as Record<string, unknown> | null;

    if (act.action === 'created') {
      items.push({
        id: `activity-${act.id}`,
        type: 'created',
        timestamp: act.createdAt.toISOString(),
        summary: 'Issue created',
        detail: meta?.title as string | undefined,
        actorName,
      });
    } else if (act.action === 'status_changed') {
      items.push({
        id: `activity-${act.id}`,
        type: 'status_changed',
        timestamp: act.createdAt.toISOString(),
        summary: `Status changed: ${meta?.from} → ${meta?.to}`,
        actorName,
      });
    } else if (act.action === 'thread_linked') {
      const threadId = meta?.threadId as number;
      let subject = `Thread #${threadId}`;
      if (threadId) {
        const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
        if (thread) subject = thread.subject || subject;
      }
      items.push({
        id: `activity-${act.id}`,
        type: 'thread_linked',
        timestamp: act.createdAt.toISOString(),
        summary: `Email thread linked: ${subject}`,
        actorName,
      });
    } else if (act.action === 'task_linked') {
      const taskId = meta?.taskId as number;
      let taskTitle = `Task #${taskId}`;
      if (taskId) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
        if (task) taskTitle = task.title || taskTitle;
      }
      items.push({
        id: `activity-${act.id}`,
        type: 'task_linked',
        timestamp: act.createdAt.toISOString(),
        summary: `Task linked: ${taskTitle}`,
        actorName,
      });
    } else {
      items.push({
        id: `activity-${act.id}`,
        type: 'activity',
        timestamp: act.createdAt.toISOString(),
        summary: act.action.replace(/_/g, ' '),
        actorName,
      });
    }
  }

  const issueNotes = await storage.getNotesByIssue(issueId);
  for (const note of issueNotes) {
    let actorName: string | null = null;
    if (note.userId) {
      const user = await storage.getUser(note.userId);
      if (user) actorName = user.name || user.email;
    }
    items.push({
      id: `note-${note.id}`,
      type: 'note',
      timestamp: note.createdAt.toISOString(),
      summary: 'Note added',
      detail: note.body.substring(0, 120) + (note.body.length > 120 ? '...' : ''),
      actorName,
    });
  }

  const issueTasks = await db.select().from(tasks).where(eq(tasks.issueId, issueId));
  for (const task of issueTasks) {
    if (task.status === 'Completed' && task.updatedAt) {
      items.push({
        id: `task-complete-${task.id}`,
        type: 'activity',
        timestamp: task.updatedAt.toISOString(),
        summary: `Task completed: ${task.title}`,
      });
    }
  }

  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return items;
}
