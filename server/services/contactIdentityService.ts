import { db } from "../db";
import { contacts, contactEmails, contactPhones } from "@shared/schema";
import { eq, ilike, or } from "drizzle-orm";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return raw.trim();
}

export async function findContactByEmail(email: string): Promise<typeof contacts.$inferSelect | null> {
  const normalized = normalizeEmail(email);
  const rows = await db
    .select({ contact: contacts })
    .from(contactEmails)
    .innerJoin(contacts, eq(contactEmails.contactId, contacts.id))
    .where(eq(contactEmails.email, normalized))
    .limit(1);
  if (rows.length) return rows[0].contact;
  const direct = await db
    .select()
    .from(contacts)
    .where(eq(contacts.primaryEmail, normalized))
    .limit(1);
  return direct[0] ?? null;
}

export async function findContactByPhone(phone: string): Promise<typeof contacts.$inferSelect | null> {
  const normalized = normalizePhone(phone);
  const rows = await db
    .select({ contact: contacts })
    .from(contactPhones)
    .innerJoin(contacts, eq(contactPhones.contactId, contacts.id))
    .where(or(eq(contactPhones.phoneNumber, normalized), eq(contactPhones.phoneNumber, phone.trim())))
    .limit(1);
  if (rows.length) return rows[0].contact;
  const direct = await db
    .select()
    .from(contacts)
    .where(or(eq(contacts.primaryPhone, normalized), eq(contacts.primaryPhone, phone.trim())))
    .limit(1);
  return direct[0] ?? null;
}
