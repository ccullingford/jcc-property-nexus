import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import expressSession from "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up basic session middleware
  app.use(expressSession({
    secret: process.env.SESSION_SECRET || 'dev_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }
  }));

  // Seed data function
  async function seedDatabase() {
    try {
      const existingMailboxes = await storage.getMailboxes();
      if (existingMailboxes.length === 0) {
        await storage.createMailbox({
          name: "General Inquiry",
          type: "shared",
          isDefault: true,
          microsoftMailboxId: "inquiry@company.com"
        });
        await storage.createMailbox({
          name: "Support",
          type: "shared",
          isDefault: false,
          microsoftMailboxId: "support@company.com"
        });
      }
    } catch (err) {
      console.error("Failed to seed database:", err);
    }
  }
  
  // Call seed once
  seedDatabase();

  // Auth Scaffold
  app.post(api.auth.loginScaffold.path, async (req, res) => {
    try {
      const input = api.auth.loginScaffold.input.parse(req.body);
      
      // Upsert user for scaffold
      let user = await storage.getUserByEmail(input.email);
      if (!user) {
        user = await storage.createUser({
          email: input.email,
          name: input.name || input.email.split('@')[0],
          role: 'staff'
        });
      }
      
      req.session.userId = user.id;
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  // Users
  app.get(api.users.list.path, async (req, res) => {
    const usersList = await storage.getUsers();
    res.json(usersList);
  });

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.users.update.path, async (req, res) => {
    try {
      const input = api.users.update.input.parse(req.body);
      const user = await storage.updateUser(Number(req.params.id), input);
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Mailboxes
  app.get(api.mailboxes.list.path, async (req, res) => {
    const mboxes = await storage.getMailboxes();
    res.json(mboxes);
  });

  app.post(api.mailboxes.create.path, async (req, res) => {
    try {
      const input = api.mailboxes.create.input.parse(req.body);
      const mbox = await storage.createMailbox(input);
      res.status(201).json(mbox);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.mailboxes.update.path, async (req, res) => {
    try {
      const input = api.mailboxes.update.input.parse(req.body);
      const mbox = await storage.updateMailbox(Number(req.params.id), input);
      res.json(mbox);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.mailboxes.delete.path, async (req, res) => {
    await storage.deleteMailbox(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
