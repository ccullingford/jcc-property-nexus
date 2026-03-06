import { db } from "../db";
import {
  contacts, contactPhones, contactEmails, threadContacts, emailThreads,
  type InsertContact, type InsertContactPhone, type InsertContactEmail,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { normalizeEmail, normalizePhone } from "./contactIdentityService";
import { getContactWithDetails } from "./contactSearchService";
import type { ContactWithDetails, ThreadContactWithContact } from "@shared/routes";

export async function createContact(data: InsertContact): Promise<ContactWithDetails> {
  const normalized: InsertContact = {
    ...data,
    primaryEmail: data.primaryEmail ? normalizeEmail(data.primaryEmail) : undefined,
    primaryPhone: data.primaryPhone ? normalizePhone(data.primaryPhone) : undefined,
  };
  const [contact] = await db.insert(contacts).values(normalized).returning();
  if (normalized.primaryEmail) {
    await db.insert(contactEmails).values({
      contactId: contact.id,
      email: normalized.primaryEmail,
      isPrimary: true,
    });
  }
  if (normalized.primaryPhone) {
    await db.insert(contactPhones).values({
      contactId: contact.id,
      phoneNumber: normalized.primaryPhone,
      isPrimary: true,
    });
  }
  return (await getContactWithDetails(contact.id))!;
}

export async function updateContact(id: number, data: Partial<InsertContact>): Promise<ContactWithDetails | null> {
  const normalized: Partial<InsertContact> = {
    ...data,
    primaryEmail: data.primaryEmail ? normalizeEmail(data.primaryEmail) : data.primaryEmail,
    primaryPhone: data.primaryPhone ? normalizePhone(data.primaryPhone) : data.primaryPhone,
    updatedAt: new Date(),
  } as Partial<InsertContact> & { updatedAt: Date };
  await db.update(contacts).set(normalized).where(eq(contacts.id, id));
  return getContactWithDetails(id);
}

export async function addContactPhone(contactId: number, data: Omit<InsertContactPhone, "contactId">): Promise<typeof contactPhones.$inferSelect> {
  const normalized = normalizePhone(data.phoneNumber);
  const [row] = await db.insert(contactPhones).values({
    contactId,
    phoneNumber: normalized,
    label: data.label,
    isPrimary: data.isPrimary ?? false,
  }).returning();
  return row;
}

export async function addContactEmail(contactId: number, data: Omit<InsertContactEmail, "contactId">): Promise<typeof contactEmails.$inferSelect> {
  const normalized = normalizeEmail(data.email);
  const [row] = await db.insert(contactEmails).values({
    contactId,
    email: normalized,
    isPrimary: data.isPrimary ?? false,
  }).returning();
  return row;
}

export async function linkThreadContact(
  threadId: number,
  contactId: number,
  relationshipType?: string,
): Promise<ThreadContactWithContact> {
  const existing = await db
    .select()
    .from(threadContacts)
    .where(and(eq(threadContacts.threadId, threadId), eq(threadContacts.contactId, contactId)))
    .limit(1);
  let tc: typeof threadContacts.$inferSelect;
  if (existing.length) {
    tc = existing[0];
  } else {
    [tc] = await db.insert(threadContacts).values({ threadId, contactId, relationshipType }).returning();
  }
  await db.update(emailThreads).set({ contactId }).where(eq(emailThreads.id, threadId));
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  return { ...tc, contact };
}

export async function unlinkThreadContact(threadId: number, contactId: number): Promise<void> {
  await db
    .delete(threadContacts)
    .where(and(eq(threadContacts.threadId, threadId), eq(threadContacts.contactId, contactId)));
  const remaining = await db
    .select()
    .from(threadContacts)
    .where(eq(threadContacts.threadId, threadId))
    .limit(1);
  if (!remaining.length) {
    await db.update(emailThreads).set({ contactId: null }).where(eq(emailThreads.id, threadId));
  } else {
    await db.update(emailThreads).set({ contactId: remaining[0].contactId }).where(eq(emailThreads.id, threadId));
  }
}

export async function getThreadContacts(threadId: number): Promise<ThreadContactWithContact[]> {
  const rows = await db
    .select({ tc: threadContacts, contact: contacts })
    .from(threadContacts)
    .innerJoin(contacts, eq(threadContacts.contactId, contacts.id))
    .where(eq(threadContacts.threadId, threadId));
  return rows.map(r => ({ ...r.tc, contact: r.contact }));
}
