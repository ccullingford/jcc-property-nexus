import { db } from "../db";
import { contacts, contactEmails, contactPhones, contactImportJobs } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { normalizeEmail, normalizePhone } from "./contactIdentityService";

export interface FieldMapping {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  primaryEmail?: string;
  secondaryEmail?: string;
  primaryPhone?: string;
  secondaryPhone?: string;
  contactType?: string;
  notes?: string;
}

export type ImportMode = "create" | "update" | "upsert";

interface PhoneEntry {
  phoneNumber: string;
  label: string;
}

export interface ImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  displayName: string;
  firstName?: string;
  lastName?: string;
  emails: string[];
  phoneEntries: PhoneEntry[];
  contactType?: string;
  notes?: string;
}

export interface PreviewRow {
  rowIndex: number;
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  contactType?: string;
  error?: string;
  isDuplicateInFile?: boolean;
  existingContactId?: number;
}

export interface PreviewResult {
  valid: PreviewRow[];
  invalid: PreviewRow[];
  duplicatesInFile: PreviewRow[];
  existingMatches: PreviewRow[];
  totalRows: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { rowIndex: number; error: string }[];
  jobId?: number;
}

const VALID_CONTACT_TYPES = ["Owner", "Tenant", "Vendor", "Board", "Realtor", "Attorney", "Other"];

const PHONE_LABEL_RE = /^(phone|office|mobile|cell|home|work|fax|other|direct|main|hoa|toll.?free)\s*:\s*/i;

