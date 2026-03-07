
  import { db } from "../db";
  import { associations, units } from "@shared/schema";
  import { eq, and, sql } from "drizzle-orm";
  import { createAssociation } from "./associationService";
  import { createUnit } from "./unitService";

  export async function importAssociations(rows: any[], mapping: Record<string, string>) {
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = row[mapping.name]?.trim();
      if (!name) {
        skipped++;
        continue;
      }

      const data = {
        name,
        code: row[mapping.code]?.trim() || null,
        addressLine1: row[mapping.addressLine1]?.trim() || null,
        city: row[mapping.city]?.trim() || null,
        state: row[mapping.state]?.trim() || null,
        postalCode: row[mapping.postalCode]?.trim() || null,
        notes: row[mapping.notes]?.trim() || null,
        isActive: true,
      };

      // Check if exists
      const [existing] = await db.select().from(associations).where(eq(associations.name, name)).limit(1);
      if (existing) {
        await db.update(associations).set({ ...data, updatedAt: new Date() }).where(eq(associations.id, existing.id));
        updated++;
      } else {
        await createAssociation(data as any);
        imported++;
      }
    }

    return { imported, updated, skipped };
  }

  export async function importUnits(rows: any[], mapping: Record<string, string>) {
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const assocName = row[mapping.associationName]?.trim();
      const unitNumber = row[mapping.unitNumber]?.trim();

      if (!assocName || !unitNumber) {
        skipped++;
        continue;
      }

      // Find or create association
      let assocId: number;
      const [existingAssoc] = await db.select().from(associations).where(eq(associations.name, assocName)).limit(1);
      if (existingAssoc) {
        assocId = existingAssoc.id;
      } else {
        const newAssoc = await createAssociation({ name: assocName, isActive: true } as any);
        assocId = newAssoc.id;
      }

      const data = {
        associationId: assocId,
        unitNumber,
        building: row[mapping.building]?.trim() || null,
        streetAddress: row[mapping.streetAddress]?.trim() || null,
        notes: row[mapping.notes]?.trim() || null,
        isActive: true,
      };

      // Check if unit exists in this association
      const [existingUnit] = await db.select()
        .from(units)
        .where(and(eq(units.associationId, assocId), eq(units.unitNumber, unitNumber)))
        .limit(1);

      if (existingUnit) {
        const { associationId, ...rest } = data;
        await db.update(units).set({ ...rest, updatedAt: new Date() }).where(eq(units.id, existingUnit.id));
        updated++;
      } else {
        await createUnit(data as any);
        imported++;
      }
    }

    return { imported, updated, skipped };
  }
  