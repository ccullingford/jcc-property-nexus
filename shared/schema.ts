import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("staff"), // admin, manager, staff
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mailboxes = pgTable("mailboxes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // shared, personal
  microsoftMailboxId: text("microsoft_mailbox_id"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userMailboxes = pgTable("user_mailboxes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  mailboxId: integer("mailbox_id").notNull().references(() => mailboxes.id),
  accessType: text("access_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMailboxSchema = createInsertSchema(mailboxes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserMailboxSchema = createInsertSchema(userMailboxes).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;
export type UserMailbox = typeof userMailboxes.$inferSelect;
export type InsertUserMailbox = z.infer<typeof insertUserMailboxSchema>;

// API Contract Types
export type CreateUserRequest = InsertUser;
export type UpdateUserRequest = Partial<InsertUser>;
export type CreateMailboxRequest = InsertMailbox;
export type UpdateMailboxRequest = Partial<InsertMailbox>;

export type UserResponse = User;
export type MailboxResponse = Mailbox;
