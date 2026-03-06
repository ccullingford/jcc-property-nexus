import { z } from 'zod';
import {
  insertUserSchema, insertMailboxSchema, insertEmailThreadSchema,
  insertContactSchema, insertPropertySchema, insertUnitSchema,
  insertIssueSchema, insertTaskSchema, insertCallSchema,
  users, mailboxes, emailThreads, messages, attachments,
  contacts, properties, units, issues, tasks, calls,
} from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  auth: {
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: { 200: z.custom<typeof users.$inferSelect>(), 401: errorSchemas.unauthorized },
    },
    loginScaffold: {
      method: 'POST' as const,
      path: '/api/auth/login-scaffold' as const,
      input: z.object({ email: z.string(), name: z.string().optional() }),
      responses: { 200: z.custom<typeof users.$inferSelect>() },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: { 200: z.object({ message: z.string() }) },
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
  },

  contacts: {
    list: { method: 'GET' as const, path: '/api/contacts' as const, responses: { 200: z.array(z.custom<typeof contacts.$inferSelect>()) } },
    get: { method: 'GET' as const, path: '/api/contacts/:id' as const, responses: { 200: z.custom<typeof contacts.$inferSelect>() } },
    create: { method: 'POST' as const, path: '/api/contacts' as const, input: insertContactSchema, responses: { 201: z.custom<typeof contacts.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/contacts/:id' as const, input: insertContactSchema.partial(), responses: { 200: z.custom<typeof contacts.$inferSelect>() } },
    delete: { method: 'DELETE' as const, path: '/api/contacts/:id' as const, responses: { 204: z.void() } },
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
    list: { method: 'GET' as const, path: '/api/issues' as const, responses: { 200: z.array(z.custom<typeof issues.$inferSelect>()) } },
    get: { method: 'GET' as const, path: '/api/issues/:id' as const, responses: { 200: z.custom<typeof issues.$inferSelect>() } },
    create: { method: 'POST' as const, path: '/api/issues' as const, input: insertIssueSchema, responses: { 201: z.custom<typeof issues.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/issues/:id' as const, input: insertIssueSchema.partial(), responses: { 200: z.custom<typeof issues.$inferSelect>() } },
    delete: { method: 'DELETE' as const, path: '/api/issues/:id' as const, responses: { 204: z.void() } },
  },

  tasks: {
    list: { method: 'GET' as const, path: '/api/tasks' as const, responses: { 200: z.array(z.custom<typeof tasks.$inferSelect>()) } },
    get: { method: 'GET' as const, path: '/api/tasks/:id' as const, responses: { 200: z.custom<typeof tasks.$inferSelect>() } },
    create: { method: 'POST' as const, path: '/api/tasks' as const, input: insertTaskSchema, responses: { 201: z.custom<typeof tasks.$inferSelect>() } },
    update: { method: 'PUT' as const, path: '/api/tasks/:id' as const, input: insertTaskSchema.partial(), responses: { 200: z.custom<typeof tasks.$inferSelect>() } },
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
