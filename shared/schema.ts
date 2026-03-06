import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================
// USERS
// ============================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("staff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ============================================================
// MAILBOXES
// ============================================================
export const mailboxes = pgTable("mailboxes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  microsoftMailboxId: text("microsoft_mailbox_id"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMailboxSchema = createInsertSchema(mailboxes).omit({ id: true, createdAt: true });
export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;

// ============================================================
// CONTACTS
// ============================================================
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  contactType: text("contact_type").notNull().default("Other"),
  primaryEmail: text("primary_email"),
  primaryPhone: text("primary_phone"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// ============================================================
// CONTACT PHONES
// ============================================================
export const contactPhones = pgTable("contact_phones", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  phoneNumber: text("phone_number").notNull(),
  label: text("label"),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactPhoneSchema = createInsertSchema(contactPhones).omit({ id: true, createdAt: true });
export type ContactPhone = typeof contactPhones.$inferSelect;
export type InsertContactPhone = z.infer<typeof insertContactPhoneSchema>;

// ============================================================
// CONTACT EMAILS
// ============================================================
export const contactEmails = pgTable("contact_emails", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  email: text("email").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactEmailSchema = createInsertSchema(contactEmails).omit({ id: true, createdAt: true });
export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = z.infer<typeof insertContactEmailSchema>;

// ============================================================
// EMAIL THREADS
// ============================================================
export const emailThreads = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  mailboxId: integer("mailbox_id").notNull().references(() => mailboxes.id),
  subject: text("subject").notNull(),
  microsoftThreadId: text("microsoft_thread_id"),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  contactId: integer("contact_id").references(() => contacts.id),
  propertyId: integer("property_id").references(() => properties.id),
  status: text("status").notNull().default("Open"),
  lastMessageAt: timestamp("last_message_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailThreadSchema = createInsertSchema(emailThreads).omit({ id: true, createdAt: true });
export type EmailThread = typeof emailThreads.$inferSelect;
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;

// ============================================================
// THREAD CONTACTS (explicit many-to-many thread↔contact linking)
// ============================================================
export const threadContacts = pgTable("thread_contacts", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => emailThreads.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  relationshipType: text("relationship_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertThreadContactSchema = createInsertSchema(threadContacts).omit({ id: true, createdAt: true });
export type ThreadContact = typeof threadContacts.$inferSelect;
export type InsertThreadContact = z.infer<typeof insertThreadContactSchema>;

// ============================================================
// MESSAGES
// ============================================================
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => emailThreads.id),
  microsoftMessageId: text("microsoft_message_id"),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name"),
  recipients: text("recipients").array(),
  subject: text("subject"),
  bodyPreview: text("body_preview"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  hasAttachments: boolean("has_attachments").default(false).notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ============================================================
// ATTACHMENTS
// ============================================================
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  microsoftAttachmentId: text("microsoft_attachment_id"),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, createdAt: true });
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;

// ============================================================
// PROPERTIES
// ============================================================
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  associationName: text("association_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true });
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// ============================================================
// UNITS
// ============================================================
export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  unitNumber: text("unit_number").notNull(),
  ownerContactId: integer("owner_contact_id").references(() => contacts.id),
  tenantContactId: integer("tenant_contact_id").references(() => contacts.id),
});

export const insertUnitSchema = createInsertSchema(units).omit({ id: true });
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;

// ============================================================
// ISSUES
// ============================================================
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  contactId: integer("contact_id").references(() => contacts.id),
  propertyId: integer("property_id").references(() => properties.id),
  unitId: integer("unit_id").references(() => units.id),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  status: text("status").notNull().default("Open"),
  priority: text("priority").notNull().default("Normal"),
  closedAt: timestamp("closed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

// ============================================================
// ISSUE THREADS (explicit thread↔issue linking)
// ============================================================
export const issueThreads = pgTable("issue_threads", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull().references(() => issues.id),
  threadId: integer("thread_id").notNull().references(() => emailThreads.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIssueThreadSchema = createInsertSchema(issueThreads).omit({ id: true, createdAt: true });
export type IssueThread = typeof issueThreads.$inferSelect;
export type InsertIssueThread = z.infer<typeof insertIssueThreadSchema>;

// ============================================================
// TASKS
// ============================================================
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id),
  threadId: integer("thread_id").references(() => emailThreads.id),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Open"),
  priority: text("priority").notNull().default("Normal"),
  dueDate: timestamp("due_date"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// ============================================================
// NOTES
// ============================================================
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id),
  threadId: integer("thread_id").references(() => emailThreads.id),
  userId: integer("user_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true });
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// ============================================================
// CALLS
// ============================================================
export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  contactId: integer("contact_id").references(() => contacts.id),
  userId: integer("user_id").references(() => users.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  direction: text("direction").notNull().default("inbound"),
  notes: text("notes"),
  issueId: integer("issue_id").references(() => issues.id),
});

export const insertCallSchema = createInsertSchema(calls).omit({ id: true });
export type Call = typeof calls.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;

// ============================================================
// ACTIVITY LOG
// ============================================================
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  userId: integer("user_id").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// ============================================================
// API CONTRACT TYPES
// ============================================================
export type UpdateUserRequest = Partial<InsertUser>;
export type UpdateMailboxRequest = Partial<InsertMailbox>;
export type UpdateContactRequest = Partial<InsertContact>;
export type UpdatePropertyRequest = Partial<InsertProperty>;
export type UpdateIssueRequest = Partial<InsertIssue>;
export type UpdateTaskRequest = Partial<InsertTask>;
