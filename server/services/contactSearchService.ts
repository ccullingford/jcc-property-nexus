import { db } from "../db";
import { contacts, contactEmails, contactPhones, threadContacts, emailThreads } from "@shared/schema";
import { eq, ilike, or, inArray, sql } from "drizzle-orm";
import type { ContactWithDetails } from "@shared/routes";

async function enrichContacts(rows: typeof contacts.$inferSelect[]): Promise<ContactWithDetails[]> {
  if (!rows.length) return [];
  const ids = rows.map(c => c.id);
  const [phones, emails, threadRows] = await Promise.all([
    db.select().from(contactPhones).where(inArray(contactPhones.contactId, ids)),
    db.select().from(contactEmails).where(inArray(contactEmails.contactId, ids)),
    db.select({ contactId: threadContacts.contactId })
      .from(threadContacts)
      .where(inArray(threadContacts.contactId, ids)),
  ]);
  const threadCounts = new Map<number, number>();
  for (const r of threadRows) {
    threadCounts.set(r.contactId, (threadCounts.get(r.contactId) ?? 0) + 1);
  }
  return rows.map(c => ({
    ...c,
    phones: phones.filter(p => p.contactId === c.id),
    emails: emails.filter(e => e.contactId === c.id),
    threadCount: threadCounts.get(c.id) ?? 0,
  }));
}

export async function searchContacts(query?: string): Promise<ContactWithDetails[]> {
  if (!query || query.trim().length === 0) {
    const rows = await db.select().from(contacts).orderBy(contacts.displayName);
    return enrichContacts(rows);
  }
  const q = `%${query.trim()}%`;
  const byName = await db.select().from(contacts).where(ilike(contacts.displayName, q));
  const byEmail = await db
    .select({ contact: contacts })
    .from(contactEmails)
    .innerJoin(contacts, eq(contactEmails.contactId, contacts.id))
    .where(ilike(contactEmails.email, q));
  const byPrimaryEmail = await db.select().from(contacts).where(ilike(contacts.primaryEmail, q));
  const byPhone = await db
    .select({ contact: contacts })
    .from(contactPhones)
    .innerJoin(contacts, eq(contactPhones.contactId, contacts.id))
    .where(ilike(contactPhones.phoneNumber, q));
  const byPrimaryPhone = await db.select().from(contacts).where(ilike(contacts.primaryPhone, q));
  const seen = new Set<number>();
  const merged: typeof contacts.$inferSelect[] = [];
  for (const c of [
    ...byName,
    ...byEmail.map(r => r.contact),
    ...byPrimaryEmail,
    ...byPhone.map(r => r.contact),
    ...byPrimaryPhone,
  ]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      merged.push(c);
    }
  }
  merged.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return enrichContacts(merged);
}

export async function getContactWithDetails(id: number): Promise<ContactWithDetails | null> {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!rows.length) return null;
  const enriched = await enrichContacts(rows);
  return enriched[0];
}
