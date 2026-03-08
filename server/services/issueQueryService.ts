import { db } from '../db';
import { issues, users, contacts, tasks, notes, issueThreads } from '../../shared/schema';
import { eq, sql, and, inArray, SQL } from 'drizzle-orm';
import { IssueWithDetails } from '../../shared/routes';

interface IssueFilters {
  status?: string;
  priority?: string;
  openOnly?: boolean;
  closedOnly?: boolean;
  contactId?: number;
  associationId?: number;
  unitId?: number;
}

export async function listIssues(filters: IssueFilters = {}): Promise<IssueWithDetails[]> {
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(issues.status, filters.status));
  }
  if (filters.priority) {
    conditions.push(eq(issues.priority, filters.priority));
  }
  if (filters.openOnly) {
    conditions.push(inArray(issues.status, ['Open', 'In Progress', 'Waiting']));
  }
  if (filters.closedOnly) {
    conditions.push(inArray(issues.status, ['Resolved', 'Closed']));
  }
  if (filters.contactId) {
    conditions.push(eq(issues.contactId, filters.contactId));
  }
  if (filters.associationId) {
    conditions.push(eq(issues.associationId, filters.associationId));
  }
  if (filters.unitId) {
    conditions.push(eq(issues.unitId, filters.unitId));
  }

  const rows = conditions.length > 0
    ? await db.select().from(issues).where(and(...conditions)).orderBy(issues.createdAt)
    : await db.select().from(issues).orderBy(issues.createdAt);

  return Promise.all(rows.map(async (issue) => {
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
      const [c] = await db.select().from(contacts).where(eq(contacts.id, issue.contactId));
      if (c) contactName = c.displayName;
    }

    let assigneeName: string | null = null;
    if (issue.assignedUserId) {
      const [u] = await db.select().from(users).where(eq(users.id, issue.assignedUserId));
      if (u) assigneeName = u.name || u.email;
    }

    return {
      ...issue,
      contactName,
      assigneeName,
      threadCount: threadCount?.count ?? 0,
      taskCount: taskCount?.count ?? 0,
      noteCount: noteCount?.count ?? 0,
    };
  }));
}
