import { db } from "./db";
import {
  users, mailboxes, emailThreads, messages, attachments, contacts, contactPhones,
  contactEmails, associations, properties, units, issues, tasks, notes, calls, activityLog,
  issueThreads, threadContacts, mailboxSignatures,
  type User, type InsertUser,
  type Mailbox, type InsertMailbox,
  type EmailThread, type InsertEmailThread,
  type Message, type InsertMessage,
  type Attachment, type InsertAttachment,
  type Contact, type InsertContact,
  type ContactPhone, type InsertContactPhone,
  type Property, type InsertProperty,
  type Unit, type InsertUnit,
  type Issue, type InsertIssue,
  type Task, type InsertTask,
  type Note, type InsertNote,
  type Call, type InsertCall,
  type ActivityLog, type InsertActivityLog,
  typeLabels, type TypeLabel, type InsertTypeLabel,
  type MailboxSignature, type InsertMailboxSignature,
} from "@shared/schema";
import { eq, desc, and, lt, notInArray, inArray, sql, or, isNull, ilike, gte, lte, exists } from "drizzle-orm";
import type { TaskWithMeta } from "@shared/routes";

export type ThreadWithMeta = EmailThread & {
  unreadCount: number;
  latestSender: string | null;
  latestSenderName: string | null;
  hasAttachments: boolean;
};

export interface ThreadFilters {
  mailboxId?: number;
  assignedUserId?: number | null;
  status?: string;
  unreadOnly?: boolean;
  hasAttachments?: boolean;
  contactId?: number;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sentOnly?: boolean;
  hasTask?: boolean;
  hasIssue?: boolean;
  associationId?: number;
}

export interface GlobalSearchResults {
  contacts: { id: number; displayName: string; contactType: string | null }[];
  threads: { id: number; subject: string; status: string }[];
  issues: { id: number; title: string; status: string }[];
  tasks: { id: number; title: string; status: string }[];
  associations: { id: number; name: string }[];
  units: { id: number; unitNumber: string; associationName: string | null }[];
}

