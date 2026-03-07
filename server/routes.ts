import { importAssociations, importUnits } from "./services/associationImportService";
import { previewCombined, executeCombined } from "./services/combinedImportService";
import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  claimThread,
  assignThread,
  unassignThread,
  updateThreadStatus,
  addNote,
  getNotesWithUsers,
  getActivityWithUsers,
  isValidStatus,
} from "./services/threadWorkflowService";
import {
  createTask as createTaskService,
  updateTask as updateTaskService,
} from "./services/taskService";
import { searchContacts, getContactWithDetails } from "./services/contactSearchService";
import type { ContactFilters } from "./services/contactSearchService";
import { createContact, updateContact as updateContactService, addContactPhone, addContactEmail, linkThreadContact, unlinkThreadContact, getThreadContacts } from "./services/contactService";
import { previewImport, executeImport } from "./services/contactImportService";
import { findDuplicates, mergeContacts } from "./services/contactMergeService";
import { getContactTimeline } from "./services/contactTimelineService";
import { createIssue as createIssueService, updateIssue as updateIssueService, getIssueWithDetails } from "./services/issueService";
import { listIssues } from "./services/issueQueryService";
import { listAssociations, getAssociation, getAssociationUnits, createAssociation, updateAssociation } from "./services/associationService";
import { listUnits, getUnit, createUnit, updateUnit } from "./services/unitService";
import { linkIssueThread, unlinkIssueThread, linkIssueTask, unlinkIssueTask, getIssueThreads, getIssueTasks, getThreadIssues } from "./services/issueLinkService";
import { getIssueTimeline } from "./services/issueTimelineService";
import { getNotesByIssueWithUsers } from "./services/threadWorkflowService";
import expressSession from "express-session";
import { syncMailbox } from "./services/syncService";
import { isGraphConfigured, sendMail, fetchAttachmentContent } from "./services/graphService";
import { findContactByEmail } from "./services/contactIdentityService";
import type { ThreadFilters } from "./storage";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  getMicrosoftUserProfile,
  getCanonicalEmail,
  getDisplayName,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getOAuthConfig,
  isOAuthConfigured,
} from "./services/microsoftAuthService";

