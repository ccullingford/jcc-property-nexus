import { db } from "../db";
import { associations, units, contacts, contactEmails, contactPhones } from "@shared/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { normalizeEmail, normalizePhone } from "./contactIdentityService";
import { createAssociation } from "./associationService";
import { createUnit } from "./unitService";

export interface CombinedMapping {
  assocName?: string;
  assocCode?: string;
  assocAddress?: string;
  assocCity?: string;
  assocState?: string;
  assocPostalCode?: string;
  unitNumber?: string;
  unitBuilding?: string;
  unitAddress?: string;
  contactDisplayName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactType?: string;
  relationshipType?: string;
}

export interface CombinedRowResult {
  rowIndex: number;
  status: "created" | "updated" | "skipped" | "error";
  error?: string;
  assocAction?: "created" | "matched" | "updated";
  unitAction?: "created" | "matched" | "updated";
  contactAction?: "created" | "updated";
  assocName?: string;
  unitNumber?: string;
  contactName?: string;
}

export interface CombinedPreviewRow {
  rowIndex: number;
  assocName?: string;
  unitNumber?: string;
  contactName?: string;
  contactEmail?: string;
  relationshipType?: string;
  error?: string;
  warnings?: string[];
}

export interface CombinedPreviewResult {
  valid: CombinedPreviewRow[];
  errors: CombinedPreviewRow[];
  totalRows: number;
  uniqueAssocs: number;
  uniqueUnits: number;
  contactRows: number;
}

export interface CombinedExecuteResult {
  results: CombinedRowResult[];
  summary: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
}

const VALID_CONTACT_TYPES = [
  "Owner", "Tenant", "Vendor", "Board", "Realtor",
  "Attorney", "Property Manager", "Other",
];

const RELATIONSHIP_TO_CONTACT_TYPE: Record<string, string> = {
  owner: "Owner",
  tenant: "Tenant",
  vendor: "Vendor",
  board: "Board",
  "property manager": "Property Manager",
};

