import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import expressSession from "express-session";
import { syncMailbox } from "./services/syncService";
import { isGraphConfigured } from "./services/graphService";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(expressSession({
    secret: process.env.SESSION_SECRET || "dev_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  }));

  // Seed initial data
  async function seedDatabase() {
    try {
      const existingMailboxes = await storage.getMailboxes();
      if (existingMailboxes.length === 0) {
        await storage.createMailbox({ name: "General Inquiry", type: "shared", isDefault: true, microsoftMailboxId: "inquiry@company.com" });
        await storage.createMailbox({ name: "Support", type: "shared", isDefault: false, microsoftMailboxId: "support@company.com" });
      }
    } catch (err) {
      console.error("Seed error:", err);
    }
  }
  seedDatabase();

  // ─── Auth ───────────────────────────────────────────────────────────────────
  app.post(api.auth.loginScaffold.path, async (req, res) => {
    try {
      const input = api.auth.loginScaffold.input.parse(req.body);
      let user = await storage.getUserByEmail(input.email);
      if (!user) user = await storage.createUser({ email: input.email, name: input.name || input.email.split("@")[0], role: "staff" });
      req.session.userId = user.id;
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => res.json({ message: "Logged out" }));
  });

  // ─── Users ──────────────────────────────────────────────────────────────────
  app.get(api.users.list.path, async (_req, res) => res.json(await storage.getUsers()));

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      res.status(201).json(await storage.createUser(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.users.update.path, async (req, res) => {
    try {
      const input = api.users.update.input.parse(req.body);
      res.json(await storage.updateUser(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Mailboxes ──────────────────────────────────────────────────────────────
  app.get(api.mailboxes.list.path, async (_req, res) => res.json(await storage.getMailboxes()));

  app.post(api.mailboxes.create.path, async (req, res) => {
    try {
      const input = api.mailboxes.create.input.parse(req.body);
      res.status(201).json(await storage.createMailbox(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.mailboxes.update.path, async (req, res) => {
    try {
      const input = api.mailboxes.update.input.parse(req.body);
      res.json(await storage.updateMailbox(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.mailboxes.delete.path, async (req, res) => {
    await storage.deleteMailbox(Number(req.params.id));
    res.status(204).send();
  });

  // ─── Mailbox Sync ────────────────────────────────────────────────────────────
  app.post(api.mailboxes.sync.path, requireAuth, async (req, res) => {
    try {
      const mailboxId = Number(req.params.id);
      const mailbox = await storage.getMailbox(mailboxId);
      if (!mailbox) return res.status(404).json({ message: "Mailbox not found" });

      const result = await syncMailbox(mailbox);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Sync failed" });
    }
  });

  // ─── Email Threads ──────────────────────────────────────────────────────────
  app.get(api.threads.list.path, requireAuth, async (req, res) => {
    const mailboxId = req.query.mailboxId ? Number(req.query.mailboxId) : undefined;
    res.json(await storage.getThreads(mailboxId));
  });

  app.get(api.threads.get.path, requireAuth, async (req, res) => {
    const thread = await storage.getThread(Number(req.params.id));
    if (!thread) return res.status(404).json({ message: "Thread not found" });
    res.json(thread);
  });

  app.put(api.threads.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.threads.update.input.parse(req.body);
      res.json(await storage.updateThread(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Thread Messages ─────────────────────────────────────────────────────────
  app.get(api.threads.messages.path, requireAuth, async (req, res) => {
    const threadId = Number(req.params.id);
    const thread = await storage.getThread(threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });
    const msgs = await storage.getMessagesByThread(threadId);
    res.json(msgs);
  });

  // ─── Contacts ───────────────────────────────────────────────────────────────
  app.get(api.contacts.list.path, async (_req, res) => res.json(await storage.getContacts()));

  app.get(api.contacts.get.path, async (req, res) => {
    const contact = await storage.getContact(Number(req.params.id));
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.post(api.contacts.create.path, async (req, res) => {
    try {
      const input = api.contacts.create.input.parse(req.body);
      res.status(201).json(await storage.createContact(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.contacts.update.path, async (req, res) => {
    try {
      const input = api.contacts.update.input.parse(req.body);
      res.json(await storage.updateContact(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.contacts.delete.path, async (req, res) => {
    await storage.deleteContact(Number(req.params.id));
    res.status(204).send();
  });

  // ─── Properties ─────────────────────────────────────────────────────────────
  app.get(api.properties.list.path, async (_req, res) => res.json(await storage.getProperties()));

  app.get(api.properties.get.path, async (req, res) => {
    const property = await storage.getProperty(Number(req.params.id));
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  });

  app.post(api.properties.create.path, async (req, res) => {
    try {
      const input = api.properties.create.input.parse(req.body);
      res.status(201).json(await storage.createProperty(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.properties.update.path, async (req, res) => {
    try {
      const input = api.properties.update.input.parse(req.body);
      res.json(await storage.updateProperty(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.properties.delete.path, async (req, res) => {
    await storage.deleteProperty(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.properties.units.list.path, async (req, res) => {
    res.json(await storage.getUnitsByProperty(Number(req.params.id)));
  });

  app.post(api.properties.units.create.path, async (req, res) => {
    try {
      const input = api.properties.units.create.input.parse({ ...req.body, propertyId: Number(req.params.id) });
      res.status(201).json(await storage.createUnit(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Issues ─────────────────────────────────────────────────────────────────
  app.get(api.issues.list.path, async (_req, res) => res.json(await storage.getIssues()));

  app.get(api.issues.get.path, async (req, res) => {
    const issue = await storage.getIssue(Number(req.params.id));
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.json(issue);
  });

  app.post(api.issues.create.path, async (req, res) => {
    try {
      const input = api.issues.create.input.parse(req.body);
      res.status(201).json(await storage.createIssue(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.issues.update.path, async (req, res) => {
    try {
      const input = api.issues.update.input.parse(req.body);
      res.json(await storage.updateIssue(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.issues.delete.path, async (req, res) => {
    await storage.deleteIssue(Number(req.params.id));
    res.status(204).send();
  });

  // ─── Tasks ──────────────────────────────────────────────────────────────────
  app.get(api.tasks.list.path, async (req, res) => {
    const issueId = req.query.issueId ? Number(req.query.issueId) : undefined;
    res.json(await storage.getTasks(issueId));
  });

  app.get(api.tasks.get.path, async (req, res) => {
    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      res.status(201).json(await storage.createTask(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.tasks.update.path, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);
      res.json(await storage.updateTask(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    await storage.deleteTask(Number(req.params.id));
    res.status(204).send();
  });

  // ─── Calls ──────────────────────────────────────────────────────────────────
  // Call pop must be before /api/calls/:id to avoid routing conflict
  app.get(api.calls.callPop.path, async (req, res) => {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ message: "phone query param required" });
    const contact = await storage.findContactByPhone(phone) ?? null;
    res.json({ contact, phoneNumber: phone });
  });

  app.get(api.calls.list.path, async (_req, res) => res.json(await storage.getCalls()));

  app.post(api.calls.create.path, async (req, res) => {
    try {
      const input = api.calls.create.input.parse(req.body);
      res.status(201).json(await storage.createCall(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.calls.update.path, async (req, res) => {
    try {
      const input = api.calls.update.input.parse(req.body);
      res.json(await storage.updateCall(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Graph Status ────────────────────────────────────────────────────────────
  app.get(api.graph.status.path, (_req, res) => {
    const configured = isGraphConfigured();
    const hasConnector = !!(
      process.env.REPLIT_CONNECTORS_HOSTNAME &&
      (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL)
    );
    const hasAppOnly = !!(
      process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET
    );
    const method = hasConnector ? "Replit Outlook connector" : hasAppOnly ? "app-only credentials" : null;
    res.json({
      configured,
      method,
      message: configured
        ? `Microsoft Graph is configured via ${method}. Sync is ready.`
        : "Microsoft Graph is not configured. Connect the Outlook integration or set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_CLIENT_SECRET.",
    });
  });

  return httpServer;
}