// ─── Session types ────────────────────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
    oauthState: string;
    oauthVerifier: string;
    oauthRedirectUri: string;
  }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const role = req.session.userRole ?? "staff";
    if (!roles.includes(role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.userRole ?? "staff";
  if (role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

// ─── Redirect-URI builder ─────────────────────────────────────────────────────
function buildRedirectUri(req: Request): string {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}/api/auth/microsoft/callback`;
}

// ─── Auth-exempt API paths ────────────────────────────────────────────────────
// These are matched against req.path relative to /api
const AUTH_OPEN = [
  "/auth/me",
  "/auth/microsoft",
  "/auth/microsoft/callback",
  "/auth/logout",
  "/auth/status",
];

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(expressSession({
    secret: process.env.SESSION_SECRET || "dev_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }));

  // ─── Global auth guard (applied after session middleware) ─────────────────
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const isOpen = AUTH_OPEN.some(p => req.path === p || req.path.startsWith(p + "/"));
    if (isOpen) return next();
    return requireAuth(req, res, next);
  });

  // Seed initial data
  async function seedDatabase() {
    try {
      const existingMailboxes = await storage.getMailboxes();
      if (existingMailboxes.length === 0) {
        await storage.createMailbox({ name: "General Inquiry", type: "shared", isDefault: true, microsoftMailboxId: "inquiry@company.com" });
        await storage.createMailbox({ name: "Support", type: "shared", isDefault: false, microsoftMailboxId: "support@company.com" });
      }

      const existingLabels = await storage.getTypeLabels();
      if (existingLabels.length === 0) {
        const issueTypes = ["Maintenance", "Violation", "Request", "Billing", "General"];
        const taskTypes = ["Follow-up", "Inspection", "Repair", "Administrative", "Communication", "General"];

        for (const [idx, name] of issueTypes.entries()) {
          await storage.createTypeLabel({ category: "issue_type", name, sortOrder: idx });
        }
        for (const [idx, name] of taskTypes.entries()) {
          await storage.createTypeLabel({ category: "task_type", name, sortOrder: idx });
        }
      }
    } catch (err) {
      console.error("Seed error:", err);
    }
  }
  seedDatabase();

  // ─── Auth: OAuth status ───────────────────────────────────────────────────
  app.get(api.auth.status.path, (_req, res) => {
    res.json({ oauthConfigured: isOAuthConfigured() });
  });

  // ─── Auth: Initiate Microsoft OAuth ──────────────────────────────────────
  app.get(api.auth.microsoftLogin.path, (req, res) => {
    const config = getOAuthConfig();
    if (!config) {
      return res.redirect("/login?error=not_configured");
    }

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();
    const redirectUri = buildRedirectUri(req);

    // Store PKCE params in session (pre-auth)
    req.session.oauthState = state;
    req.session.oauthVerifier = verifier;
    req.session.oauthRedirectUri = redirectUri;

    const authUrl = buildAuthorizationUrl({
      clientId: config.clientId,
      tenantId: config.tenantId,
      redirectUri,
      state,
      codeChallenge: challenge,
    });

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[auth] Session save error before OAuth redirect:", saveErr);
        return res.redirect("/login?error=session_error");
      }
      return res.redirect(authUrl);
    });
  });

  // ─── Auth: Microsoft OAuth callback ──────────────────────────────────────
  app.get(api.auth.microsoftCallback.path, async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      console.error("OAuth error from Microsoft:", error, req.query.error_description);
      return res.redirect(`/login?error=auth_failed`);
    }

    // Validate state (CSRF protection)
    if (!state || state !== req.session.oauthState) {
      return res.redirect("/login?error=invalid_state");
    }

    if (!code) {
      return res.redirect("/login?error=auth_failed");
    }

    const config = getOAuthConfig();
    if (!config) {
      return res.redirect("/login?error=not_configured");
    }

    try {
      const redirectUri = req.session.oauthRedirectUri || buildRedirectUri(req);
      const codeVerifier = req.session.oauthVerifier;

      // Clear PKCE params from session
      delete req.session.oauthState;
      delete req.session.oauthVerifier;
      delete req.session.oauthRedirectUri;

      // Exchange code for tokens
      const tokens = await exchangeCodeForToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
        redirectUri,
        code,
        codeVerifier,
      });

      // Get user profile from Microsoft
      const profile = await getMicrosoftUserProfile(tokens.access_token);
      const email = getCanonicalEmail(profile);
      const displayName = getDisplayName(profile);

      // Domain check (if configured)
      if (config.allowedDomain && !email.endsWith(`@${config.allowedDomain}`)) {
        return res.redirect("/login?error=domain_not_allowed");
      }

      // Look up user in the users table
      let user = await storage.getUserByEmail(email);

      if (!user) {
        // Bootstrap: if users table is empty, make the first login an admin
        const allUsers = await storage.getUsers();
        if (allUsers.length === 0) {
          user = await storage.createUser({ email, name: displayName, role: "admin" });
        } else {
          // If ALLOWED_EMAIL_DOMAIN is set and domain matches, auto-create as staff
          if (config.allowedDomain && email.endsWith(`@${config.allowedDomain}`)) {
            user = await storage.createUser({ email, name: displayName, role: "staff" });
          } else {
            // User not registered — deny access
            return res.redirect("/login?error=access_denied");
          }
        }
      }

      // Store delegated tokens for personal mailbox sync
      if (tokens.access_token) {
        await storage.updateUserTokens(user.id, {
          msAccessToken: tokens.access_token,
          msRefreshToken: tokens.refresh_token ?? "",
          msTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        });
      }

      // Establish session
      req.session.userId = user.id;
      req.session.userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[auth] Session save error:", saveErr);
          return res.redirect("/login?error=session_error");
        }
        return res.redirect("/inbox");
      });
    } catch (err: any) {
      console.error("[auth] OAuth callback error:", err.message);
      return res.redirect("/login?error=auth_failed");
    }
  });

  // ─── Auth: Current user ───────────────────────────────────────────────────
  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "User not found" });
    }
    req.session.userRole = user.role;
    res.json(user);
  });

  // ─── Auth: Logout ─────────────────────────────────────────────────────────
  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => res.json({ message: "Logged out" }));
  });

  // ─── Users (admin-only for management) ────────────────────────────────────
  app.get(api.users.list.path, async (_req, res) => res.json(await storage.getUsers()));

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.post(api.users.create.path, requireRole("admin", "manager"), async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      res.status(201).json(await storage.createUser(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.users.update.path, requireRole("admin"), async (req, res) => {
    try {
      const input = api.users.update.input.parse(req.body);
      res.json(await storage.updateUser(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Mailboxes (admin-only for management) ────────────────────────────────
  app.get(api.mailboxes.list.path, requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const role = req.session.userRole;
    // Admins see all; regular users only see shared + their own personal mailboxes
    const forUserId = role === "admin" ? undefined : userId;
    res.json(await storage.getMailboxes(forUserId));
  });

  app.post(api.mailboxes.create.path, requireRole("admin"), async (req, res) => {
    try {
      const input = api.mailboxes.create.input.parse(req.body);
      // Auto-assign delegated mode if syncMode is "delegated" without explicit ownerUserId
      if (input.syncMode === "delegated" && !input.ownerUserId) {
        input.ownerUserId = req.session.userId ?? null;
      }
      res.status(201).json(await storage.createMailbox(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.put(api.mailboxes.update.path, requireRole("admin"), async (req, res) => {
    try {
      const input = api.mailboxes.update.input.parse(req.body);
      res.json(await storage.updateMailbox(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.mailboxes.delete.path, requireRole("admin"), async (req, res) => {
    try {
      const mailboxId = Number(req.params.id);
      const threadCount = await storage.countThreadsByMailbox(mailboxId);
      if (threadCount > 0) {
        return res.status(409).json({
          message: `Cannot delete this mailbox — it has ${threadCount} thread${threadCount === 1 ? "" : "s"}. Archive or reassign them first.`,
        });
      }
      await storage.deleteMailbox(mailboxId);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to delete mailbox" });
    }
  });

  // ─── Mailbox Sync ─────────────────────────────────────────────────────────
  app.post(api.mailboxes.sync.path, requireAuth, async (req, res) => {
    try {
      const mailbox = await storage.getMailbox(Number(req.params.id));
      if (!mailbox) return res.status(404).json({ message: "Mailbox not found" });

      // For delegated mailboxes, only the owner (or an admin) may trigger sync
      if (mailbox.syncMode === "delegated" && mailbox.ownerUserId !== req.session.userId) {
        const role = req.session.userRole;
        if (role !== "admin") {
          return res.status(403).json({ message: "Only the mailbox owner can sync a personal mailbox." });
        }
      }

      const result = await syncMailbox(mailbox);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Sync failed" });
    }
  });

  // ─── Email Threads ────────────────────────────────────────────────────────
  app.get(api.threads.list.path, async (req, res) => {
    const q = req.query;
    const filters: ThreadFilters = {};
    if (q.mailboxId) filters.mailboxId = Number(q.mailboxId);
    if (q.assignedUserId) filters.assignedUserId = q.assignedUserId === "unassigned" ? null : Number(q.assignedUserId);
    if (q.status && typeof q.status === "string") filters.status = q.status;
    if (q.unreadOnly === "true") filters.unreadOnly = true;
    if (q.hasAttachments === "true") filters.hasAttachments = true;
    if (q.sentOnly === "true") filters.sentOnly = true;
    if (q.sentOnly === "false") filters.sentOnly = false;
    if (q.contactId) filters.contactId = Number(q.contactId);
    if (q.search && typeof q.search === "string") filters.search = q.search;
    if (q.dateFrom) filters.dateFrom = new Date(q.dateFrom as string);
    if (q.dateTo) filters.dateTo = new Date(q.dateTo as string);
    res.json(await storage.getThreads(filters));
  });

  app.get(api.threads.get.path, async (req, res) => {
    const thread = await storage.getThread(Number(req.params.id));
    if (!thread) return res.status(404).json({ message: "Thread not found" });
    res.json(thread);
  });

  app.put(api.threads.update.path, async (req, res) => {
    try {
      const input = api.threads.update.input.parse(req.body);
      res.json(await storage.updateThread(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Thread Messages ──────────────────────────────────────────────────────
  app.get(api.threads.messages.path, async (req, res) => {
    const threadId = Number(req.params.id);
    const thread = await storage.getThread(threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });
    res.json(await storage.getMessagesByThread(threadId));
  });

  // ─── Reply to Thread ──────────────────────────────────────────────────────
  app.post("/api/threads/:id/reply", requireAuth, async (req, res) => {
    try {
      const threadId = Number(req.params.id);
      const { body, replyAll, to } = req.body as { body: string; replyAll?: boolean; to?: string[] };
      if (!body?.trim()) return res.status(400).json({ message: "Reply body is required" });

      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ message: "Thread not found" });

      const mailbox = await storage.getMailbox(thread.mailboxId);
      if (!mailbox?.microsoftMailboxId) return res.status(400).json({ message: "Mailbox not configured" });

      const allMessages = await storage.getMessagesByThread(threadId);
      const firstInbound = allMessages.find(m => (m as any).direction !== "outbound") ?? allMessages[0];

      const recipients: Array<{ emailAddress: { address: string; name?: string } }> = [];
      if (to && to.length > 0) {
        to.forEach(addr => recipients.push({ emailAddress: { address: addr } }));
      } else if (firstInbound) {
        recipients.push({ emailAddress: { address: firstInbound.senderEmail, name: firstInbound.senderName ?? undefined } });
        if (replyAll && firstInbound.recipients) {
          firstInbound.recipients.forEach(r => {
            if (r !== mailbox.microsoftMailboxId) recipients.push({ emailAddress: { address: r } });
          });
        }
      }

      if (recipients.length === 0) return res.status(400).json({ message: "No recipients found" });

      const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;

      await sendMail(mailbox.microsoftMailboxId, {
        subject,
        body: { contentType: "HTML", content: body },
        toRecipients: recipients,
        conversationId: thread.microsoftThreadId ?? undefined,
      });

      // Store outbound message in DB
      const now = new Date();
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const savedMsg = await storage.createMessage({
        threadId,
        microsoftMessageId: null,
        senderEmail: mailbox.microsoftMailboxId,
        senderName: user?.name ?? "Me",
        recipients: recipients.map(r => r.emailAddress.address),
        subject,
        bodyPreview: body.replace(/<[^>]+>/g, "").slice(0, 200),
        bodyText: null,
        bodyHtml: body,
        receivedAt: now,
        hasAttachments: false,
        isRead: true,
        direction: "outbound",
        updatedAt: now,
      });

      await storage.updateThread(threadId, { lastMessageAt: now, updatedAt: now });

      res.status(201).json(savedMsg);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Reply failed" });
    }
  });

  // ─── Thread Workflow Actions ──────────────────────────────────────────────
  app.post(api.threads.claim.path, async (req, res) => {
    try {
      const thread = await claimThread(Number(req.params.id), req.session.userId!, storage);
      res.json(thread);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.post(api.threads.assign.path, async (req, res) => {
    try {
      const { userId } = api.threads.assign.input.parse(req.body);
      const thread = await assignThread(Number(req.params.id), userId, req.session.userId!, storage);
      res.json(thread);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.post(api.threads.unassign.path, async (req, res) => {
    try {
      const thread = await unassignThread(Number(req.params.id), req.session.userId!, storage);
      res.json(thread);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.patch(api.threads.updateStatus.path, async (req, res) => {
    try {
      const { status } = api.threads.updateStatus.input.parse(req.body);
      if (!isValidStatus(status)) return res.status(400).json({ message: `Invalid status. Allowed: Open, Waiting, Closed, Archived` });
      const thread = await updateThreadStatus(Number(req.params.id), status, req.session.userId!, storage);
      res.json(thread);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  // ─── Thread Notes ─────────────────────────────────────────────────────────
  app.get(api.threads.notes.list.path, async (req, res) => {
    try {
      res.json(await getNotesWithUsers(Number(req.params.id), storage));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.post(api.threads.notes.create.path, async (req, res) => {
    try {
      const { body } = api.threads.notes.create.input.parse(req.body);
      const note = await addNote(Number(req.params.id), req.session.userId!, body, storage);
      res.status(201).json(note);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  // ─── Thread Activity ──────────────────────────────────────────────────────
  app.get(api.threads.activity.path, async (req, res) => {
    try {
      res.json(await getActivityWithUsers(Number(req.params.id), storage));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  // ─── Contacts ─────────────────────────────────────────────────────────────
  app.get("/api/contacts/lookup", async (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    if (!email) return res.status(400).json({ message: "email param required" });
    const contact = await findContactByEmail(email);
    if (!contact) return res.status(404).json({ message: "No contact found" });
    res.json(contact);
  });

  app.get(api.contacts.list.path, async (req, res) => {
    try {
      const filters: ContactFilters = {
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        contactType: typeof req.query.contactType === "string" ? req.query.contactType : undefined,
        hasThreads: req.query.hasThreads === "true" ? true : undefined,
        hasOpenIssues: req.query.hasOpenIssues === "true" ? true : undefined,
        associationId: typeof req.query.associationId === "string" ? Number(req.query.associationId) : undefined,
      };
      res.json(await searchContacts(filters));
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Contact Import ───────────────────────────────────────────────────────
  app.post("/api/contacts/import/preview", requireAuth, async (req, res) => {
    try {
      const { rows, mapping } = req.body;
      if (!Array.isArray(rows) || !mapping) return res.status(400).json({ message: "rows and mapping required" });
      const result = await previewImport(rows, mapping);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Preview failed" });
    }
  });

  app.post("/api/contacts/import/execute", requireAuth, async (req, res) => {
    try {
      const { rows, mapping, mode, filename } = req.body;
      if (!Array.isArray(rows) || !mapping) return res.status(400).json({ message: "rows and mapping required" });
      const userId = req.session.userId!;
      const result = await executeImport(rows, mapping, mode ?? "upsert", userId, filename ?? "import.csv");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Import failed" });
    }
  });

  // ─── Combined Import ──────────────────────────────────────────────────────
  app.post("/api/import/combined/preview", requireAuth, async (req, res) => {
    try {
      const { rows, mapping } = req.body;
      if (!Array.isArray(rows) || !mapping) return res.status(400).json({ message: "rows and mapping required" });
      const result = previewCombined(rows, mapping);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Preview failed" });
    }
  });

  app.post("/api/import/combined/execute", requireAuth, async (req, res) => {
    try {
      const { rows, mapping } = req.body;
      if (!Array.isArray(rows) || !mapping) return res.status(400).json({ message: "rows and mapping required" });
      const result = await executeCombined(rows, mapping);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Import failed" });
    }
  });

  // ─── Contact Duplicates & Merge ───────────────────────────────────────────
  app.get("/api/contacts/duplicates", requireAuth, async (req, res) => {
    try {
      res.json(await findDuplicates());
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to find duplicates" });
    }
  });

  app.post("/api/contacts/merge", requireAuth, async (req, res) => {
    try {
      const { sourceId, targetId } = req.body;
      if (!sourceId || !targetId) return res.status(400).json({ message: "sourceId and targetId required" });
      const merged = await mergeContacts(Number(sourceId), Number(targetId), req.session.userId!);
      res.json(merged);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Merge failed" });
    }
  });

  app.get(api.contacts.get.path, async (req, res) => {
    const contact = await getContactWithDetails(Number(req.params.id));
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.post(api.contacts.create.path, async (req, res) => {
    try {
      const input = api.contacts.create.input.parse(req.body);
      res.status(201).json(await createContact(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.patch(api.contacts.update.path, async (req, res) => {
    try {
      const input = api.contacts.update.input.parse(req.body);
      const updated = await updateContactService(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Contact not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete(api.contacts.delete.path, async (req, res) => {
    await storage.deleteContact(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.contacts.timeline.path, async (req, res) => {
    try {
      res.json(await getContactTimeline(Number(req.params.id)));
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.contacts.addPhone.path, async (req, res) => {
    try {
      const input = api.contacts.addPhone.input.parse(req.body);
      res.status(201).json(await addContactPhone(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.contacts.addEmail.path, async (req, res) => {
    try {
      const input = api.contacts.addEmail.input.parse(req.body);
      res.status(201).json(await addContactEmail(Number(req.params.id), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Properties ───────────────────────────────────────────────────────────
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

  // ─── Associations ─────────────────────────────────────────────────────────
  app.get("/api/associations", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const isActive = req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined;
      res.json(await listAssociations({ q, isActive }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/associations", requireAuth, async (req, res) => {
    try {
      const { name, code, mailboxId, addressLine1, addressLine2, city, state, postalCode, notes, isActive } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const assoc = await createAssociation({ name, code, mailboxId, addressLine1, addressLine2, city, state, postalCode, notes, isActive });
      res.status(201).json(assoc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/associations/:id", async (req, res) => {
    try {
      const assoc = await getAssociation(Number(req.params.id));
      if (!assoc) return res.status(404).json({ message: "Association not found" });
      res.json(assoc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/associations/:id", requireAuth, async (req, res) => {
    try {
      const { name, code, mailboxId, addressLine1, addressLine2, city, state, postalCode, notes, isActive } = req.body;
      const assoc = await updateAssociation(Number(req.params.id), { name, code, mailboxId, addressLine1, addressLine2, city, state, postalCode, notes, isActive });
      if (!assoc) return res.status(404).json({ message: "Association not found" });
      res.json(assoc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/associations/:id/units", async (req, res) => {
    try {
      const unitRows = await getAssociationUnits(Number(req.params.id));
      res.json(unitRows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Units ────────────────────────────────────────────────────────────────
  app.get("/api/units", async (req, res) => {
    try {
      const associationId = typeof req.query.associationId === "string" ? Number(req.query.associationId) : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json(await listUnits({ associationId, q }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/units", requireAuth, async (req, res) => {
    try {
      const { associationId, unitNumber, building, streetAddress, notes, isActive } = req.body;
      if (!associationId) return res.status(400).json({ message: "associationId is required" });
      if (!unitNumber) return res.status(400).json({ message: "unitNumber is required" });
      const unit = await createUnit({ associationId, unitNumber, building, streetAddress, notes, isActive });
      res.status(201).json(unit);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/units/:id", async (req, res) => {
    try {
      const unit = await getUnit(Number(req.params.id));
      if (!unit) return res.status(404).json({ message: "Unit not found" });
      res.json(unit);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/units/:id", requireAuth, async (req, res) => {
    try {
      const { associationId, unitNumber, building, streetAddress, notes, isActive } = req.body;
      const unit = await updateUnit(Number(req.params.id), { associationId, unitNumber, building, streetAddress, notes, isActive });
      if (!unit) return res.status(404).json({ message: "Unit not found" });
      res.json(unit);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ─── Issues ───────────────────────────────────────────────────────────────
  app.get(api.issues.list.path, async (req, res) => {
    try {
      const { status, priority, openOnly, closedOnly, contactId, associationId } = req.query;
      const results = await listIssues({
        status: typeof status === 'string' ? status : undefined,
        priority: typeof priority === 'string' ? priority : undefined,
        openOnly: openOnly === 'true',
        closedOnly: closedOnly === 'true',
        contactId: typeof contactId === 'string' ? Number(contactId) : undefined,
        associationId: typeof associationId === 'string' ? Number(associationId) : undefined,
      });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.issues.get.path, async (req, res) => {
    try {
      const issue = await getIssueWithDetails(Number(req.params.id));
      if (!issue) return res.status(404).json({ message: "Issue not found" });
      res.json(issue);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.create.path, async (req, res) => {
    try {
      const { title, description, contactId, assignedUserId, priority, status, associationId, unitId } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      const issue = await createIssueService(
        { title, description, contactId, assignedUserId, priority, status, associationId, unitId },
        req.session.userId,
      );
      res.status(201).json(issue);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch(api.issues.update.path, async (req, res) => {
    try {
      const issue = await updateIssueService(Number(req.params.id), req.body, req.session.userId);
      if (!issue) return res.status(404).json({ message: "Issue not found" });
      res.json(issue);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete(api.issues.delete.path, async (req, res) => {
    await storage.deleteIssue(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.issues.threads.path, async (req, res) => {
    try {
      res.json(await getIssueThreads(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.linkThread.path, async (req, res) => {
    try {
      const { threadId } = api.issues.linkThread.input.parse(req.body);
      res.json(await linkIssueThread(Number(req.params.id), threadId, req.session.userId));
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.unlinkThread.path, async (req, res) => {
    try {
      const { threadId } = api.issues.unlinkThread.input.parse(req.body);
      await unlinkIssueThread(Number(req.params.id), threadId, req.session.userId);
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.issues.tasks.path, async (req, res) => {
    try {
      res.json(await getIssueTasks(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.linkTask.path, async (req, res) => {
    try {
      const { taskId } = api.issues.linkTask.input.parse(req.body);
      const result = await linkIssueTask(Number(req.params.id), taskId, req.session.userId);
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.unlinkTask.path, async (req, res) => {
    try {
      const { taskId } = api.issues.unlinkTask.input.parse(req.body);
      const result = await unlinkIssueTask(Number(req.params.id), taskId, req.session.userId);
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.issues.notes.list.path, async (req, res) => {
    try {
      res.json(await getNotesByIssueWithUsers(Number(req.params.id), storage));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.issues.notes.create.path, async (req, res) => {
    try {
      const { body } = api.issues.notes.create.input.parse(req.body);
      const note = await storage.createNote({ issueId: Number(req.params.id), userId: req.session.userId!, body });
      const author = req.session.userId ? await storage.getUser(req.session.userId) : null;
      res.status(201).json({
        ...note,
        authorName: author?.name ?? null,
        authorEmail: author?.email ?? null,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.issues.timeline.path, async (req, res) => {
    try {
      res.json(await getIssueTimeline(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.threads.issues.list.path, async (req, res) => {
    try {
      const threadIssues = await getThreadIssues(Number(req.params.id));
      const enriched = await Promise.all(threadIssues.map(i => getIssueWithDetails(i.id)));
      res.json(enriched.filter(Boolean));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Thread Tasks ─────────────────────────────────────────────────────────
  app.get(api.threads.tasks.list.path, async (req, res) => {
    try {
      const threadId = Number(req.params.id);
      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ message: "Thread not found" });
      res.json(await storage.getTasksByThread(threadId));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Thread Contacts ──────────────────────────────────────────────────────
  app.get(api.threads.contacts.list.path, async (req, res) => {
    try {
      res.json(await getThreadContacts(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.threads.linkContact.path, async (req, res) => {
    try {
      const { contactId } = api.threads.linkContact.input.parse(req.body);
      const threadId = Number(req.params.id);
      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ message: "Thread not found" });
      res.json(await linkThreadContact(threadId, contactId));
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.threads.unlinkContact.path, async (req, res) => {
    try {
      const { contactId } = api.threads.unlinkContact.input.parse(req.body);
      await unlinkThreadContact(Number(req.params.id), contactId);
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Tasks ────────────────────────────────────────────────────────────────
  app.get(api.tasks.list.path, async (req, res) => {
    try {
      const { assignedToMe, overdue, status, contactId } = req.query;
      const options: { assignedUserId?: number; overdue?: boolean; status?: string; contactId?: number } = {};
      if (assignedToMe === "true") options.assignedUserId = req.session.userId!;
      if (overdue === "true") options.overdue = true;
      if (typeof status === "string" && status) options.status = status;
      if (typeof contactId === "string" && contactId) options.contactId = Number(contactId);
      res.json(await storage.getTasksFiltered(options));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.tasks.get.path, async (req, res) => {
    const task = await storage.getTaskWithMeta(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      const task = await createTaskService(input, req.session.userId!, storage);
      const meta = await storage.getTaskWithMeta(task.id);
      res.status(201).json(meta ?? task);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.patch(api.tasks.update.path, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);
      const task = await updateTaskService(Number(req.params.id), input, req.session.userId!, storage);
      const meta = await storage.getTaskWithMeta(task.id);
      res.json(meta ?? task);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    await storage.deleteTask(Number(req.params.id));
    res.status(204).send();
  });

  // ─── Calls ────────────────────────────────────────────────────────────────
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

  // ─── Type Labels ──────────────────────────────────────────────────────────
  app.get(api.typeLabels.list.path, async (req, res) => {
    const category = req.query.category as string | undefined;
    const labels = await storage.getTypeLabels(category);
    res.json(labels);
  });

  app.post(api.typeLabels.create.path, requireAuth, requireAdmin, async (req, res) => {
    const parsed = api.typeLabels.create.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const label = await storage.createTypeLabel(parsed.data);
    res.status(201).json(label);
  });

  app.patch(api.typeLabels.update.path, requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const label = await storage.updateTypeLabel(id, req.body);
    res.json(label);
  });

  app.delete(api.typeLabels.delete.path, requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await storage.deleteTypeLabel(id);
    res.status(204).end();
  });

  // ─── Attachment Download ───────────────────────────────────────────────────
  app.get("/api/attachments/:id/download", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid attachment id" });
      const result = await storage.getAttachmentWithMailbox(id);
      if (!result) return res.status(404).json({ message: "Attachment not found" });
      const { attachment, microsoftMessageId, mailboxEmail } = result;
      if (!attachment.microsoftAttachmentId) return res.status(404).json({ message: "No Microsoft attachment ID stored" });
      const { buffer, contentType } = await fetchAttachmentContent(mailboxEmail, microsoftMessageId, attachment.microsoftAttachmentId);
      const safeFilename = encodeURIComponent(attachment.filename ?? "file");
      res.set("Content-Type", contentType || attachment.contentType || "application/octet-stream");
      res.set("Content-Disposition", `inline; filename="${safeFilename}"`);
      res.set("Cache-Control", "private, max-age=3600");
      res.send(buffer);
    } catch (err: any) {
      console.error("[attachment download]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Global Search ─────────────────────────────────────────────────────────
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const q = ((req.query.q as string) ?? "").trim();
      if (q.length < 2) return res.json({ contacts: [], threads: [], issues: [], tasks: [], associations: [], units: [] });
      const limit = Math.min(parseInt((req.query.limit as string) ?? "5") || 5, 20);
      const results = await storage.globalSearch(q, limit);
      res.json(results);
    } catch (err: any) {
      console.error("[search]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Graph Status ─────────────────────────────────────────────────────────
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
    const method = hasConnector
      ? "Replit Outlook connector"
      : hasAppOnly
      ? "app-only credentials"
      : null;
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
