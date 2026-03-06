import { db } from "../db";
import { contacts, contactEmails, contactPhones, contactImportJobs } from "@shared/schema";
import { eq, or } from "drizzle-orm";
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

export interface ImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  displayName: string;
  firstName?: string;
  lastName?: string;
  primaryEmail?: string;
  secondaryEmail?: string;
  primaryPhone?: string;
  secondaryPhone?: string;
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

  return {
    rowIndex,
    raw,
    displayName,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    primaryEmail: get("primaryEmail") || undefined,
    secondaryEmail: get("secondaryEmail") || undefined,
    primaryPhone: get("primaryPhone") || undefined,
    secondaryPhone: get("secondaryPhone") || undefined,
    contactType: get("contactType") || undefined,
    notes: get("notes") || undefined,
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
      primaryEmail: row.primaryEmail,
      primaryPhone: row.primaryPhone,
      contactType: row.contactType,
    };

    if (!row.displayName) {
      invalid.push({ ...preview, error: "Missing display name (and no first/last name to build from)" });
      continue;
    }

    if (row.primaryEmail && !validateEmail(row.primaryEmail)) {
      invalid.push({ ...preview, error: `Invalid email: ${row.primaryEmail}` });
      continue;
    }

    if (row.primaryEmail) {
      const normalized = normalizeEmail(row.primaryEmail);
      if (seenEmails.has(normalized)) {
        duplicatesInFile.push({ ...preview, isDuplicateInFile: true, error: `Duplicate of row ${seenEmails.get(normalized)! + 1}` });
        continue;
      }
      seenEmails.set(normalized, i);

      // Check DB match
      const existing = await db.select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.primaryEmail, normalized))
        .limit(1);
      if (existing.length > 0) {
        existingMatches.push({ ...preview, existingContactId: existing[0].id });
        valid.push({ ...preview, existingContactId: existing[0].id });
        continue;
      }
    }

    // Normalize contactType
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

    if (row.primaryEmail && !validateEmail(row.primaryEmail)) {
      errors.push({ rowIndex: i, error: `Invalid email: ${row.primaryEmail}` });
      continue;
    }

    try {
      const normalizedEmail = row.primaryEmail ? normalizeEmail(row.primaryEmail) : null;
      const normalizedPhone = row.primaryPhone ? normalizePhone(row.primaryPhone) : null;

      // Find existing by email
      let existingId: number | null = null;
      if (normalizedEmail && (mode === "update" || mode === "upsert")) {
        const match = await db.select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.primaryEmail, normalizedEmail))
          .limit(1);
        if (match.length > 0) existingId = match[0].id;
      }

      const contactData = {
        displayName: row.displayName,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        contactType: (row.contactType && VALID_CONTACT_TYPES.includes(row.contactType)) ? row.contactType : "Other",
        primaryEmail: normalizedEmail,
        primaryPhone: normalizedPhone,
        notes: row.notes ?? null,
      };

      if (existingId) {
        // Update existing
        await db.update(contacts).set({ ...contactData, updatedAt: new Date() }).where(eq(contacts.id, existingId));
        updated++;

        if (row.secondaryEmail && validateEmail(row.secondaryEmail)) {
          const secNorm = normalizeEmail(row.secondaryEmail);
          const exists = await db.select({ id: contactEmails.id }).from(contactEmails)
            .where(or(eq(contactEmails.contactId, existingId), eq(contactEmails.email, secNorm))).limit(1);
          if (exists.length === 0) {
            await db.insert(contactEmails).values({ contactId: existingId, email: secNorm, isPrimary: false });
          }
        }
      } else if (mode === "update") {
        // Update-only mode, no match found
        skipped++;
      } else {
        // Create
        const [created] = await db.insert(contacts).values(contactData).returning({ id: contacts.id });
        const newId = created.id;

        if (normalizedEmail) {
          await db.insert(contactEmails).values({ contactId: newId, email: normalizedEmail, isPrimary: true });
        }
        if (row.secondaryEmail && validateEmail(row.secondaryEmail)) {
          await db.insert(contactEmails).values({ contactId: newId, email: normalizeEmail(row.secondaryEmail), isPrimary: false });
        }
        if (normalizedPhone) {
          await db.insert(contactPhones).values({ contactId: newId, phoneNumber: normalizedPhone, label: "Mobile", isPrimary: true });
        }
        if (row.secondaryPhone) {
          const secPhone = normalizePhone(row.secondaryPhone);
          if (secPhone) {
            await db.insert(contactPhones).values({ contactId: newId, phoneNumber: secPhone, label: "Other", isPrimary: false });
          }
        }
        imported++;
      }
    } catch (err: any) {
      errors.push({ rowIndex: i, error: err.message ?? "Unknown error" });
    }
  }

  // Record import job
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
