import { db } from "../db";
import { contacts, contactEmails, contactPhones, threadContacts, contactMergeLog, issues, tasks, calls } from "@shared/schema";
import { eq, and, ne, sql, inArray } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import { normalizeEmail } from "./contactIdentityService";

export interface DuplicatePair {
  contact: Contact & { threadCount: number; emailList: string[] };
  duplicate: Contact & { threadCount: number; emailList: string[] };
  signal: string;
}

async function enrichContact(c: Contact): Promise<Contact & { threadCount: number; emailList: string[] }> {
  const emailRows = await db.select({ email: contactEmails.email })
    .from(contactEmails)
    .where(eq(contactEmails.contactId, c.id));

  const threadRows = await db.select({ threadId: threadContacts.threadId })
    .from(threadContacts)
    .where(eq(threadContacts.contactId, c.id));

  return {
    ...c,
    threadCount: threadRows.length,
    emailList: [
      ...(c.primaryEmail ? [c.primaryEmail] : []),
      ...emailRows.map(r => r.email).filter(e => e !== c.primaryEmail),
    ],
  };
}

export async function findDuplicates(): Promise<DuplicatePair[]> {
  // Find contacts with same normalized primary email
  const allContacts = await db.select().from(contacts).orderBy(contacts.id);

  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  // Group by normalized primaryEmail
  const byEmail = new Map<string, Contact[]>();
  for (const c of allContacts) {
    if (c.primaryEmail) {
      const key = normalizeEmail(c.primaryEmail);
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(c);
    }
  }

  for (const [email, group] of Array.from(byEmail.entries())) {
    if (group.length < 2) continue;
    // Emit all unique pairs
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pairKey = `${group[i].id}-${group[j].id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const [a, b] = await Promise.all([enrichContact(group[i]), enrichContact(group[j])]);
        pairs.push({ contact: a, duplicate: b, signal: `Same email: ${email}` });
      }
    }
  }

  // Also check contact_emails table for cross-contact duplicates
  const emailTableRows = await db.select({
    contactId: contactEmails.contactId,
    email: contactEmails.email,
  }).from(contactEmails);

  const emailToContacts = new Map<string, number[]>();
  for (const row of emailTableRows) {
    const key = normalizeEmail(row.email);
    if (!emailToContacts.has(key)) emailToContacts.set(key, []);
    emailToContacts.get(key)!.push(row.contactId);
  }

  for (const [email, contactIds] of Array.from(emailToContacts.entries())) {
    const unique = Array.from(new Set(contactIds));
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const pairKey = `${unique[i]}-${unique[j]}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const [ca, cb] = await Promise.all([
          db.select().from(contacts).where(eq(contacts.id, unique[i])).limit(1),
          db.select().from(contacts).where(eq(contacts.id, unique[j])).limit(1),
        ]);
        if (ca.length && cb.length) {
          const [a, b] = await Promise.all([enrichContact(ca[0]), enrichContact(cb[0])]);
          pairs.push({ contact: a, duplicate: b, signal: `Shared email in contact list: ${email}` });
        }
      }
    }
  }

  return pairs;
}

export async function mergeContacts(
  sourceId: number,
  targetId: number,
  mergedByUserId: number
): Promise<Contact> {
  if (sourceId === targetId) throw new Error("Cannot merge a contact with itself");

  const [source] = await db.select().from(contacts).where(eq(contacts.id, sourceId)).limit(1);
  const [target] = await db.select().from(contacts).where(eq(contacts.id, targetId)).limit(1);

  if (!source) throw new Error(`Source contact ${sourceId} not found`);
  if (!target) throw new Error(`Target contact ${targetId} not found`);

  // 1. Re-link thread_contacts from source → target (skip duplicates)
  const sourceThreadLinks = await db.select().from(threadContacts).where(eq(threadContacts.contactId, sourceId));
  const targetThreadLinks = await db.select({ threadId: threadContacts.threadId })
    .from(threadContacts).where(eq(threadContacts.contactId, targetId));
  const targetThreadIds = new Set(targetThreadLinks.map(r => r.threadId));

  for (const link of sourceThreadLinks) {
    if (!targetThreadIds.has(link.threadId)) {
      await db.update(threadContacts)
        .set({ contactId: targetId })
        .where(and(eq(threadContacts.contactId, sourceId), eq(threadContacts.threadId, link.threadId)));
    } else {
      await db.delete(threadContacts)
        .where(and(eq(threadContacts.contactId, sourceId), eq(threadContacts.threadId, link.threadId)));
    }
  }

  // 2. Copy contact_emails from source → target (skip duplicates)
  const sourceEmails = await db.select().from(contactEmails).where(eq(contactEmails.contactId, sourceId));
  const targetEmails = await db.select({ email: contactEmails.email })
    .from(contactEmails).where(eq(contactEmails.contactId, targetId));
  const targetEmailSet = new Set(targetEmails.map(r => r.email));

  for (const emailRow of sourceEmails) {
    if (!targetEmailSet.has(emailRow.email)) {
      await db.insert(contactEmails).values({
        contactId: targetId,
        email: emailRow.email,
        isPrimary: false,
      });
    }
  }

  // 3. Copy contact_phones from source → target (skip duplicates)
  const sourcePhones = await db.select().from(contactPhones).where(eq(contactPhones.contactId, sourceId));
  const targetPhones = await db.select({ phoneNumber: contactPhones.phoneNumber })
    .from(contactPhones).where(eq(contactPhones.contactId, targetId));
  const targetPhoneSet = new Set(targetPhones.map(r => r.phoneNumber));

  for (const phoneRow of sourcePhones) {
    if (!targetPhoneSet.has(phoneRow.phoneNumber)) {
      await db.insert(contactPhones).values({
        contactId: targetId,
        phoneNumber: phoneRow.phoneNumber,
        label: phoneRow.label,
        isPrimary: false,
      });
    }
  }

  // 4. Re-link issues, tasks, calls
  await db.update(issues).set({ contactId: targetId }).where(eq(issues.contactId, sourceId));
  await db.update(tasks).set({ contactId: targetId }).where(eq(tasks.contactId, sourceId));
  await db.update(calls).set({ contactId: targetId }).where(eq(calls.contactId, sourceId));

  // 5. Log the merge
  await db.insert(contactMergeLog).values({
    sourceContactId: sourceId,
    targetContactId: targetId,
    mergedByUserId,
    mergedAt: new Date(),
  });

  // 6. Delete source contact (cascade handled above)
  await db.delete(contactEmails).where(eq(contactEmails.contactId, sourceId));
  await db.delete(contactPhones).where(eq(contactPhones.contactId, sourceId));
  await db.delete(contacts).where(eq(contacts.id, sourceId));

  // 7. Return updated target
  const [updated] = await db.select().from(contacts).where(eq(contacts.id, targetId)).limit(1);
  return updated;
}
