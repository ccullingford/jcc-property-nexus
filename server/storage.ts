import { db } from "./db";
import {
  users, mailboxes, emailThreads, messages, attachments, contacts, contactPhones,
  properties, units, issues, tasks, notes, calls, activityLog,
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
} from "@shared/schema";
import { eq, desc, and, lt, notInArray, inArray, sql } from "drizzle-orm";
import type { TaskWithMeta } from "@shared/routes";

export type ThreadWithMeta = EmailThread & {
  unreadCount: number;
  latestSender: string | null;
  latestSenderName: string | null;
};

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

  // Mailboxes
  getMailboxes(): Promise<Mailbox[]>;
  getMailbox(id: number): Promise<Mailbox | undefined>;
  createMailbox(mailbox: InsertMailbox): Promise<Mailbox>;
  updateMailbox(id: number, updates: Partial<InsertMailbox>): Promise<Mailbox>;
  deleteMailbox(id: number): Promise<void>;

  // Email Threads
  getThreads(mailboxId?: number): Promise<ThreadWithMeta[]>;
  getThread(id: number): Promise<EmailThread | undefined>;
  createThread(thread: InsertEmailThread): Promise<EmailThread>;
  updateThread(id: number, updates: Partial<InsertEmailThread>): Promise<EmailThread>;

  // Messages
  getMessagesByThread(threadId: number): Promise<MessageWithAttachments[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;

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
  getIssues(): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue | undefined>;
  createIssue(issue: InsertIssue): Promise<Issue>;
  updateIssue(id: number, updates: Partial<InsertIssue>): Promise<Issue>;
  deleteIssue(id: number): Promise<void>;

  // Tasks
  getTasks(issueId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  getTaskWithMeta(id: number): Promise<TaskWithMeta | undefined>;
  getTasksFiltered(options: { assignedUserId?: number; threadId?: number; overdue?: boolean; status?: string }): Promise<TaskWithMeta[]>;
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
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number) { const [r] = await db.select().from(users).where(eq(users.id, id)); return r; }
  async getUserByEmail(email: string) { const [r] = await db.select().from(users).where(eq(users.email, email)); return r; }
  async getUsers() { return db.select().from(users); }
  async createUser(u: InsertUser) { const [r] = await db.insert(users).values(u).returning(); return r; }
  async updateUser(id: number, u: Partial<InsertUser>) { const [r] = await db.update(users).set(u).where(eq(users.id, id)).returning(); return r; }

  // Mailboxes
  async getMailboxes() { return db.select().from(mailboxes); }
  async getMailbox(id: number) { const [r] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)); return r; }
  async createMailbox(m: InsertMailbox) { const [r] = await db.insert(mailboxes).values(m).returning(); return r; }
  async updateMailbox(id: number, m: Partial<InsertMailbox>) { const [r] = await db.update(mailboxes).set(m).where(eq(mailboxes.id, id)).returning(); return r; }
  async deleteMailbox(id: number) { await db.delete(mailboxes).where(eq(mailboxes.id, id)); }

  // Email Threads — enriched with unread count + latest sender
  async getThreads(mailboxId?: number): Promise<ThreadWithMeta[]> {
    const rows = mailboxId
      ? await db.select().from(emailThreads).where(eq(emailThreads.mailboxId, mailboxId)).orderBy(desc(emailThreads.lastMessageAt))
      : await db.select().from(emailThreads).orderBy(desc(emailThreads.lastMessageAt));

    // Enrich each thread with unread count and latest sender
    const enriched: ThreadWithMeta[] = [];
    for (const t of rows) {
      const msgs = await db.select().from(messages).where(eq(messages.threadId, t.id)).orderBy(desc(messages.receivedAt));
      const unreadCount = msgs.filter(m => !m.isRead).length;
      const latest = msgs[0];
      enriched.push({
        ...t,
        unreadCount,
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

  async createMessage(m: InsertMessage) { const [r] = await db.insert(messages).values(m).returning(); return r; }
  async createAttachment(a: InsertAttachment) { const [r] = await db.insert(attachments).values(a).returning(); return r; }

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
  async getIssues() { return db.select().from(issues); }
  async getIssue(id: number) { const [r] = await db.select().from(issues).where(eq(issues.id, id)); return r; }
  async createIssue(i: InsertIssue) { const [r] = await db.insert(issues).values(i).returning(); return r; }
  async updateIssue(id: number, i: Partial<InsertIssue>) { const [r] = await db.update(issues).set(i).where(eq(issues.id, id)).returning(); return r; }
  async deleteIssue(id: number) { await db.delete(issues).where(eq(issues.id, id)); }

  // Tasks
  async getTasks(issueId?: number) {
    if (issueId) return db.select().from(tasks).where(eq(tasks.issueId, issueId));
    return db.select().from(tasks);
  }

  async getTask(id: number) { const [r] = await db.select().from(tasks).where(eq(tasks.id, id)); return r; }

  private async enrichTasks(rows: Task[]): Promise<TaskWithMeta[]> {
    if (!rows.length) return [];
    const allUsers = await db.select().from(users);
    const threadIds = Array.from(new Set(rows.map(t => t.threadId).filter((id): id is number => id !== null)));
    const threadRows = threadIds.length
      ? await db.select().from(emailThreads).where(inArray(emailThreads.id, threadIds))
      : [];
    const threadMap = new Map(threadRows.map(t => [t.id, t.subject]));
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    return rows.map(task => ({
      ...task,
      assigneeName: task.assignedUserId ? (userMap.get(task.assignedUserId)?.name ?? null) : null,
      assigneeEmail: task.assignedUserId ? (userMap.get(task.assignedUserId)?.email ?? null) : null,
      createdByName: task.createdByUserId ? (userMap.get(task.createdByUserId)?.name ?? null) : null,
      threadSubject: task.threadId ? (threadMap.get(task.threadId) ?? null) : null,
    }));
  }

  async getTaskWithMeta(id: number): Promise<TaskWithMeta | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return undefined;
    const [enriched] = await this.enrichTasks([task]);
    return enriched;
  }

  async getTasksFiltered(options: { assignedUserId?: number; threadId?: number; overdue?: boolean; status?: string }): Promise<TaskWithMeta[]> {
    const conditions = [];
    if (options.assignedUserId !== undefined) conditions.push(eq(tasks.assignedUserId, options.assignedUserId));
    if (options.threadId !== undefined) conditions.push(eq(tasks.threadId, options.threadId));
    if (options.status !== undefined) conditions.push(eq(tasks.status, options.status));
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
}

export const storage = new DatabaseStorage();
