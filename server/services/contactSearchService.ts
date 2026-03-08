import { db } from "../db";
import { contacts, contactEmails, contactPhones, threadContacts, issues, associations } from "@shared/schema";
import { eq, ilike, or, inArray, and, ne, sql } from "drizzle-orm";

import type { ContactWithDetails } from "@shared/routes";

export interface ContactFilters {
  q?: string;
  contactType?: string;
  hasThreads?: boolean;
  hasOpenIssues?: boolean;
  associationId?: number;
}

async function enrichContacts(rows: typeof contacts.$inferSelect[]): Promise<ContactWithDetails[]> {
  if (!rows.length) return [];
  const ids = rows.map(c => c.id);
  const assocIds = rows.map(c => c.associationId).filter(Boolean) as number[];

  const [phones, emails, threadRows, assocRows] = await Promise.all([
    db.select().from(contactPhones).where(inArray(contactPhones.contactId, ids)),
    db.select().from(contactEmails).where(inArray(contactEmails.contactId, ids)),
    db.select({ contactId: threadContacts.contactId })
      .from(threadContacts)
      .where(inArray(threadContacts.contactId, ids)),
    assocIds.length > 0
      ? db.select().from(associations).where(inArray(associations.id, assocIds))
      : Promise.resolve([]),
  ]);

  const threadCounts = new Map<number, number>();
  for (const r of threadRows) {
    if (r.contactId) {
      threadCounts.set(r.contactId, (threadCounts.get(r.contactId) ?? 0) + 1);
    }
  }

  const assocMap = new Map<number, string>();
  for (const a of assocRows) {
    assocMap.set(a.id, a.name);
  }

  return rows.map(c => ({
    ...c,
    phones: phones.filter(p => p.contactId === c.id),
    emails: emails.filter(e => e.contactId === c.id),
    threadCount: threadCounts.get(c.id) ?? 0,
    associationName: c.associationId ? assocMap.get(c.associationId) : null,
  }));
}

export async function searchContacts(queryOrFilters?: string | ContactFilters): Promise<ContactWithDetails[]> {
  const filters: ContactFilters = typeof queryOrFilters === "string"
    ? { q: queryOrFilters }
    : (queryOrFilters ?? {});

  const { q, contactType, hasThreads, hasOpenIssues } = filters;

  let rows: typeof contacts.$inferSelect[];

  if (!q || q.trim().length === 0) {
    rows = await db.select().from(contacts).orderBy(contacts.displayName);
  } else {
    const pattern = `%${q.trim()}%`;
    const byName = await db.select().from(contacts).where(ilike(contacts.displayName, pattern));
    const byEmail = await db
      .select({ contact: contacts })
      .from(contactEmails)
      .innerJoin(contacts, eq(contactEmails.contactId, contacts.id))
      .where(ilike(contactEmails.email, pattern));
    const byPrimaryEmail = await db.select().from(contacts).where(ilike(contacts.primaryEmail, pattern));
    const byPhone = await db
      .select({ contact: contacts })
      .from(contactPhones)
      .innerJoin(contacts, eq(contactPhones.contactId, contacts.id))
      .where(ilike(contactPhones.phoneNumber, pattern));
    const byPrimaryPhone = await db.select().from(contacts).where(ilike(contacts.primaryPhone, pattern));

    const seen = new Set<number>();
    rows = [];
    for (const c of [
      ...byName,
      ...byEmail.map(r => r.contact),
      ...byPrimaryEmail,
      ...byPhone.map(r => r.contact),
      ...byPrimaryPhone,
    ]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        rows.push(c);
      }
    }
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Apply contactType filter
  if (contactType && contactType !== "all") {
    rows = rows.filter(c => c.contactType === contactType);
  }

  // Apply hasThreads filter
  if (hasThreads) {
    const linkedContactIds = await db
      .selectDistinct({ contactId: threadContacts.contactId })
      .from(threadContacts);
    const linkedSet = new Set(linkedContactIds.map(r => r.contactId));
    rows = rows.filter(c => linkedSet.has(c.id));
  }

  // Apply hasOpenIssues filter
  if (hasOpenIssues) {
    const issueRows = await db
      .selectDistinct({ contactId: issues.contactId })
      .from(issues)
      .where(and(
        ne(issues.status, "Resolved"),
        ne(issues.status, "Closed")
      ));
    const issueSet = new Set(issueRows.map(r => r.contactId).filter(Boolean) as number[]);
    rows = rows.filter(c => issueSet.has(c.id));
  }

  // Apply associationId filter
  if (filters.associationId) {
    rows = rows.filter(c => c.associationId === filters.associationId);
  }

  return enrichContacts(rows);
}

export async function getContactWithDetails(id: number): Promise<ContactWithDetails | null> {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!rows.length) return null;
  const enriched = await enrichContacts(rows);
  return enriched[0];
}