export type MessageWithAttachments = Message & {
  attachments: Attachment[];
};

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  updateUserTokens(id: number, tokens: { msAccessToken: string; msRefreshToken: string; msTokenExpiresAt: Date }): Promise<void>;

  // Mailboxes
  getMailboxes(forUserId?: number): Promise<Mailbox[]>;
  getMailbox(id: number): Promise<Mailbox | undefined>;
  createMailbox(mailbox: InsertMailbox): Promise<Mailbox>;
  updateMailbox(id: number, updates: Partial<InsertMailbox>): Promise<Mailbox>;
  deleteMailbox(id: number): Promise<void>;
  countThreadsByMailbox(mailboxId: number): Promise<number>;
  updateMailboxLastSynced(id: number, at: Date): Promise<void>;

  // Email Threads
  getThreads(filters?: ThreadFilters): Promise<ThreadWithMeta[]>;
  getThread(id: number): Promise<EmailThread | undefined>;
  createThread(thread: InsertEmailThread): Promise<EmailThread>;
  updateThread(id: number, updates: Partial<InsertEmailThread>): Promise<EmailThread>;

  // Messages
  getMessagesByThread(threadId: number): Promise<MessageWithAttachments[]>;
  markThreadMessagesRead(threadId: number): Promise<void>;
  createMessage(message: InsertMessage): Promise<Message>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  getAttachmentWithMailbox(attachmentId: number): Promise<{ attachment: Attachment; microsoftMessageId: string; mailboxEmail: string } | undefined>;

  // Search
  globalSearch(q: string, limit?: number): Promise<GlobalSearchResults>;

  // Contacts
  getContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  findContactByPhone(phoneNumber: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, updates: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;
  getContactPhones(contactId: number): Promise<ContactPhone[]>;
  addContactPhone(phone: InsertContactPhone): Promise<ContactPhone>;

  // Properties
  getProperties(): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, updates: Partial<InsertProperty>): Promise<Property>;
  deleteProperty(id: number): Promise<void>;
  getUnitsByProperty(propertyId: number): Promise<Unit[]>;
  createUnit(unit: InsertUnit): Promise<Unit>;

  // Issues
  getIssues(filters?: { associationId?: number; unitId?: number }): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue | undefined>;
  createIssue(issue: InsertIssue): Promise<Issue>;
  updateIssue(id: number, updates: Partial<InsertIssue>): Promise<Issue>;
  deleteIssue(id: number): Promise<void>;

  // Tasks
  getTasks(filters?: { issueId?: number; associationId?: number; unitId?: number }): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  getTaskWithMeta(id: number): Promise<TaskWithMeta | undefined>;
  getTasksFiltered(options: { assignedUserId?: number; threadId?: number; overdue?: boolean; status?: string; contactId?: number; associationId?: number; unitId?: number }): Promise<TaskWithMeta[]>;
  getTasksByThread(threadId: number): Promise<TaskWithMeta[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Notes
  getNotesByThread(threadId: number): Promise<Note[]>;
  getNotesByIssue(issueId: number): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;

  // Calls
  getCalls(): Promise<Call[]>;
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: number, updates: Partial<InsertCall>): Promise<Call>;

  // Activity Log
  logActivity(entry: InsertActivityLog): Promise<ActivityLog>;
  getActivityByEntity(entityType: string, entityId: number): Promise<ActivityLog[]>;

  // Type Labels
  getTypeLabels(category?: string): Promise<TypeLabel[]>;
  createTypeLabel(label: InsertTypeLabel): Promise<TypeLabel>;
  updateTypeLabel(id: number, updates: Partial<InsertTypeLabel>): Promise<TypeLabel>;
  deleteTypeLabel(id: number): Promise<void>;

  // Signatures
  getSignaturesByUser(userId: number): Promise<MailboxSignature[]>;
  createSignature(sig: InsertMailboxSignature): Promise<MailboxSignature>;
  updateSignature(id: number, userId: number, body: string): Promise<MailboxSignature>;
  deleteSignature(id: number, userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number) { const [r] = await db.select().from(users).where(eq(users.id, id)); return r; }
  async getUserByEmail(email: string) { const [r] = await db.select().from(users).where(eq(users.email, email)); return r; }
  async getUsers() { return db.select().from(users); }
  async createUser(u: InsertUser) { const [r] = await db.insert(users).values(u).returning(); return r; }
  async updateUser(id: number, u: Partial<InsertUser>) { const [r] = await db.update(users).set(u).where(eq(users.id, id)).returning(); return r; }
  async updateUserTokens(id: number, tokens: { msAccessToken: string; msRefreshToken: string; msTokenExpiresAt: Date }) {
    await db.update(users).set({
      msAccessToken: tokens.msAccessToken,
      msRefreshToken: tokens.msRefreshToken,
      msTokenExpiresAt: tokens.msTokenExpiresAt,
    }).where(eq(users.id, id));
  }

  // Mailboxes
  async getMailboxes(forUserId?: number) {
    if (forUserId === undefined) return db.select().from(mailboxes);
    return db.select().from(mailboxes).where(
      or(
        eq(mailboxes.syncMode, "application"),
        and(eq(mailboxes.syncMode, "delegated"), eq(mailboxes.ownerUserId, forUserId))
      )
    );
  }
  async getMailbox(id: number) { const [r] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)); return r; }
  async createMailbox(m: InsertMailbox) { const [r] = await db.insert(mailboxes).values(m).returning(); return r; }
  async updateMailbox(id: number, m: Partial<InsertMailbox>) { const [r] = await db.update(mailboxes).set(m).where(eq(mailboxes.id, id)).returning(); return r; }
  async deleteMailbox(id: number) { await db.delete(mailboxes).where(eq(mailboxes.id, id)); }
  async countThreadsByMailbox(mailboxId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(emailThreads).where(eq(emailThreads.mailboxId, mailboxId));
    return row?.count ?? 0;
  }
  async updateMailboxLastSynced(id: number, at: Date) {
    await db.update(mailboxes).set({ lastSyncedAt: at }).where(eq(mailboxes.id, id));
  }

  // Email Threads — enriched with unread count + latest sender
  async getThreads(filters: ThreadFilters = {}): Promise<ThreadWithMeta[]> {
    const conditions: any[] = [];
    if (filters.mailboxId) conditions.push(eq(emailThreads.mailboxId, filters.mailboxId));
    if (filters.assignedUserId !== undefined) {
      conditions.push(filters.assignedUserId === null
        ? isNull(emailThreads.assignedUserId)
        : eq(emailThreads.assignedUserId, filters.assignedUserId));
    }
    if (filters.status) {
      if (filters.status === "open_mail") {
        conditions.push(or(eq(emailThreads.status, "Open"), eq(emailThreads.status, "Waiting"))!);
      } else {
        conditions.push(eq(emailThreads.status, filters.status));
      }
    }
    if (filters.contactId) conditions.push(eq(emailThreads.contactId, filters.contactId));
    if (filters.dateFrom) conditions.push(gte(emailThreads.lastMessageAt, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(emailThreads.lastMessageAt, filters.dateTo));
    if (filters.search) {
      conditions.push(ilike(emailThreads.subject, `%${filters.search}%`));
    }

    const rows = conditions.length > 0
      ? await db.select().from(emailThreads).where(and(...conditions)).orderBy(desc(emailThreads.lastMessageAt))
      : await db.select().from(emailThreads).orderBy(desc(emailThreads.lastMessageAt));

    const enriched: ThreadWithMeta[] = [];
    for (const t of rows) {
      const msgs = await db.select().from(messages).where(eq(messages.threadId, t.id)).orderBy(desc(messages.receivedAt));
      const unreadCount = msgs.filter(m => !m.isRead).length;
      const hasAtt = msgs.some(m => m.hasAttachments);
      const latest = msgs.find(m => m.direction !== "outbound") ?? msgs[0];

      if (filters.unreadOnly && unreadCount === 0) continue;
      if (filters.hasAttachments && !hasAtt) continue;

      const hasInbound = msgs.some(m => m.direction !== "outbound");
      if (filters.sentOnly && hasInbound) continue;
      if (filters.sentOnly === false && !hasInbound) continue;

      if (filters.hasIssue) {
        const linked = await db.select({ id: issueThreads.id }).from(issueThreads).where(eq(issueThreads.threadId, t.id)).limit(1);
        if (linked.length === 0) continue;
      }
      if (filters.hasTask) {
        // Tasks can link to threads via threadId directly, or via issue linked to the thread
        const directTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.threadId, t.id)).limit(1);
        if (directTasks.length === 0) {
          const linkedIssues = await db.select({ issueId: issueThreads.issueId }).from(issueThreads).where(eq(issueThreads.threadId, t.id));
          if (linkedIssues.length === 0) continue;
          const issueIds = linkedIssues.map(r => r.issueId);
          const issueTasks2 = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.issueId, issueIds)).limit(1);
          if (issueTasks2.length === 0) continue;
        }
      }
      if (filters.associationId) {
        const linkedIssues = await db.select({ issueId: issueThreads.issueId }).from(issueThreads).where(eq(issueThreads.threadId, t.id));
        if (linkedIssues.length === 0) continue;
        const issueIds = linkedIssues.map(r => r.issueId);
        const assocMatch = await db.select({ id: issues.id }).from(issues)
          .where(and(inArray(issues.id, issueIds), eq(issues.associationId, filters.associationId)))
          .limit(1);
        if (assocMatch.length === 0) continue;
      }

      enriched.push({
        ...t,
        unreadCount,
        hasAttachments: hasAtt,
        latestSender: latest?.senderEmail ?? null,
        latestSenderName: latest?.senderName ?? null,
      });
    }
    return enriched;
  }

  async getThread(id: number) { const [r] = await db.select().from(emailThreads).where(eq(emailThreads.id, id)); return r; }
  async createThread(t: InsertEmailThread) { const [r] = await db.insert(emailThreads).values(t).returning(); return r; }
  async updateThread(id: number, t: Partial<InsertEmailThread>) { const [r] = await db.update(emailThreads).set(t).where(eq(emailThreads.id, id)).returning(); return r; }

  // Messages — with attachments
  async getMessagesByThread(threadId: number): Promise<MessageWithAttachments[]> {
    const msgs = await db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(messages.receivedAt);
    const result: MessageWithAttachments[] = [];
    for (const m of msgs) {
      const atts = await db.select().from(attachments).where(eq(attachments.messageId, m.id));
      result.push({ ...m, attachments: atts });
    }
    return result;
  }

  async markThreadMessagesRead(threadId: number) {
    await db.update(messages).set({ isRead: true }).where(eq(messages.threadId, threadId));
  }

  async createMessage(m: InsertMessage) { const [r] = await db.insert(messages).values(m).returning(); return r; }
  async createAttachment(a: InsertAttachment) { const [r] = await db.insert(attachments).values(a).returning(); return r; }

  async getAttachmentWithMailbox(attachmentId: number) {
    const [row] = await db
      .select({
        attachment: attachments,
        microsoftMessageId: messages.microsoftMessageId,
        mailboxEmail: mailboxes.microsoftMailboxId,
      })
      .from(attachments)
      .innerJoin(messages, eq(messages.id, attachments.messageId))
      .innerJoin(emailThreads, eq(emailThreads.id, messages.threadId))
      .innerJoin(mailboxes, eq(mailboxes.id, emailThreads.mailboxId))
      .where(eq(attachments.id, attachmentId));
    if (!row || !row.microsoftMessageId || !row.mailboxEmail) return undefined;
    return { attachment: row.attachment, microsoftMessageId: row.microsoftMessageId, mailboxEmail: row.mailboxEmail };
  }

  async globalSearch(q: string, limit = 5): Promise<GlobalSearchResults> {
    const pattern = `%${q}%`;
    const [contactRows, threadRows, issueRows, taskRows, assocRows, unitRows] = await Promise.all([
      db.select({ id: contacts.id, displayName: contacts.displayName, contactType: contacts.contactType })
        .from(contacts)
        .where(ilike(contacts.displayName, pattern))
        .limit(limit),
      db.select({ id: emailThreads.id, subject: emailThreads.subject, status: emailThreads.status })
        .from(emailThreads)
        .where(ilike(emailThreads.subject, pattern))
        .orderBy(desc(emailThreads.lastMessageAt))
        .limit(limit),
      db.select({ id: issues.id, title: issues.title, status: issues.status })
        .from(issues)
        .where(ilike(issues.title, pattern))
        .orderBy(desc(issues.createdAt))
        .limit(limit),
      db.select({ id: tasks.id, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(ilike(tasks.title, pattern))
        .orderBy(desc(tasks.createdAt))
        .limit(limit),
      db.select({ id: associations.id, name: associations.name })
        .from(associations)
        .where(ilike(associations.name, pattern))
        .limit(limit),
      db.select({ id: units.id, unitNumber: units.unitNumber, associationName: associations.name })
        .from(units)
        .leftJoin(associations, eq(associations.id, units.associationId))
        .where(ilike(units.unitNumber, pattern))
        .limit(limit),
    ]);
    return {
      contacts: contactRows,
      threads: threadRows,
      issues: issueRows,
      tasks: taskRows,
      associations: assocRows,
      units: unitRows,
    };
  }

  // Contacts
  async getContacts() { return db.select().from(contacts); }
  async getContact(id: number) { const [r] = await db.select().from(contacts).where(eq(contacts.id, id)); return r; }
  async findContactByPhone(phoneNumber: string) {
    const phones = await db.select().from(contactPhones).where(eq(contactPhones.phoneNumber, phoneNumber));
    if (!phones.length) return undefined;
    return this.getContact(phones[0].contactId);
  }
  async createContact(c: InsertContact) { const [r] = await db.insert(contacts).values(c).returning(); return r; }
  async updateContact(id: number, c: Partial<InsertContact>) { const [r] = await db.update(contacts).set(c).where(eq(contacts.id, id)).returning(); return r; }
  async deleteContact(id: number) { await db.delete(contacts).where(eq(contacts.id, id)); }
  async getContactPhones(contactId: number) { return db.select().from(contactPhones).where(eq(contactPhones.contactId, contactId)); }
  async addContactPhone(p: InsertContactPhone) { const [r] = await db.insert(contactPhones).values(p).returning(); return r; }

  // Properties
  async getProperties() { return db.select().from(properties); }
  async getProperty(id: number) { const [r] = await db.select().from(properties).where(eq(properties.id, id)); return r; }
  async createProperty(p: InsertProperty) { const [r] = await db.insert(properties).values(p).returning(); return r; }
  async updateProperty(id: number, p: Partial<InsertProperty>) { const [r] = await db.update(properties).set(p).where(eq(properties.id, id)).returning(); return r; }
  async deleteProperty(id: number) { await db.delete(properties).where(eq(properties.id, id)); }
  async getUnitsByProperty(propertyId: number) { return db.select().from(units).where(eq(units.propertyId, propertyId)); }
  async createUnit(u: InsertUnit) { const [r] = await db.insert(units).values(u).returning(); return r; }

  // Issues
  async getIssues(filters?: { associationId?: number; unitId?: number }) {
    if (filters) {
      const conditions = [];
      if (filters.associationId) conditions.push(eq(issues.associationId, filters.associationId));
      if (filters.unitId) conditions.push(eq(issues.unitId, filters.unitId));
      return db.select().from(issues).where(and(...conditions)).orderBy(desc(issues.createdAt));
    }
    return db.select().from(issues).orderBy(desc(issues.createdAt));
  }
  async getIssue(id: number) { const [r] = await db.select().from(issues).where(eq(issues.id, id)); return r; }
  async createIssue(i: InsertIssue) { const [r] = await db.insert(issues).values(i).returning(); return r; }
  async updateIssue(id: number, i: Partial<InsertIssue>) { const [r] = await db.update(issues).set(i).where(eq(issues.id, id)).returning(); return r; }
  async deleteIssue(id: number) { await db.delete(issues).where(eq(issues.id, id)); }

  // Tasks
  async getTasks(filters?: { issueId?: number; associationId?: number; unitId?: number }) {
    if (filters) {
      const conditions = [];
      if (filters.issueId) conditions.push(eq(tasks.issueId, filters.issueId));
      if (filters.associationId) conditions.push(eq(tasks.associationId, filters.associationId));
      if (filters.unitId) conditions.push(eq(tasks.unitId, filters.unitId));
      return db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt));
    }
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number) { const [r] = await db.select().from(tasks).where(eq(tasks.id, id)); return r; }

  private async enrichTasks(rows: Task[]): Promise<TaskWithMeta[]> {
    if (!rows.length) return [];
    const allUsers = await db.select().from(users);
    const threadIds = Array.from(new Set(rows.map(t => t.threadId).filter((id): id is number => id !== null)));
    const threadRows = threadIds.length
      ? await db.select().from(emailThreads).where(inArray(emailThreads.id, threadIds))
      : [];
    const issueIds = Array.from(new Set(rows.map(t => t.issueId).filter((id): id is number => id !== null)));
    const issueRows = issueIds.length
      ? await db.select().from(issues).where(inArray(issues.id, issueIds))
      : [];
    const threadMap = new Map(threadRows.map(t => [t.id, t.subject]));
    const issueMap = new Map(issueRows.map(i => [i.id, i.title]));
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    return rows.map(task => ({
      ...task,
      assigneeName: task.assignedUserId ? (userMap.get(task.assignedUserId)?.name ?? null) : null,
      assigneeEmail: task.assignedUserId ? (userMap.get(task.assignedUserId)?.email ?? null) : null,
      createdByName: task.createdByUserId ? (userMap.get(task.createdByUserId)?.name ?? null) : null,
      threadSubject: task.threadId ? (threadMap.get(task.threadId) ?? null) : null,
      issueTitle: task.issueId ? (issueMap.get(task.issueId) ?? null) : null,
    }));
  }

  async getTaskWithMeta(id: number): Promise<TaskWithMeta | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return undefined;
    const [enriched] = await this.enrichTasks([task]);
    return enriched;
  }

  async getTasksFiltered(options: { assignedUserId?: number; threadId?: number; overdue?: boolean; status?: string; contactId?: number; associationId?: number; unitId?: number }): Promise<TaskWithMeta[]> {
    const conditions = [];
    if (options.assignedUserId !== undefined) conditions.push(eq(tasks.assignedUserId, options.assignedUserId));
    if (options.threadId !== undefined) conditions.push(eq(tasks.threadId, options.threadId));
    if (options.status !== undefined) conditions.push(eq(tasks.status, options.status));
    if (options.contactId !== undefined) conditions.push(eq(tasks.contactId, options.contactId));
    if (options.associationId !== undefined) conditions.push(eq(tasks.associationId, options.associationId));
    if (options.unitId !== undefined) conditions.push(eq(tasks.unitId, options.unitId));
    if (options.overdue) {
      conditions.push(lt(tasks.dueDate, new Date()));
      conditions.push(notInArray(tasks.status, ["Completed", "Cancelled"]));
    }
    const rows = conditions.length
      ? await db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt))
      : await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    return this.enrichTasks(rows);
  }

  async getTasksByThread(threadId: number): Promise<TaskWithMeta[]> {
    const rows = await db.select().from(tasks).where(eq(tasks.threadId, threadId)).orderBy(desc(tasks.createdAt));
    return this.enrichTasks(rows);
  }

  async createTask(t: InsertTask) { const [r] = await db.insert(tasks).values({ ...t, updatedAt: new Date() }).returning(); return r; }
  async updateTask(id: number, t: Partial<InsertTask>) { const [r] = await db.update(tasks).set({ ...t, updatedAt: new Date() }).where(eq(tasks.id, id)).returning(); return r; }
  async deleteTask(id: number) { await db.delete(tasks).where(eq(tasks.id, id)); }

  // Notes
  async getNotesByThread(threadId: number) { return db.select().from(notes).where(eq(notes.threadId, threadId)).orderBy(notes.createdAt); }
  async getNotesByIssue(issueId: number) { return db.select().from(notes).where(eq(notes.issueId, issueId)).orderBy(notes.createdAt); }
  async createNote(n: InsertNote) { const [r] = await db.insert(notes).values(n).returning(); return r; }

  // Calls
  async getCalls() { return db.select().from(calls); }
  async createCall(c: InsertCall) { const [r] = await db.insert(calls).values(c).returning(); return r; }
  async updateCall(id: number, c: Partial<InsertCall>) { const [r] = await db.update(calls).set(c).where(eq(calls.id, id)).returning(); return r; }

  // Activity Log
  async logActivity(e: InsertActivityLog) { const [r] = await db.insert(activityLog).values(e).returning(); return r; }
  async getActivityByEntity(entityType: string, entityId: number) {
    return db.select().from(activityLog)
      .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
      .orderBy(desc(activityLog.createdAt));
  }

  // Type Labels
  async getTypeLabels(category?: string) {
    const q = db.select().from(typeLabels);
    if (category) return q.where(eq(typeLabels.category, category)).orderBy(typeLabels.sortOrder, typeLabels.name);
    return q.orderBy(typeLabels.category, typeLabels.sortOrder, typeLabels.name);
  }
  async createTypeLabel(l: InsertTypeLabel) { const [r] = await db.insert(typeLabels).values(l).returning(); return r; }
  async updateTypeLabel(id: number, u: Partial<InsertTypeLabel>) { const [r] = await db.update(typeLabels).set(u).where(eq(typeLabels.id, id)).returning(); return r; }
  async deleteTypeLabel(id: number) { await db.delete(typeLabels).where(eq(typeLabels.id, id)); }

  // Signatures
  async getSignaturesByUser(userId: number) {
    return db.select().from(mailboxSignatures).where(eq(mailboxSignatures.userId, userId)).orderBy(mailboxSignatures.mailboxId);
  }
  async createSignature(sig: InsertMailboxSignature) {
    const now = new Date();
    const [r] = await db.insert(mailboxSignatures).values({ ...sig, createdAt: now, updatedAt: now }).returning();
    return r;
  }
  async updateSignature(id: number, userId: number, body: string) {
    const [r] = await db.update(mailboxSignatures).set({ body, updatedAt: new Date() })
      .where(and(eq(mailboxSignatures.id, id), eq(mailboxSignatures.userId, userId))).returning();
    return r;
  }
  async deleteSignature(id: number, userId: number) {
    await db.delete(mailboxSignatures).where(and(eq(mailboxSignatures.id, id), eq(mailboxSignatures.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
