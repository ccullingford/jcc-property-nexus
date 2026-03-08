import { z } from 'zod';
import {
  insertUserSchema, insertMailboxSchema, insertEmailThreadSchema,
  insertContactSchema, insertContactPhoneSchema, insertContactEmailSchema,
  insertPropertySchema, insertUnitSchema,
  insertIssueSchema, insertTaskSchema, insertCallSchema,
  users, mailboxes, emailThreads, messages, attachments,
  contacts, contactPhones, contactEmails, threadContacts,
  properties, units, issues, tasks, calls, issueThreads,
  typeLabels, insertTypeLabelSchema, contactUnits,
} from './schema';

export type NoteWithUser = {
  id: number;
  threadId: number | null;
  userId: number | null;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorEmail: string | null;
};

export type ActivityWithUser = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorName: string | null;
};

export type TaskWithMeta = typeof tasks.$inferSelect & {
  assigneeName: string | null;
  assigneeEmail: string | null;
  createdByName: string | null;
  threadSubject: string | null;
  issueTitle: string | null;
};

export const TASK_STATUSES = ["Open", "In Progress", "Completed", "Cancelled"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const TASK_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const CONTACT_TYPES = ["Owner", "Tenant", "Vendor", "Board", "Realtor", "Attorney", "Property Manager", "Other"] as const;
export type ContactType = typeof CONTACT_TYPES[number];

export const ISSUE_STATUSES = ["Open", "In Progress", "Waiting", "Resolved", "Closed"] as const;
export type IssueStatus = typeof ISSUE_STATUSES[number];

export const ISSUE_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export type IssuePriority = typeof ISSUE_PRIORITIES[number];

export type IssueWithDetails = typeof issues.$inferSelect & {
  contactName: string | null;
  assigneeName: string | null;
  threadCount: number;
  taskCount: number;
  noteCount: number;
};

export type IssueTimelineItem = {
  id: string;
  type: "created" | "status_changed" | "thread_linked" | "task_linked" | "note" | "activity";
  timestamp: string;
  summary: string;
  detail?: string;
  actorName?: string | null;
};

export type IssueThreadWithThread = typeof issueThreads.$inferSelect & {
  threadSubject: string | null;
  threadStatus: string | null;
  threadReceivedAt: string | null;
};

export type ContactWithDetails = typeof contacts.$inferSelect & {
  phones: typeof contactPhones.$inferSelect[];
  emails: typeof contactEmails.$inferSelect[];
  contactUnits?: (typeof contactUnits.$inferSelect & { associationName?: string | null; unitNumber?: string | null; building?: string | null })[];
  threadCount: number;
  associationName?: string | null;
  companyName?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  unitSummary?: string | null;
};

export type ContactTimelineItem = {
  id: string;
  type: "thread" | "note" | "task";
  timestamp: string;
  summary: string;
  detail?: string;
  entityId: number;
};

export type ThreadContactWithContact = typeof threadContacts.$inferSelect & {
  contact: typeof contacts.$inferSelect;
};

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

const createTaskInput = insertTaskSchema.extend({
  title: z.string().min(1, "Title is required"),
  status: z.enum(TASK_STATUSES).optional().default("Open"),
  priority: z.enum(TASK_PRIORITIES).optional().default("Normal"),
});

const updateTaskInput = createTaskInput.partial();

export const api = {
  auth: {
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: { 200: z.custom<typeof users.$inferSelect>(), 401: errorSchemas.unauthorized },
    },
    microsoftLogin: {
      method: 'GET' as const,
      path: '/api/auth/microsoft' as const,
      responses: { 302: z.void() },
    },
    microsoftCallback: {
      method: 'GET' as const,
      path: '/api/auth/microsoft/callback' as const,
      responses: { 302: z.void() },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: { 200: z.object({ message: z.string() }) },
    },
    status: {
      method: 'GET' as const,
      path: '/api/auth/status' as const,
      responses: { 200: z.object({ oauthConfigured: z.boolean() }) },
    },
  },

  users: {
    list: { method: 'GET' as const, path: '/api/users' as const, responses: { 200: z.array(z.custom<typeof users.$inferSelect>()) } },
    get: { method: 'GET' as const, path: '/api/users/:id' as const, responses: { 200: z.custom<typeof users.$inferSelect>() } },
    create: { method: 'POST' as const, path: '/api/users' as const, input: insertUserSchema, responses: { 201: z.custom<typeof users.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/users/:id' as const, input: insertUserSchema.partial(), responses: { 200: z.custom<typeof users.$inferSelect>() } },
  },

  mailboxes: {
    list: { method: 'GET' as const, path: '/api/mailboxes' as const, responses: { 200: z.array(z.custom<typeof mailboxes.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/mailboxes' as const, input: insertMailboxSchema, responses: { 201: z.custom<typeof mailboxes.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/mailboxes/:id' as const, input: insertMailboxSchema.partial(), responses: { 200: z.custom<typeof mailboxes.$inferSelect>() } },
    delete: { method: 'DELETE' as const, path: '/api/mailboxes/:id' as const, responses: { 204: z.void() } },
    sync: {
      method: 'POST' as const,
      path: '/api/mailboxes/:id/sync' as const,
      responses: {
        200: z.object({
          mailboxId: z.number(),
          mailboxName: z.string(),
          threadsUpserted: z.number(),
          messagesUpserted: z.number(),
          errors: z.array(z.string()),
        }),
      },
    },
  },

  threads: {
    list: {
      method: 'GET' as const,
      path: '/api/threads' as const,
      responses: { 200: z.array(z.custom<typeof emailThreads.$inferSelect & { unreadCount: number; latestSender: string | null }>()) },
    },
    get: { method: 'GET' as const, path: '/api/threads/:id' as const, responses: { 200: z.custom<typeof emailThreads.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/threads/:id' as const, input: insertEmailThreadSchema.partial(), responses: { 200: z.custom<typeof emailThreads.$inferSelect>() } },
    messages: {
      method: 'GET' as const,
      path: '/api/threads/:id/messages' as const,
      responses: { 200: z.array(z.custom<typeof messages.$inferSelect & { attachments: typeof attachments.$inferSelect[] }>()) },
    },
    claim: {
      method: 'POST' as const,
      path: '/api/threads/:id/claim' as const,
      responses: { 200: z.custom<typeof emailThreads.$inferSelect>() },
    },
    assign: {
      method: 'POST' as const,
      path: '/api/threads/:id/assign' as const,
      input: z.object({ userId: z.number() }),
      responses: { 200: z.custom<typeof emailThreads.$inferSelect>() },
    },
    unassign: {
      method: 'POST' as const,
      path: '/api/threads/:id/unassign' as const,
      responses: { 200: z.custom<typeof emailThreads.$inferSelect>() },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/threads/:id/status' as const,
      input: z.object({ status: z.string() }),
      responses: { 200: z.custom<typeof emailThreads.$inferSelect>() },
    },
    notes: {
      list: { method: 'GET' as const, path: '/api/threads/:id/notes' as const, responses: { 200: z.array(z.custom<NoteWithUser>()) } },
      create: {
        method: 'POST' as const,
        path: '/api/threads/:id/notes' as const,
        input: z.object({ body: z.string().min(1) }),
        responses: { 201: z.custom<NoteWithUser>() },
      },
    },
    activity: {
      method: 'GET' as const,
      path: '/api/threads/:id/activity' as const,
      responses: { 200: z.array(z.custom<ActivityWithUser>()) },
    },
    tasks: {
      list: { method: 'GET' as const, path: '/api/threads/:id/tasks' as const, responses: { 200: z.array(z.custom<TaskWithMeta>()) } },
    },
    linkContact: {
      method: 'POST' as const,
      path: '/api/threads/:id/link-contact' as const,
      input: z.object({ contactId: z.number() }),
      responses: { 200: z.custom<ThreadContactWithContact>() },
    },
    unlinkContact: {
      method: 'POST' as const,
      path: '/api/threads/:id/unlink-contact' as const,
      input: z.object({ contactId: z.number() }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    contacts: {
      list: { method: 'GET' as const, path: '/api/threads/:id/contacts' as const, responses: { 200: z.array(z.custom<ThreadContactWithContact>()) } },
    },
    issues: {
      list: { method: 'GET' as const, path: '/api/threads/:id/issues' as const, responses: { 200: z.array(z.custom<IssueWithDetails>()) } },
    },
  },

  contacts: {
    list: { method: 'GET' as const, path: '/api/contacts' as const, responses: { 200: z.array(z.custom<ContactWithDetails>()) } },
    get: { method: 'GET' as const, path: '/api/contacts/:id' as const, responses: { 200: z.custom<ContactWithDetails>() } },
    create: { method: 'POST' as const, path: '/api/contacts' as const, input: insertContactSchema, responses: { 201: z.custom<ContactWithDetails>() } },
    update: { method: 'PATCH' as const, path: '/api/contacts/:id' as const, input: insertContactSchema.partial(), responses: { 200: z.custom<ContactWithDetails>() } },
    delete: { method: 'DELETE' as const, path: '/api/contacts/:id' as const, responses: { 204: z.void() } },
    timeline: {
      method: 'GET' as const,
      path: '/api/contacts/:id/timeline' as const,
      responses: { 200: z.array(z.custom<ContactTimelineItem>()) },
    },
    addPhone: {
      method: 'POST' as const,
      path: '/api/contacts/:id/phones' as const,
      input: insertContactPhoneSchema.omit({ contactId: true }),
      responses: { 201: z.custom<typeof contactPhones.$inferSelect>() },
    },
    addEmail: {
      method: 'POST' as const,
      path: '/api/contacts/:id/emails' as const,
      input: insertContactEmailSchema.omit({ contactId: true }),
      responses: { 201: z.custom<typeof contactEmails.$inferSelect>() },
    },
  },

  properties: {
    list: { method: 'GET' as const, path: '/api/properties' as const, responses: { 200: z.array(z.custom<typeof properties.$inferSelect>()) } },
    get: { method: 'GET' as const, path: '/api/properties/:id' as const, responses: { 200: z.custom<typeof properties.$inferSelect>() } },
    create: { method: 'POST' as const, path: '/api/properties' as const, input: insertPropertySchema, responses: { 201: z.custom<typeof properties.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/properties/:id' as const, input: insertPropertySchema.partial(), responses: { 200: z.custom<typeof properties.$inferSelect>() } },
    delete: { method: 'DELETE' as const, path: '/api/properties/:id' as const, responses: { 204: z.void() } },
    units: {
      list: { method: 'GET' as const, path: '/api/properties/:id/units' as const, responses: { 200: z.array(z.custom<typeof units.$inferSelect>()) } },
      create: { method: 'POST' as const, path: '/api/properties/:id/units' as const, input: insertUnitSchema, responses: { 201: z.custom<typeof units.$inferSelect>() } },
    },
  },

  issues: {
    list: { method: 'GET' as const, path: '/api/issues' as const, responses: { 200: z.array(z.custom<IssueWithDetails>()) } },
    get: { method: 'GET' as const, path: '/api/issues/:id' as const, responses: { 200: z.custom<IssueWithDetails>() } },
    create: { method: 'POST' as const, path: '/api/issues' as const, input: insertIssueSchema, responses: { 201: z.custom<IssueWithDetails>() } },
    update: { method: 'PATCH' as const, path: '/api/issues/:id' as const, input: insertIssueSchema.partial(), responses: { 200: z.custom<IssueWithDetails>() } },
    delete: { method: 'DELETE' as const, path: '/api/issues/:id' as const, responses: { 204: z.void() } },
    linkThread: { method: 'POST' as const, path: '/api/issues/:id/link-thread' as const, input: z.object({ threadId: z.number() }), responses: { 200: z.custom<IssueThreadWithThread>() } },
    unlinkThread: { method: 'POST' as const, path: '/api/issues/:id/unlink-thread' as const, input: z.object({ threadId: z.number() }), responses: { 200: z.object({ success: z.boolean() }) } },
    linkTask: { method: 'POST' as const, path: '/api/issues/:id/link-task' as const, input: z.object({ taskId: z.number() }), responses: { 200: z.custom<TaskWithMeta>() } },
    unlinkTask: { method: 'POST' as const, path: '/api/issues/:id/unlink-task' as const, input: z.object({ taskId: z.number() }), responses: { 200: z.custom<TaskWithMeta>() } },
    threads: { method: 'GET' as const, path: '/api/issues/:id/threads' as const, responses: { 200: z.array(z.custom<IssueThreadWithThread>()) } },
    tasks: { method: 'GET' as const, path: '/api/issues/:id/tasks' as const, responses: { 200: z.array(z.custom<TaskWithMeta>()) } },
    notes: {
      list: { method: 'GET' as const, path: '/api/issues/:id/notes' as const, responses: { 200: z.array(z.custom<NoteWithUser>()) } },
      create: { method: 'POST' as const, path: '/api/issues/:id/notes' as const, input: z.object({ body: z.string().min(1) }), responses: { 201: z.custom<NoteWithUser>() } },
    },
    timeline: { method: 'GET' as const, path: '/api/issues/:id/timeline' as const, responses: { 200: z.array(z.custom<IssueTimelineItem>()) } },
  },

  tasks: {
    list: { method: 'GET' as const, path: '/api/tasks' as const, input: z.object({ assignedToMe: z.boolean().optional(), overdue: z.boolean().optional(), status: z.string().optional() }), responses: { 200: z.array(z.custom<TaskWithMeta>()) } },
    get: { method: 'GET' as const, path: '/api/tasks/:id' as const, responses: { 200: z.custom<TaskWithMeta>() } },
    create: { method: 'POST' as const, path: '/api/tasks' as const, input: createTaskInput, responses: { 201: z.custom<TaskWithMeta>() } },
    update: { method: 'PATCH' as const, path: '/api/tasks/:id' as const, input: updateTaskInput, responses: { 200: z.custom<TaskWithMeta>() } },
    delete: { method: 'DELETE' as const, path: '/api/tasks/:id' as const, responses: { 204: z.void() } },
  },

  calls: {
    list: { method: 'GET' as const, path: '/api/calls' as const, responses: { 200: z.array(z.custom<typeof calls.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/calls' as const, input: insertCallSchema, responses: { 201: z.custom<typeof calls.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/calls/:id' as const, input: insertCallSchema.partial(), responses: { 200: z.custom<typeof calls.$inferSelect>() } },
    callPop: {
      method: 'GET' as const,
      path: '/api/calls/pop' as const,
      responses: { 200: z.object({ contact: z.custom<typeof contacts.$inferSelect>().nullable(), phoneNumber: z.string() }) },
    },
  },

  graph: {
    status: {
      method: 'GET' as const,
      path: '/api/graph/status' as const,
      responses: { 200: z.object({ configured: z.boolean(), message: z.string() }) },
    },
  },

  typeLabels: {
    list: {
      method: 'GET' as const,
      path: '/api/type-labels' as const,
      responses: { 200: z.array(z.custom<typeof typeLabels.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/type-labels' as const,
      input: insertTypeLabelSchema,
      responses: { 201: z.custom<typeof typeLabels.$inferSelect>() },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/type-labels/:id' as const,
      input: insertTypeLabelSchema.partial(),
      responses: { 200: z.custom<typeof typeLabels.$inferSelect>() },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/type-labels/:id' as const,
      responses: { 204: z.void() },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}
