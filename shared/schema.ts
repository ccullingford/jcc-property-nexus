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
  msAccessToken: text("ms_access_token"),
  msRefreshToken: text("ms_refresh_token"),
  msTokenExpiresAt: timestamp("ms_token_expires_at"),
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
  syncMode: text("sync_mode").notNull().default("application"),
  ownerUserId: integer("owner_user_id").references(() => users.id),
  microsoftMailboxId: text("microsoft_mailbox_id"),
  isDefault: boolean("is_default").default(false).notNull(),
  syncHistoryDays: integer("sync_history_days").default(30).notNull(),
  includeSentMail: boolean("include_sent_mail").default(true).notNull(),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  autoSyncIntervalMinutes: integer("auto_sync_interval_minutes").default(5).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMailboxSchema = createInsertSchema(mailboxes).omit({ id: true, createdAt: true });
export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;

// ============================================================
// ASSOCIATIONS
// ============================================================
export const associations = pgTable("associations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  mailboxId: integer("mailbox_id").references(() => mailboxes.id),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAssociationSchema = createInsertSchema(associations).omit({ id: true, createdAt: true, updatedAt: true });
export type Association = typeof associations.$inferSelect;
export type InsertAssociation = z.infer<typeof insertAssociationSchema>;

// ============================================================
// CONTACTS
// ============================================================
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  companyName: text("company_name"),
  useCompanyName: boolean("use_company_name").default(false).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  contactType: text("contact_type").notNull().default("Other"),
  primaryEmail: text("primary_email"),
  primaryPhone: text("primary_phone"),
  notes: text("notes"),
  associationId: integer("association_id").references(() => associations.id),
  unitId: integer("unit_id").references(() => units.id),
  mailingAddress1: text("mailing_address_1"),
  mailingAddress2: text("mailing_address_2"),
  mailingCity: text("mailing_city"),
  mailingState: text("mailing_state"),
  mailingPostalCode: text("mailing_postal_code"),
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
  direction: text("direction").notNull().default("inbound"),
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
  associationId: integer("association_id").references(() => associations.id),
  propertyId: integer("property_id").references(() => properties.id),
  unitNumber: text("unit_number").notNull(),
  building: text("building"),
  streetAddress: text("street_address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUnitSchema = createInsertSchema(units).omit({ id: true, createdAt: true, updatedAt: true });
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
  associationId: integer("association_id").references(() => associations.id),
  propertyId: integer("property_id").references(() => properties.id),
  unitId: integer("unit_id").references(() => units.id),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  issueType: text("issue_type"),
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
  contactId: integer("contact_id").references(() => contacts.id),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type"),
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
// CONTACT IMPORT JOBS
// ============================================================
export const contactImportJobs = pgTable("contact_import_jobs", {
  id: serial("id").primaryKey(),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  status: text("status").notNull().default("done"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertContactImportJobSchema = createInsertSchema(contactImportJobs).omit({ id: true, createdAt: true });
export type ContactImportJob = typeof contactImportJobs.$inferSelect;

// ============================================================
// CONTACT MERGE LOG
// ============================================================
export const contactMergeLog = pgTable("contact_merge_log", {
  id: serial("id").primaryKey(),
  sourceContactId: integer("source_contact_id").notNull(),
  targetContactId: integer("target_contact_id").notNull().references(() => contacts.id),
  mergedByUserId: integer("merged_by_user_id").references(() => users.id),
  mergedAt: timestamp("merged_at").defaultNow().notNull(),
});

export const insertContactMergeLogSchema = createInsertSchema(contactMergeLog).omit({ id: true, mergedAt: true });
export type ContactMergeLog = typeof contactMergeLog.$inferSelect;

// ============================================================
// TYPE LABELS (issue types, task types — admin configurable)
// ============================================================
export const typeLabels = pgTable("type_labels", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTypeLabelSchema = createInsertSchema(typeLabels).omit({ id: true, createdAt: true });
export type TypeLabel = typeof typeLabels.$inferSelect;
export type InsertTypeLabel = z.infer<typeof insertTypeLabelSchema>;

// ============================================================
// WHAT'S NEW
// ============================================================
export const whatsNew = pgTable("whats_new", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("feature"),
  description: text("description").notNull(),
  howToUse: text("how_to_use"),
  releaseVersion: text("release_version"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsNewSchema = createInsertSchema(whatsNew).omit({ id: true, createdAt: true });
export type WhatsNewEntry = typeof whatsNew.$inferSelect;
export type InsertWhatsNew = z.infer<typeof insertWhatsNewSchema>;

export const whatsNewReads = pgTable("whats_new_reads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  whatsNewId: integer("whats_new_id").notNull().references(() => whatsNew.id),
  readAt: timestamp("read_at").defaultNow().notNull(),
});

export const insertWhatsNewReadSchema = createInsertSchema(whatsNewReads).omit({ id: true, readAt: true });
export type WhatsNewRead = typeof whatsNewReads.$inferSelect;

// ============================================================
// NOTIFICATIONS
// ============================================================
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ============================================================
// SOLUTION LIBRARY
// ============================================================
export const solutionLibrary = pgTable("solution_library", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary"),
  issueType: text("issue_type"),
  symptoms: text("symptoms"),
  recommendedSteps: text("recommended_steps"),
  internalNotes: text("internal_notes"),
  responseTemplate: text("response_template"),
  status: text("status").notNull().default("draft"),
  ownerUserId: integer("owner_user_id").references(() => users.id),
  lastReviewedAt: timestamp("last_reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSolutionSchema = createInsertSchema(solutionLibrary).omit({ id: true, createdAt: true, updatedAt: true });
export type Solution = typeof solutionLibrary.$inferSelect;
export type InsertSolution = z.infer<typeof insertSolutionSchema>;

// ============================================================
// API CONTRACT TYPES
// ============================================================
export type UpdateUserRequest = Partial<InsertUser>;
export type UpdateMailboxRequest = Partial<InsertMailbox>;
export type UpdateContactRequest = Partial<InsertContact>;
export type UpdatePropertyRequest = Partial<InsertProperty>;
export type UpdateAssociationRequest = Partial<InsertAssociation>;
export type UpdateUnitRequest = Partial<InsertUnit>;
export type UpdateIssueRequest = Partial<InsertIssue>;
export type UpdateTaskRequest = Partial<InsertTask>;
export type UpdateTypeLabelRequest = Partial<InsertTypeLabel>;
