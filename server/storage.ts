import { db } from "./db";
import {
  users,
  mailboxes,
  type User,
  type InsertUser,
  type Mailbox,
  type InsertMailbox,
  type UpdateMailboxRequest,
  type UpdateUserRequest
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: UpdateUserRequest): Promise<User>;
  
  // Mailboxes
  getMailboxes(): Promise<Mailbox[]>;
  getMailbox(id: number): Promise<Mailbox | undefined>;
  createMailbox(mailbox: InsertMailbox): Promise<Mailbox>;
  updateMailbox(id: number, updates: UpdateMailboxRequest): Promise<Mailbox>;
  deleteMailbox(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: UpdateUserRequest): Promise<User> {
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Mailboxes
  async getMailboxes(): Promise<Mailbox[]> {
    return await db.select().from(mailboxes);
  }

  async getMailbox(id: number): Promise<Mailbox | undefined> {
    const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id));
    return mailbox;
  }

  async createMailbox(insertMailbox: InsertMailbox): Promise<Mailbox> {
    const [mailbox] = await db.insert(mailboxes).values(insertMailbox).returning();
    return mailbox;
  }

  async updateMailbox(id: number, updates: UpdateMailboxRequest): Promise<Mailbox> {
    const [mailbox] = await db.update(mailboxes)
      .set(updates)
      .where(eq(mailboxes.id, id))
      .returning();
    return mailbox;
  }

  async deleteMailbox(id: number): Promise<void> {
    await db.delete(mailboxes).where(eq(mailboxes.id, id));
  }
}

export const storage = new DatabaseStorage();