function splitMultiValue(raw: string): string[] {
  return raw
    .split(/[;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePhoneEntry(raw: string): PhoneEntry {
  const match = raw.match(PHONE_LABEL_RE);
  if (match) {
    const word = match[1].trim();
    const label = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    return { phoneNumber: raw.slice(match[0].length).trim(), label };
  }
  return { phoneNumber: raw, label: "Mobile" };
}

function parsePhones(raw: string): PhoneEntry[] {
  return splitMultiValue(raw)
    .map(parsePhoneEntry)
    .map(e => ({ ...e, phoneNumber: normalizePhone(e.phoneNumber) ?? "" }))
    .filter(e => e.phoneNumber);
}

function mapRow(raw: Record<string, string>, mapping: FieldMapping, rowIndex: number): ImportRow {
  const get = (field: keyof FieldMapping) => {
    const col = mapping[field];
    return col ? (raw[col] ?? "").trim() : "";
  };

  const firstName = get("firstName");
  const lastName = get("lastName");
  let displayName = get("displayName");
  if (!displayName && (firstName || lastName)) {
    displayName = [firstName, lastName].filter(Boolean).join(" ");
  }

  const emailsRaw = [get("primaryEmail"), get("secondaryEmail")].filter(Boolean).join(";");
  const phonesRaw = [get("primaryPhone"), get("secondaryPhone")].filter(Boolean).join(";");

  const emails = splitMultiValue(emailsRaw)
    .filter(validateEmail)
    .map(normalizeEmail);

  const phoneEntries = parsePhones(phonesRaw);

  return {
    rowIndex,
    raw,
    displayName,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    emails,
    phoneEntries,
    contactType: get("contactType") || undefined,
    notes: get("notes") || undefined,
  };
}

export async function previewImport(
  rows: Record<string, string>[],
  mapping: FieldMapping
): Promise<PreviewResult> {
  const valid: PreviewRow[] = [];
  const invalid: PreviewRow[] = [];
  const duplicatesInFile: PreviewRow[] = [];
  const existingMatches: PreviewRow[] = [];

  const seenEmails = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = mapRow(rows[i], mapping, i);
    const preview: PreviewRow = {
      rowIndex: i,
      displayName: row.displayName,
      primaryEmail: row.emails[0],
      primaryPhone: row.phoneEntries[0]?.phoneNumber,
      contactType: row.contactType,
    };

    if (!row.displayName) {
      invalid.push({ ...preview, error: "Missing display name (and no first/last name to build from)" });
      continue;
    }

    const rawEmailField = mapping.primaryEmail ? (rows[i][mapping.primaryEmail] ?? "").trim() : "";
    const invalidEmails = splitMultiValue(rawEmailField).filter(e => e && !validateEmail(e));
    if (invalidEmails.length > 0) {
      invalid.push({ ...preview, error: `Invalid email(s): ${invalidEmails.join(", ")}` });
      continue;
    }

    let isDup = false;
    for (const email of row.emails) {
      if (seenEmails.has(email)) {
        duplicatesInFile.push({ ...preview, isDuplicateInFile: true, error: `Duplicate of row ${seenEmails.get(email)! + 1}` });
        isDup = true;
        break;
      }
      seenEmails.set(email, i);
    }
    if (isDup) continue;

    if (row.emails.length > 0) {
      const existing = await db.select({ id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.primaryEmail, row.emails))
        .limit(1);
      if (existing.length > 0) {
        existingMatches.push({ ...preview, existingContactId: existing[0].id });
        valid.push({ ...preview, existingContactId: existing[0].id });
        continue;
      }

      const emailMatch = await db.select({ contactId: contactEmails.contactId })
        .from(contactEmails)
        .where(inArray(contactEmails.email, row.emails))
        .limit(1);
      if (emailMatch.length > 0) {
        existingMatches.push({ ...preview, existingContactId: emailMatch[0].contactId });
        valid.push({ ...preview, existingContactId: emailMatch[0].contactId });
        continue;
      }
    }

    if (row.contactType && !VALID_CONTACT_TYPES.includes(row.contactType)) {
      preview.contactType = "Other";
    }

    valid.push(preview);
  }

  return { valid, invalid, duplicatesInFile, existingMatches, totalRows: rows.length };
}

export async function executeImport(
  rows: Record<string, string>[],
  mapping: FieldMapping,
  mode: ImportMode,
  userId: number,
  filename: string
): Promise<ImportResult> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { rowIndex: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = mapRow(rows[i], mapping, i);

    if (!row.displayName) {
      errors.push({ rowIndex: i, error: "Missing display name" });
      continue;
    }

    const rawEmailField = mapping.primaryEmail ? (rows[i][mapping.primaryEmail] ?? "").trim() : "";
    const invalidEmails = splitMultiValue(rawEmailField).filter(e => e && !validateEmail(e));
    if (invalidEmails.length > 0) {
      errors.push({ rowIndex: i, error: `Invalid email(s): ${invalidEmails.join(", ")}` });
      continue;
    }

    try {
      const primaryEmail = row.emails[0] ?? null;
      const primaryPhone = row.phoneEntries[0]?.phoneNumber ?? null;

      let existingId: number | null = null;

      if (row.emails.length > 0 && (mode === "update" || mode === "upsert")) {
        const match = await db.select({ id: contacts.id })
          .from(contacts)
          .where(inArray(contacts.primaryEmail, row.emails))
          .limit(1);
        if (match.length > 0) existingId = match[0].id;

        if (!existingId) {
          const emailMatch = await db.select({ contactId: contactEmails.contactId })
            .from(contactEmails)
            .where(inArray(contactEmails.email, row.emails))
            .limit(1);
          if (emailMatch.length > 0) existingId = emailMatch[0].contactId;
        }
      }

      const contactData = {
        displayName: row.displayName,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        contactType: (row.contactType && VALID_CONTACT_TYPES.includes(row.contactType)) ? row.contactType : "Other",
        primaryEmail,
        primaryPhone,
        notes: row.notes ?? null,
      };

      if (existingId) {
        await db.update(contacts).set({ ...contactData, updatedAt: new Date() }).where(eq(contacts.id, existingId));
        await upsertEmailsAndPhones(existingId, row.emails, row.phoneEntries);
        updated++;
      } else if (mode === "update") {
        skipped++;
      } else {
        const [created] = await db.insert(contacts).values(contactData).returning({ id: contacts.id });
        await upsertEmailsAndPhones(created.id, row.emails, row.phoneEntries);
        imported++;
      }
    } catch (err: any) {
      errors.push({ rowIndex: i, error: err.message ?? "Unknown error" });
    }
  }

  const [job] = await db.insert(contactImportJobs).values({
    uploadedByUserId: userId,
    filename,
    rowCount: rows.length,
    importedCount: imported,
    updatedCount: updated,
    skippedCount: skipped,
    errorCount: errors.length,
    status: "done",
    completedAt: new Date(),
  }).returning({ id: contactImportJobs.id });

  return { imported, updated, skipped, errors, jobId: job.id };
}

async function upsertEmailsAndPhones(
  contactId: number,
  emails: string[],
  phoneEntries: PhoneEntry[],
): Promise<void> {
  for (let idx = 0; idx < emails.length; idx++) {
    const email = emails[idx];
    const isPrimary = idx === 0;
    const existing = await db.select({ id: contactEmails.id })
      .from(contactEmails)
      .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.email, email)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(contactEmails).values({ contactId, email, isPrimary });
    }
  }

  for (let idx = 0; idx < phoneEntries.length; idx++) {
    const { phoneNumber, label } = phoneEntries[idx];
    const isPrimary = idx === 0;
    const existing = await db.select({ id: contactPhones.id })
      .from(contactPhones)
      .where(and(eq(contactPhones.contactId, contactId), eq(contactPhones.phoneNumber, phoneNumber)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(contactPhones).values({ contactId, phoneNumber, label, isPrimary });
    }
  }
}
