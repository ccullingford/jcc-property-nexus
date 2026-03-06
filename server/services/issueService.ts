import { db } from '../db';
import { issues, users, contacts, tasks, notes, issueThreads } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import type { IssueWithDetails } from '../../shared/routes';
import { storage } from '../storage';

async function enrichIssue(issue: typeof issues.$inferSelect): Promise<IssueWithDetails> {
  const [threadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issueThreads)
    .where(eq(issueThreads.issueId, issue.id));

  const [taskCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.issueId, issue.id));

  const [noteCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(eq(notes.issueId, issue.id));

  let contactName: string | null = null;
  if (issue.contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, issue.contactId));
    if (contact) contactName = contact.displayName;
  }

  let assigneeName: string | null = null;
  if (issue.assignedUserId) {
    const [user] = await db.select().from(users).where(eq(users.id, issue.assignedUserId));
    if (user) assigneeName = user.name || user.email;
  }

  return {
    ...issue,
    contactName,
    assigneeName,
    threadCount: threadCount?.count ?? 0,
    taskCount: taskCount?.count ?? 0,
    noteCount: noteCount?.count ?? 0,
  };
}

export async function createIssue(
  data: { title: string; description?: string | null; contactId?: number | null; assignedUserId?: number | null; priority?: string; status?: string; associationId?: number | null; unitId?: number | null },
  userId?: number,
): Promise<IssueWithDetails> {
  const [issue] = await db.insert(issues).values({
    title: data.title,
    description: data.description ?? null,
    contactId: data.contactId ?? null,
    associationId: data.associationId ?? null,
    unitId: data.unitId ?? null,
    assignedUserId: data.assignedUserId ?? null,
    createdByUserId: userId ?? null,
    priority: data.priority ?? 'Normal',
    status: data.status ?? 'Open',
  }).returning();

  await storage.logActivity({
    entityType: 'issue',
    entityId: issue.id,
    action: 'created',
    userId: userId ?? null,
    metadata: { title: issue.title },
  });

  return enrichIssue(issue);
}

export async function updateIssue(
  id: number,
  updates: Partial<{ title: string; description: string | null; contactId: number | null; assignedUserId: number | null; priority: string; status: string; associationId: number | null; unitId: number | null }>,
  userId?: number,
): Promise<IssueWithDetails | null> {
  const [current] = await db.select().from(issues).where(eq(issues.id, id));
  if (!current) return null;

  await db.update(issues)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(issues.id, id));

  if (updates.status && updates.status !== current.status) {
    await storage.logActivity({
      entityType: 'issue',
      entityId: id,
      action: 'status_changed',
      userId: userId ?? null,
      metadata: { from: current.status, to: updates.status },
    });

    if (updates.status === 'Resolved' || updates.status === 'Closed') {
      await db.update(issues).set({ closedAt: new Date() }).where(eq(issues.id, id));
    } else {
      await db.update(issues).set({ closedAt: null }).where(eq(issues.id, id));
    }
  }

  const [final] = await db.select().from(issues).where(eq(issues.id, id));
  return enrichIssue(final);
}

export async function getIssueWithDetails(id: number): Promise<IssueWithDetails | null> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, id));
  if (!issue) return null;
  return enrichIssue(issue);
}
