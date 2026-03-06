import { db } from "../db";
import { units, associations, contacts, issues } from "@shared/schema";
import { eq, ilike, and } from "drizzle-orm";

export interface UnitData {
  associationId: number;
  unitNumber: string;
  building?: string | null;
  streetAddress?: string | null;
  notes?: string | null;
  isActive?: boolean;
  propertyId?: number | null;
}

export interface UnitWithAssociation {
  id: number;
  associationId: number | null;
  propertyId: number | null;
  unitNumber: string;
  building: string | null;
  streetAddress: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  associationName: string | null;
}

export interface UnitWithDetails extends UnitWithAssociation {
  linkedContacts: Array<{ id: number; displayName: string; contactType: string }>;
  openIssueCount: number;
}

export interface UnitFilters {
  associationId?: number;
  q?: string;
  isActive?: boolean;
}

export async function listUnits(filters: UnitFilters = {}): Promise<UnitWithAssociation[]> {
  const rows = await (filters.associationId
    ? filters.q
      ? db.select().from(units).where(and(eq(units.associationId, filters.associationId), ilike(units.unitNumber, `%${filters.q.trim()}%`))).orderBy(units.unitNumber)
      : db.select().from(units).where(eq(units.associationId, filters.associationId)).orderBy(units.unitNumber)
    : filters.q
      ? db.select().from(units).where(ilike(units.unitNumber, `%${filters.q.trim()}%`)).orderBy(units.unitNumber)
      : db.select().from(units).orderBy(units.unitNumber));

  const filtered = filters.isActive !== undefined ? rows.filter(u => u.isActive === filters.isActive) : rows;

  const assocIdSet = new Set<number>();
  for (const u of filtered) {
    if (u.associationId) assocIdSet.add(u.associationId);
  }
  const assocIds = Array.from(assocIdSet);

  const assocMap = new Map<number, string>();
  if (assocIds.length > 0) {
    const assocRows = await db.select({ id: associations.id, name: associations.name }).from(associations);
    for (const a of assocRows) assocMap.set(a.id, a.name);
  }

  return filtered.map(u => ({
    ...u,
    associationName: u.associationId ? (assocMap.get(u.associationId) ?? null) : null,
  }));
}

export async function getUnit(id: number): Promise<UnitWithDetails | null> {
  const rows = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!rows.length) return null;
  const unit = rows[0];

  let associationName: string | null = null;
  if (unit.associationId) {
    const assocRows = await db.select({ name: associations.name }).from(associations).where(eq(associations.id, unit.associationId));
    if (assocRows.length > 0) associationName = assocRows[0].name;
  }

  const linkedContacts = await db
    .select({ id: contacts.id, displayName: contacts.displayName, contactType: contacts.contactType })
    .from(contacts)
    .where(eq(contacts.unitId, id));

  const issueRows = await db
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.unitId, id));

  return {
    ...unit,
    associationName,
    linkedContacts,
    openIssueCount: issueRows.length,
  };
}

export async function createUnit(data: UnitData): Promise<typeof units.$inferSelect> {
  if (!data.associationId) {
    throw new Error("associationId is required to create a unit");
  }

  const assocRows = await db.select().from(associations).where(eq(associations.id, data.associationId)).limit(1);
  if (!assocRows.length) throw new Error("Association not found");

  const [row] = await db.insert(units).values({
    associationId: data.associationId,
    unitNumber: data.unitNumber,
    building: data.building ?? null,
    streetAddress: data.streetAddress ?? null,
    notes: data.notes ?? null,
    isActive: data.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row;
}

export async function updateUnit(id: number, data: Partial<UnitData>): Promise<typeof units.$inferSelect | null> {
  if (data.associationId !== undefined && data.associationId !== null) {
    const assocRows = await db.select().from(associations).where(eq(associations.id, data.associationId)).limit(1);
    if (!assocRows.length) throw new Error("Association not found");
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.associationId !== undefined) updateData.associationId = data.associationId;
  if (data.unitNumber !== undefined) updateData.unitNumber = data.unitNumber;
  if (data.building !== undefined) updateData.building = data.building;
  if (data.streetAddress !== undefined) updateData.streetAddress = data.streetAddress;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const result = await db
    .update(units)
    .set(updateData as any)
    .where(eq(units.id, id))
    .returning();

  return result[0] ?? null;
}