function get(row: Record<string, string>, col: string | undefined): string {
  if (!col) return "";
  return (row[col] ?? "").trim();
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitMultiValue(raw: string): string[] {
  return raw
    .split(/[;,|\/\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function resolveContactType(contactType: string, relType: string): string {
  if (contactType) {
    const match = VALID_CONTACT_TYPES.find(t => t.toLowerCase() === contactType.toLowerCase());
    if (match) return match;
  }
  if (relType) {
    const mapped = RELATIONSHIP_TO_CONTACT_TYPE[relType.toLowerCase()];
    if (mapped) return mapped;
  }
  return "Other";
}

export function previewCombined(
  rows: Record<string, string>[],
  mapping: CombinedMapping,
): CombinedPreviewResult {
  const valid: CombinedPreviewRow[] = [];
  const errors: CombinedPreviewRow[] = [];
  const seenAssocs = new Set<string>();
  const seenUnits = new Set<string>();
  let contactRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors: string[] = [];
    const warnings: string[] = [];

    const assocName = get(row, mapping.assocName);
    const unitNumber = get(row, mapping.unitNumber);
    const emailRaw = get(row, mapping.contactEmail);
    const emails = splitMultiValue(emailRaw);
    const firstEmail = emails[0] ?? "";
    const firstName = get(row, mapping.contactFirstName);
    const lastName = get(row, mapping.contactLastName);
    let contactName = get(row, mapping.contactDisplayName);
    if (!contactName && (firstName || lastName)) contactName = [firstName, lastName].filter(Boolean).join(" ");
    const relType = get(row, mapping.relationshipType);

    if (!assocName && !contactName && !firstEmail) {
      errors.push({ rowIndex: i, error: "Empty row — no association, name, or email found" });
      continue;
    }

    for (const email of emails) {
      if (!validateEmail(email)) rowErrors.push(`Invalid email: ${email}`);
    }

    if (unitNumber && !assocName) {
      warnings.push("Unit number provided but no association name — unit will be skipped");
    }

    if (relType && !RELATIONSHIP_TO_CONTACT_TYPE[relType.toLowerCase()]) {
      warnings.push(`Unknown relationship type "${relType}"`);
    }

    if (assocName) seenAssocs.add(assocName.toLowerCase());
    if (assocName && unitNumber) seenUnits.add(`${assocName.toLowerCase()}::${unitNumber}`);
    if (contactName || firstEmail) contactRows++;

    if (rowErrors.length > 0) {
      errors.push({ rowIndex: i, assocName, unitNumber, contactName, contactEmail: firstEmail, relationshipType: relType || undefined, error: rowErrors.join("; ") });
    } else {
      valid.push({ rowIndex: i, assocName, unitNumber, contactName, contactEmail: firstEmail, relationshipType: relType || undefined, warnings: warnings.length ? warnings : undefined });
    }
  }

  return {
    valid,
    errors,
    totalRows: rows.length,
    uniqueAssocs: seenAssocs.size,
    uniqueUnits: seenUnits.size,
    contactRows,
  };
}

export async function executeCombined(
  rows: Record<string, string>[],
  mapping: CombinedMapping,
): Promise<CombinedExecuteResult> {
  const results: CombinedRowResult[] = [];
  let created = 0, updated = 0, skipped = 0, errors = 0;

  const assocCache = new Map<string, number>();
  const unitCache = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result: CombinedRowResult = { rowIndex: i, status: "skipped" };

    try {
      const assocName = get(row, mapping.assocName);
      const assocCode = get(row, mapping.assocCode);
      const unitNumber = get(row, mapping.unitNumber);

      const emailRaw = get(row, mapping.contactEmail);
      const phoneRaw = get(row, mapping.contactPhone);
      const emails = splitMultiValue(emailRaw).filter(validateEmail).map(normalizeEmail);
      const phones = splitMultiValue(phoneRaw).map(normalizePhone).filter(Boolean) as string[];

      const firstName = get(row, mapping.contactFirstName);
      const lastName = get(row, mapping.contactLastName);
      let contactName = get(row, mapping.contactDisplayName);
      if (!contactName && (firstName || lastName)) contactName = [firstName, lastName].filter(Boolean).join(" ");
      const contactType = get(row, mapping.contactType);
      const relType = get(row, mapping.relationshipType);

      result.assocName = assocName || undefined;
      result.unitNumber = unitNumber || undefined;
      result.contactName = contactName || undefined;

      if (!assocName && !contactName && emails.length === 0) {
        result.status = "skipped";
        results.push(result);
        skipped++;
        continue;
      }

      // ── 1. ASSOCIATION ───────────────────────────────────────────────────────
      let assocId: number | null = null;

      if (assocName) {
        const cacheKey = assocName.toLowerCase();
        if (assocCache.has(cacheKey)) {
          assocId = assocCache.get(cacheKey)!;
          result.assocAction = "matched";
        } else {
          let existing = await db.select({ id: associations.id })
            .from(associations).where(eq(associations.name, assocName)).limit(1);
          if (existing.length === 0 && assocCode) {
            existing = await db.select({ id: associations.id })
              .from(associations).where(eq(associations.code, assocCode)).limit(1);
          }

          if (existing.length > 0) {
            assocId = existing[0].id;
            result.assocAction = "updated";
            const updateData: Record<string, any> = { updatedAt: new Date() };
            if (assocCode) updateData.code = assocCode;
            const addr = get(row, mapping.assocAddress);
            const city = get(row, mapping.assocCity);
            const state = get(row, mapping.assocState);
            const zip = get(row, mapping.assocPostalCode);
            if (addr) updateData.addressLine1 = addr;
            if (city) updateData.city = city;
            if (state) updateData.state = state;
            if (zip) updateData.postalCode = zip;
            await db.update(associations).set(updateData).where(eq(associations.id, assocId));
          } else {
            const newAssoc = await createAssociation({
              name: assocName,
              code: assocCode || null,
              addressLine1: get(row, mapping.assocAddress) || null,
              city: get(row, mapping.assocCity) || null,
              state: get(row, mapping.assocState) || null,
              postalCode: get(row, mapping.assocPostalCode) || null,
              isActive: true,
            } as any);
            assocId = newAssoc.id;
            result.assocAction = "created";
          }

          assocCache.set(cacheKey, assocId);
        }
      }

      // ── 2. UNIT ──────────────────────────────────────────────────────────────
      let unitId: number | null = null;

      if (unitNumber && assocId !== null) {
        const unitKey = `${assocId}::${unitNumber}`;
        if (unitCache.has(unitKey)) {
          unitId = unitCache.get(unitKey)!;
          result.unitAction = "matched";
        } else {
          const existing = await db.select({ id: units.id })
            .from(units)
            .where(and(eq(units.associationId, assocId), eq(units.unitNumber, unitNumber)))
            .limit(1);

          if (existing.length > 0) {
            unitId = existing[0].id;
            result.unitAction = "updated";
            const updateData: Record<string, any> = { updatedAt: new Date() };
            const bldg = get(row, mapping.unitBuilding);
            const addr = get(row, mapping.unitAddress);
            if (bldg) updateData.building = bldg;
            if (addr) updateData.streetAddress = addr;
            await db.update(units).set(updateData).where(eq(units.id, unitId));
          } else {
            const newUnit = await createUnit({
              associationId: assocId,
              unitNumber,
              building: get(row, mapping.unitBuilding) || null,
              streetAddress: get(row, mapping.unitAddress) || null,
              isActive: true,
            } as any);
            unitId = newUnit.id;
            result.unitAction = "created";
          }

          unitCache.set(unitKey, unitId);
        }
      }

      // ── 3. CONTACT ───────────────────────────────────────────────────────────
      if (contactName || emails.length > 0) {
        const primaryEmail = emails[0] ?? null;
        const primaryPhone = phones[0] ?? null;

        let existingId: number | null = null;

        if (emails.length > 0) {
          const match = await db.select({ id: contacts.id })
            .from(contacts)
            .where(inArray(contacts.primaryEmail, emails))
            .limit(1);
          if (match.length > 0) existingId = match[0].id;
        }

        if (!existingId && emails.length > 0) {
          const emailRows = await db.select({ contactId: contactEmails.contactId })
            .from(contactEmails)
            .where(inArray(contactEmails.email, emails))
            .limit(1);
          if (emailRows.length > 0) existingId = emailRows[0].contactId;
        }

        if (!existingId && phones.length > 0) {
          const match = await db.select({ id: contacts.id })
            .from(contacts)
            .where(inArray(contacts.primaryPhone, phones))
            .limit(1);
          if (match.length > 0) existingId = match[0].id;
        }

        if (!existingId && phones.length > 0) {
          const phoneRows = await db.select({ contactId: contactPhones.contactId })
            .from(contactPhones)
            .where(inArray(contactPhones.phoneNumber, phones))
            .limit(1);
          if (phoneRows.length > 0) existingId = phoneRows[0].contactId;
        }

        const resolvedType = resolveContactType(contactType, relType);

        const contactData = {
          displayName: contactName || primaryEmail!,
          firstName: firstName || null,
          lastName: lastName || null,
          contactType: resolvedType,
          primaryEmail,
          primaryPhone,
          associationId: assocId,
          unitId: unitId,
        };

        if (existingId) {
          await db.update(contacts)
            .set({ ...contactData, updatedAt: new Date() })
            .where(eq(contacts.id, existingId));

          await upsertEmailsAndPhones(existingId, emails, phones);

          result.contactAction = "updated";
          result.status = "updated";
          updated++;
        } else {
          const [newContact] = await db.insert(contacts).values(contactData).returning({ id: contacts.id });
          const newId = newContact.id;

          await upsertEmailsAndPhones(newId, emails, phones);

          result.contactAction = "created";
          result.status = "created";
          created++;
        }
      } else if (result.assocAction === "created" || result.unitAction === "created") {
        result.status = "created";
        created++;
      } else if (result.assocAction === "updated" || result.unitAction === "updated") {
        result.status = "updated";
        updated++;
      } else {
        result.status = "skipped";
        skipped++;
      }
    } catch (err: any) {
      result.status = "error";
      result.error = err.message ?? "Unknown error";
      errors++;
    }

    results.push(result);
  }

  return { results, summary: { created, updated, skipped, errors } };
}

async function upsertEmailsAndPhones(
  contactId: number,
  emails: string[],
  phones: string[],
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

  for (let idx = 0; idx < phones.length; idx++) {
    const phoneNumber = phones[idx];
    const isPrimary = idx === 0;
    const label = idx === 0 ? "Mobile" : "Other";
    const existing = await db.select({ id: contactPhones.id })
      .from(contactPhones)
      .where(and(eq(contactPhones.contactId, contactId), eq(contactPhones.phoneNumber, phoneNumber)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(contactPhones).values({ contactId, phoneNumber, label, isPrimary });
    }
  }
}
