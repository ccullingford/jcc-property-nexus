import { db } from "./db";
import {
  users, mailboxes, emailThreads, messages, contacts, contactPhones,
  properties, units, issues, tasks, notes, calls, activityLog,
  type User, type InsertUser,
  type Mailbox, type InsertMailbox,
  type EmailThread, type InsertEmailThread,
  type Message, type InsertMessage,
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
import { eq, ilike, or } from "drizzle-orm";

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
  getThreads(mailboxId?: number): Promise<EmailThread[]>;
  getThread(id: number): Promise<EmailThread | undefined>;
  createThread(thread: InsertEmailThread): Promise<EmailThread>;
  updateThread(id: number, updates: Partial<InsertEmailThread>): Promise<EmailThread>;

  // Messages
  getMessagesByThread(threadId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;

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

  // Email Threads
  async getThreads(mailboxId?: number) {
    if (mailboxId) return db.select().from(emailThreads).where(eq(emailThreads.mailboxId, mailboxId));
    return db.select().from(emailThreads);
  }
  async getThread(id: number) { const [r] = await db.select().from(emailThreads).where(eq(emailThreads.id, id)); return r; }
  async createThread(t: InsertEmailThread) { const [r] = await db.insert(emailThreads).values(t).returning(); return r; }
  async updateThread(id: number, t: Partial<InsertEmailThread>) { const [r] = await db.update(emailThreads).set(t).where(eq(emailThreads.id, id)).returning(); return r; }

  // Messages
  async getMessagesByThread(threadId: number) { return db.select().from(messages).where(eq(messages.threadId, threadId)); }
  async createMessage(m: InsertMessage) { const [r] = await db.insert(messages).values(m).returning(); return r; }

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
  async createTask(t: InsertTask) { const [r] = await db.insert(tasks).values(t).returning(); return r; }
  async updateTask(id: number, t: Partial<InsertTask>) { const [r] = await db.update(tasks).set(t).where(eq(tasks.id, id)).returning(); return r; }
  async deleteTask(id: number) { await db.delete(tasks).where(eq(tasks.id, id)); }

  // Notes
  async getNotesByThread(threadId: number) { return db.select().from(notes).where(eq(notes.threadId, threadId)); }
  async getNotesByIssue(issueId: number) { return db.select().from(notes).where(eq(notes.issueId, issueId)); }
  async createNote(n: InsertNote) { const [r] = await db.insert(notes).values(n).returning(); return r; }

  // Calls
  async getCalls() { return db.select().from(calls); }
  async createCall(c: InsertCall) { const [r] = await db.insert(calls).values(c).returning(); return r; }
  async updateCall(id: number, c: Partial<InsertCall>) { const [r] = await db.update(calls).set(c).where(eq(calls.id, id)).returning(); return r; }

  // Activity Log
  async logActivity(e: InsertActivityLog) { const [r] = await db.insert(activityLog).values(e).returning(); return r; }
  async getActivityByEntity(entityType: string, entityId: number) {
    return db.select().from(activityLog)
      .where(eq(activityLog.entityType, entityType));
  }
}

export const storage = new DatabaseStorage();
