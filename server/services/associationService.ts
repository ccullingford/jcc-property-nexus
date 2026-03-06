import { db } from "../db";
import { associations, units, contacts, issues } from "@shared/schema";
import { eq, ilike, and, sql, count } from "drizzle-orm";
import type { InsertAssociation, Association } from "@shared/schema";

export interface AssociationWithStats extends Association {
  unitCount: number;
  contactCount: number;
  openIssueCount: number;
}

export interface AssociationFilters {
  q?: string;
  isActive?: boolean;
}

export async function listAssociations(filters: AssociationFilters = {}): Promise<AssociationWithStats[]> {
  let rows: Association[];

  if (filters.q && filters.q.trim().length > 0) {
    const pattern = `%${filters.q.trim()}%`;
    rows = await db.select().from(associations).where(
      ilike(associations.name, pattern)
    ).orderBy(associations.name);
  } else {
    rows = await db.select().from(associations).orderBy(associations.name);
  }

  if (filters.isActive !== undefined) {
    rows = rows.filter(a => a.isActive === filters.isActive);
  }

  return Promise.all(rows.map(async (assoc) => {
    const [unitResult] = await db
      .select({ count: count() })
      .from(units)
      .where(eq(units.associationId, assoc.id));

    const [contactResult] = await db
      .select({ count: count() })
      .from(contacts)
      .where(eq(contacts.associationId, assoc.id));

    const [issueResult] = await db
      .select({ count: count() })
      .from(issues)
      .where(and(
        eq(issues.associationId, assoc.id),
        sql`${issues.status} NOT IN ('Resolved', 'Closed')`
      ));

    return {
      ...assoc,
      unitCount: unitResult?.count ?? 0,
      contactCount: contactResult?.count ?? 0,
      openIssueCount: issueResult?.count ?? 0,
    };
  }));
}

export async function getAssociation(id: number): Promise<AssociationWithStats | null> {
  const rows = await db.select().from(associations).where(eq(associations.id, id)).limit(1);
  if (!rows.length) return null;
  const assoc = rows[0];

  const [unitResult] = await db
    .select({ count: count() })
    .from(units)
    .where(eq(units.associationId, assoc.id));

  const [contactResult] = await db
    .select({ count: count() })
    .from(contacts)
    .where(eq(contacts.associationId, assoc.id));

  const [issueResult] = await db
    .select({ count: count() })
    .from(issues)
    .where(and(
      eq(issues.associationId, assoc.id),
      sql`${issues.status} NOT IN ('Resolved', 'Closed')`
    ));

  return {
    ...assoc,
    unitCount: unitResult?.count ?? 0,
    contactCount: contactResult?.count ?? 0,
    openIssueCount: issueResult?.count ?? 0,
  };
}

export async function getAssociationUnits(associationId: number) {
  return db.select().from(units).where(eq(units.associationId, associationId)).orderBy(units.unitNumber);
}

export async function createAssociation(data: InsertAssociation): Promise<Association> {
  const [row] = await db.insert(associations).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row;
}

export async function updateAssociation(id: number, data: Partial<InsertAssociation>): Promise<Association | null> {
  const [row] = await db
    .update(associations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(associations.id, id))
    .returning();
  return row ?? null;
}
