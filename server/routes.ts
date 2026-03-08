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

        for (let idx = 0; idx < issueTypes.length; idx++) {
          await storage.createTypeLabel({ category: "issue_type", name: issueTypes[idx], sortOrder: idx });
        }
        for (let idx = 0; idx < taskTypes.length; idx++) {
          await storage.createTypeLabel({ category: "task_type", name: taskTypes[idx], sortOrder: idx });
        }
      }

      // Normalize existing release_version values to SemVer (e.g. "1.1" → "1.1.0")
      const { whatsNew } = await import("@shared/schema");
      const { db } = await import("./db");
      const { sql: rawSql } = await import("drizzle-orm");
      await db.execute(rawSql`
        UPDATE whats_new
        SET release_version = release_version || '.0'
        WHERE release_version IS NOT NULL
          AND release_version ~ '^[0-9]+\.[0-9]+$'
      `);

      // Seed What's New entries — keyed by (title, release_version) so they are idempotent
      const existingEntries = await db.select({ v: whatsNew.releaseVersion, t: whatsNew.title }).from(whatsNew);
      const seededKeys = new Set(existingEntries.map(r => `${r.v}::${r.t}`));

      const entries = [
        {
          releaseVersion: "1.1.0",
          title: "Dark Mode",
          type: "feature",
          description: "Nexus now fully supports dark mode. Your preference is saved and remembered across sessions.",
          howToUse: 'Click your avatar in the top-right corner and select "Dark mode" or "Light mode" to toggle.',
          isActive: true,
        },
        {
          releaseVersion: "1.2.0",
          title: "CSV Import — Fully Fixed",
          type: "fix",
          description: "The CSV parser now correctly handles quoted fields containing commas (e.g. address fields). Column mapping no longer shifts on rows with complex addresses.",
          howToUse: "Go to Admin → Imports, upload your CSV, and column mapping will auto-detect the correct fields. Check the sample values column to confirm before importing.",
          isActive: true,
        },
        {
          releaseVersion: "1.2.0",
          title: "Import Preview — Sample Values Column",
          type: "improvement",
          description: "The column mapping step in the import wizard now shows a sample value from your data for each row, so you can instantly spot wrong mappings before committing.",
          howToUse: 'During import, on the "Map Columns" step, the third column shows an example value pulled directly from your file.',
          isActive: true,
        },
        {
          releaseVersion: "1.3.0",
          title: "Company Name Field on Contacts",
          type: "feature",
          description: "Contacts now support a separate company name field. When importing from CSV, Nexus automatically detects whether the display name is a company or person name and stores it correctly.",
          howToUse: 'Open any contact, click the name to edit, and you will see a Company Name field. Toggle "Show company name as primary" to control which name appears in the list.',
          isActive: true,
        },
        {
          releaseVersion: "1.3.0",
          title: "Email Workflow & UX Improvements",
          type: "feature",
          description: "Contact autocomplete in To/Cc/Bcc fields, per-mailbox email signatures, a from-mailbox selector when replying, quoted original message in replies, Open Mail as the default inbox filter, a visible search bar in the header, and Admin nav hidden for non-admin users.",
          howToUse: "Signatures: open your avatar menu → Signature Settings. Autocomplete: start typing in any To/Cc/Bcc field. Reply from: choose a different From mailbox in the reply bar. Inbox now opens to Open Mail by default.",
          isActive: true,
        },
        {
          releaseVersion: "1.4.0",
          title: "Forward Email, Signatures Applied, Read Tracking & RBAC",
          type: "feature",
          description: "Forward is now a first-class email action with editable recipients, subject, and quoted original. Signatures are automatically applied in compose and reply. Opening a thread marks all messages as read. Admin nav is hidden for staff users and enforced server-side.",
          howToUse: "Forward: click the Forward button in any thread. Signatures: configure in avatar menu → Signature Settings — they appear automatically when composing or replying. Read tracking is automatic when you open a thread.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.0",
          title: "Unit & Contact Context on Issues and Tasks",
          type: "feature",
          description: "Issues and tasks can now be linked to an association, unit, and contact. When creating an issue or task from within an email thread, Nexus automatically pre-fills the contact, association, and unit based on the thread's linked contact — no manual selection needed.",
          howToUse: "Open any email thread, click the Issues or Tasks tab in the right panel, and create a new item. The contact and association/unit fields will be pre-filled. You can adjust them before saving.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.0",
          title: "Keyboard Shortcuts in Inbox",
          type: "feature",
          description: "Power users can now navigate and act on email threads without reaching for the mouse. While viewing a thread, press R to reply, A to reply-all, F to forward, I to create an issue, T to create a task, or N to jump to the next thread. Cmd/Ctrl+Enter sends the current composition.",
          howToUse: "Open a thread in the inbox. Shortcuts are active whenever your cursor is not inside a text field. A shortcut legend is shown in the thread header for quick reference.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.0",
          title: "Issues & Tasks on Association/Unit Pages",
          type: "improvement",
          description: "The Associations page now shows linked issues and tasks directly on each association and unit. Expand any association to see its open issues and tasks. Expand a unit to see issues and tasks scoped to that specific unit.",
          howToUse: "Go to Associations, select an association, and scroll down to the Issues and Tasks sections. Click into any unit to see its own issues and tasks.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.0",
          title: "Richer Contact Search Results",
          type: "improvement",
          description: "Contact autocomplete dropdowns across the app now show the contact's association, email address, and phone number alongside their name, making it much easier to identify the right contact when multiple people share similar names.",
          howToUse: "Start typing in any contact or To/Cc/Bcc field. The dropdown will show a richer card for each result.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.0",
          title: "Filter Inbox by Association",
          type: "improvement",
          description: "The inbox filter panel now includes an Association filter. Select an association to view only threads linked to contacts or issues belonging to that association.",
          howToUse: "In the inbox, open the filter panel and choose an association from the new Association dropdown.",
          isActive: true,
        },
        {
          releaseVersion: "1.5.5",
          title: "Multiple Property Ownership",
          type: "improvement",
          description: "Contacts can now be linked to multiple properties and units, each with their own role (Owner, Tenant, Board Member, etc.). The contact detail page now shows a Properties section where you can add, remove, and edit roles across all linked units.",
          howToUse: "Open any contact and scroll to the Properties section. Click 'Add Property' to link a new association, unit, and role. Click the role badge to edit it inline, or click Remove to unlink a property.",
          isActive: true,
        },
      ];

      for (const entry of entries) {
        const key = `${entry.releaseVersion}::${entry.title}`;
        if (!seededKeys.has(key)) {
          await db.insert(whatsNew).values(entry);
        }
      }

      // ─── Migrate existing contact.associationId/unitId → contact_units ─────
      const { contacts: contactsTable, contactUnits: contactUnitsTable } = await import("@shared/schema");
      const legacyContacts = await db
        .select({ id: contactsTable.id, associationId: contactsTable.associationId, unitId: contactsTable.unitId })
        .from(contactsTable)
        .where(rawSql`(association_id IS NOT NULL OR unit_id IS NOT NULL)`);

      if (legacyContacts.length > 0) {
        const existingLinks = await db
          .select({ contactId: contactUnitsTable.contactId, unitId: contactUnitsTable.unitId })
          .from(contactUnitsTable);
        const existingSet = new Set(existingLinks.map(l => `${l.contactId}::${l.unitId}`));
        let migrated = 0;
        for (const c of legacyContacts) {
          if (!c.unitId) continue;
          const key = `${c.id}::${c.unitId}`;
          if (!existingSet.has(key)) {
            await db.insert(contactUnitsTable).values({
              contactId: c.id,
              unitId: c.unitId,
              associationId: c.associationId ?? null,
              role: "Owner",
              isPrimary: true,
            });
            migrated++;
          }
        }
        if (migrated > 0) console.log(`[migration] Migrated ${migrated} contact→unit links to contact_units`);
      }

      // Ensure indexes exist
      await db.execute(rawSql`CREATE INDEX IF NOT EXISTS cu_contact_idx ON contact_units (contact_id)`);
      await db.execute(rawSql`CREATE INDEX IF NOT EXISTS cu_unit_idx ON contact_units (unit_id)`);
      await db.execute(rawSql`CREATE INDEX IF NOT EXISTS cu_assoc_idx ON contact_units (association_id)`);
    } catch (err) {
      console.error("Seed error:", err);
    }
  }
  seedDatabase();

  // ─── App version ─────────────────────────────────────────────────────────
  app.get("/api/version", (_req, res) => {
    import("@shared/version").then(({ APP_VERSION }) => {
      res.json({ version: APP_VERSION });
    });
  });

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
    if (q.hasTask === "true") filters.hasTask = true;
    if (q.hasIssue === "true") filters.hasIssue = true;
    if (q.associationId) filters.associationId = Number(q.associationId);
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
      const { body, replyAll, to, mailboxId: replyMailboxId, replyToMessage } = req.body as {
        body: string;
        replyAll?: boolean;
        to?: string[];
        mailboxId?: number;
        replyToMessage?: { senderName?: string; senderEmail?: string; receivedAt?: string; bodyHtml?: string };
      };
      if (!body?.trim()) return res.status(400).json({ message: "Reply body is required" });

      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ message: "Thread not found" });

      const mailboxIdToUse = replyMailboxId ?? thread.mailboxId;
      const mailbox = await storage.getMailbox(mailboxIdToUse);
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

      // Build quoted block from the message being replied to
      let quotedHtml = "";
      if (replyToMessage) {
        const dateStr = replyToMessage.receivedAt
          ? new Date(replyToMessage.receivedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
          : "";
        quotedHtml = `<br/><hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>` +
          `<div style="color:#666;font-size:13px;margin-bottom:8px">On ${dateStr}, <strong>${replyToMessage.senderName ?? replyToMessage.senderEmail}</strong> wrote:</div>` +
          `<blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#444">${replyToMessage.bodyHtml ?? ""}</blockquote>`;
      }

      const fullBody = body + quotedHtml;

      await sendMail(mailbox.microsoftMailboxId, {
        subject,
        body: { contentType: "HTML", content: fullBody },
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
        senderEmail: mailbox.microsoftMailboxId!,
        senderName: user?.name ?? "Me",
        recipients: recipients.map(r => r.emailAddress.address),
        subject,
        bodyPreview: body.replace(/<[^>]+>/g, "").slice(0, 200),
        bodyText: null,
        bodyHtml: fullBody,
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

  // ─── Mark thread messages as read ────────────────────────────────────────
  app.post("/api/threads/:id/mark-read", requireAuth, async (req, res) => {
    try {
      const threadId = Number(req.params.id);
      await storage.markThreadMessagesRead(threadId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Forward email ────────────────────────────────────────────────────────
  app.post("/api/threads/:id/forward", requireAuth, async (req, res) => {
    try {
      const threadId = Number(req.params.id);
      const { body, to, cc, bcc, subject: fwdSubject, mailboxId: fwdMailboxId, forwardMessage } = req.body as {
        body: string;
        to: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        mailboxId?: number;
        forwardMessage?: { senderName?: string; senderEmail?: string; receivedAt?: string; bodyHtml?: string };
      };

      if (!to || to.length === 0) return res.status(400).json({ message: "At least one recipient required" });

      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ message: "Thread not found" });

      const mailboxIdToUse = fwdMailboxId ?? thread.mailboxId;
      const mailbox = await storage.getMailbox(mailboxIdToUse);
      if (!mailbox?.microsoftMailboxId) return res.status(400).json({ message: "Mailbox not configured" });

      const subject = fwdSubject ?? (thread.subject.startsWith("Fwd:") ? thread.subject : `Fwd: ${thread.subject}`);

      let quotedHtml = "";
      if (forwardMessage) {
        const dateStr = forwardMessage.receivedAt
          ? new Date(forwardMessage.receivedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
          : "";
        quotedHtml = `<br/><hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>` +
          `<div style="color:#666;font-size:13px;margin-bottom:4px"><strong>---------- Forwarded message ----------</strong></div>` +
          `<div style="color:#666;font-size:13px">From: <strong>${forwardMessage.senderName ?? forwardMessage.senderEmail}</strong> &lt;${forwardMessage.senderEmail}&gt;</div>` +
          `<div style="color:#666;font-size:13px;margin-bottom:8px">Date: ${dateStr}</div>` +
          `<div>${forwardMessage.bodyHtml ?? ""}</div>`;
      }

      const fullBody = body + quotedHtml;
      const toRecipients = to.map(addr => ({ emailAddress: { address: addr } }));
      const ccRecipients = (cc ?? []).map(addr => ({ emailAddress: { address: addr } }));
      const bccRecipients = (bcc ?? []).map(addr => ({ emailAddress: { address: addr } }));

      await sendMail(mailbox.microsoftMailboxId, {
        subject,
        body: { contentType: "HTML", content: fullBody },
        toRecipients,
        ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
        bccRecipients: bccRecipients.length > 0 ? bccRecipients : undefined,
      });

      const now = new Date();
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const savedMsg = await storage.createMessage({
        threadId,
        microsoftMessageId: null,
        senderEmail: mailbox.microsoftMailboxId!,
        senderName: user?.name ?? "Me",
        recipients: to,
        subject,
        bodyPreview: body.replace(/<[^>]+>/g, "").slice(0, 200),
        bodyText: null,
        bodyHtml: fullBody,
        receivedAt: now,
        hasAttachments: false,
        isRead: true,
        direction: "outbound",
        updatedAt: now,
      });

      await storage.updateThread(threadId, { lastMessageAt: now, updatedAt: now });
      res.status(201).json(savedMsg);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Forward failed" });
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

  // ─── Contact Units (many-to-many) ─────────────────────────────────────────
  app.get("/api/contacts/:id/units", async (req, res) => {
    try {
      res.json(await storage.getContactUnits(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/contacts/:id/units", requireAuth, async (req, res) => {
    try {
      const { unitId, associationId, role, isPrimary } = req.body;
      if (!unitId) return res.status(400).json({ message: "unitId is required" });
      const record = await storage.addContactUnit({
        contactId: Number(req.params.id),
        unitId: Number(unitId),
        associationId: associationId ? Number(associationId) : null,
        role: role ?? "Owner",
        isPrimary: isPrimary ?? false,
      });
      res.status(201).json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/contact-units/:id", requireAuth, async (req, res) => {
    try {
      const { role, isPrimary } = req.body;
      const record = await storage.updateContactUnit(Number(req.params.id), { role, isPrimary });
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/contact-units/:id", requireAuth, async (req, res) => {
    try {
      await storage.removeContactUnit(Number(req.params.id));
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  app.get("/api/units/:id/contacts", async (req, res) => {
    try {
      res.json(await storage.getUnitContacts(Number(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Issues ───────────────────────────────────────────────────────────────
  app.get(api.issues.list.path, async (req, res) => {
    try {
      const { status, priority, openOnly, closedOnly, contactId, associationId, unitId } = req.query;
      const results = await listIssues({
        status: typeof status === 'string' ? status : undefined,
        priority: typeof priority === 'string' ? priority : undefined,
        openOnly: openOnly === 'true',
        closedOnly: closedOnly === 'true',
        contactId: typeof contactId === 'string' ? Number(contactId) : undefined,
        associationId: typeof associationId === 'string' ? Number(associationId) : undefined,
        unitId: typeof unitId === 'string' ? Number(unitId) : undefined,
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
      const { assignedToMe, overdue, status, contactId, associationId, unitId } = req.query;
      const options: { assignedUserId?: number; overdue?: boolean; status?: string; contactId?: number; associationId?: number; unitId?: number } = {};
      if (assignedToMe === "true") options.assignedUserId = req.session.userId!;
      if (overdue === "true") options.overdue = true;
      if (typeof status === "string" && status) options.status = status;
      if (typeof contactId === "string" && contactId) options.contactId = Number(contactId);
      if (typeof associationId === "string" && associationId) options.associationId = Number(associationId);
      if (typeof unitId === "string" && unitId) options.unitId = Number(unitId);
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

  // ── COMPOSE NEW EMAIL ─────────────────────────────────────────────────────────
  app.post("/api/email/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const { mailboxId, to, cc, bcc, subject, body: emailBody } = req.body;
      if (!mailboxId || !to || !subject) return res.status(400).json({ message: "mailboxId, to, and subject are required" });

      const mailbox = await storage.getMailbox(Number(mailboxId));
      if (!mailbox?.microsoftMailboxId) return res.status(400).json({ message: "Mailbox not configured" });

      const toArr: string[] = Array.isArray(to) ? to : [to];
      const ccArr: string[] = Array.isArray(cc) ? (cc ?? []) : (cc ? [cc] : []);
      const bccArr: string[] = Array.isArray(bcc) ? (bcc ?? []) : (bcc ? [bcc] : []);

      await sendMail(mailbox.microsoftMailboxId, {
        subject,
        body: { contentType: "HTML", content: emailBody ?? "" },
        toRecipients: toArr.map(addr => ({ emailAddress: { address: addr } })),
        ccRecipients: ccArr.length > 0 ? ccArr.map(addr => ({ emailAddress: { address: addr } })) : undefined,
        bccRecipients: bccArr.length > 0 ? bccArr.map(addr => ({ emailAddress: { address: addr } })) : undefined,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to send email" });
    }
  });

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db: dbConn } = await import("./db");
    const { notifications } = await import("@shared/schema");
    const { eq, desc } = await import("drizzle-orm");
    const rows = await dbConn.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
    res.json(rows);
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db: dbConn } = await import("./db");
    const { notifications } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const rows = await dbConn.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ count: rows.length });
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const id = Number(req.params.id as string);
    const { db: dbConn } = await import("./db");
    const { notifications } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    await dbConn.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    res.json({ ok: true });
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db: dbConn } = await import("./db");
    const { notifications } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    await dbConn.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ ok: true });
  });

  // ── SOLUTION LIBRARY ───────────────────────────────────────────────────────────
  app.get("/api/solutions", requireAuth, async (req: Request, res: Response) => {
    const { db: dbConn } = await import("./db");
    const { solutionLibrary } = await import("@shared/schema");
    const { desc, ilike } = await import("drizzle-orm");
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const rows = q
      ? await dbConn.select().from(solutionLibrary).where(ilike(solutionLibrary.title, `%${q}%`)).orderBy(desc(solutionLibrary.updatedAt))
      : await dbConn.select().from(solutionLibrary).orderBy(desc(solutionLibrary.updatedAt));
    res.json(rows);
  });

  app.post("/api/solutions", requireAuth, async (req: Request, res: Response) => {
    const { db: dbConn } = await import("./db");
    const { solutionLibrary, insertSolutionSchema } = await import("@shared/schema");
    const parsed = insertSolutionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    const [entry] = await dbConn.insert(solutionLibrary).values({ ...parsed.data, updatedAt: new Date() }).returning();
    res.status(201).json(entry);
  });

  app.patch("/api/solutions/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id as string);
    const { db: dbConn } = await import("./db");
    const { solutionLibrary, insertSolutionSchema } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const parsed = insertSolutionSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
    const [entry] = await dbConn.update(solutionLibrary).set({ ...parsed.data, updatedAt: new Date() }).where(eq(solutionLibrary.id, id)).returning();
    if (!entry) return res.status(404).json({ message: "Not found" });
    res.json(entry);
  });

  app.delete("/api/solutions/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id as string);
    const { db: dbConn } = await import("./db");
    const { solutionLibrary } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await dbConn.delete(solutionLibrary).where(eq(solutionLibrary.id, id));
    res.json({ ok: true });
  });

  // ── WHAT'S NEW ────────────────────────────────────────────────────────────────
  app.get("/api/whats-new", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db } = await import("./db");
    const { whatsNew, whatsNewReads } = await import("@shared/schema");
    const { eq, and, desc } = await import("drizzle-orm");

    const entries = await db
      .select()
      .from(whatsNew)
      .where(eq(whatsNew.isActive, true))
      .orderBy(desc(whatsNew.createdAt));

    const reads = await db
      .select({ whatsNewId: whatsNewReads.whatsNewId })
      .from(whatsNewReads)
      .where(eq(whatsNewReads.userId, userId));

    const readSet = new Set(reads.map(r => r.whatsNewId));
    const result = entries.map(e => ({ ...e, isRead: readSet.has(e.id) }));
    res.json(result);
  });

  app.get("/api/whats-new/unread-count", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db } = await import("./db");
    const { whatsNew, whatsNewReads } = await import("@shared/schema");
    const { eq, desc } = await import("drizzle-orm");

    const entries = await db
      .select({ id: whatsNew.id })
      .from(whatsNew)
      .where(eq(whatsNew.isActive, true));

    const reads = await db
      .select({ whatsNewId: whatsNewReads.whatsNewId })
      .from(whatsNewReads)
      .where(eq(whatsNewReads.userId, userId));

    const readSet = new Set(reads.map(r => r.whatsNewId));
    const count = entries.filter(e => !readSet.has(e.id)).length;
    res.json({ count });
  });

  app.post("/api/whats-new/:id/read", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const id = Number(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const { db } = await import("./db");
    const { whatsNewReads } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    const existing = await db
      .select()
      .from(whatsNewReads)
      .where(and(eq(whatsNewReads.userId, userId), eq(whatsNewReads.whatsNewId, id)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(whatsNewReads).values({ userId, whatsNewId: id });
    }
    res.json({ ok: true });
  });

  app.post("/api/whats-new/mark-all-read", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.session as any).userId as number;
    const { db } = await import("./db");
    const { whatsNew, whatsNewReads } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const entries = await db
      .select({ id: whatsNew.id })
      .from(whatsNew)
      .where(eq(whatsNew.isActive, true));

    const reads = await db
      .select({ whatsNewId: whatsNewReads.whatsNewId })
      .from(whatsNewReads)
      .where(eq(whatsNewReads.userId, userId));

    const readSet = new Set(reads.map(r => r.whatsNewId));
    const unread = entries.filter(e => !readSet.has(e.id));

    if (unread.length > 0) {
      await db.insert(whatsNewReads).values(unread.map(e => ({ userId, whatsNewId: e.id })));
    }
    res.json({ ok: true, marked: unread.length });
  });

  // ── SIGNATURES ────────────────────────────────────────────────────────────────
  app.get("/api/signatures", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const sigs = await storage.getSignaturesByUser(userId);
    res.json(sigs);
  });

  app.post("/api/signatures", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { mailboxId, body: sigBody } = req.body;
      if (!sigBody?.trim()) return res.status(400).json({ message: "Signature body is required" });
      const sig = await storage.createSignature({ userId, mailboxId: mailboxId ?? null, body: sigBody });
      res.status(201).json(sig);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to create signature" });
    }
  });

  app.put("/api/signatures/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { body: sigBody } = req.body;
      if (!sigBody?.trim()) return res.status(400).json({ message: "Signature body is required" });
      const sig = await storage.updateSignature(Number(req.params.id), userId, sigBody);
      if (!sig) return res.status(404).json({ message: "Signature not found" });
      res.json(sig);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to update signature" });
    }
  });

  app.delete("/api/signatures/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteSignature(Number(req.params.id), req.session.userId!);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to delete signature" });
    }
  });

  app.post("/api/whats-new", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser((req.session as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

    const { db } = await import("./db");
    const { whatsNew, insertWhatsNewSchema } = await import("@shared/schema");

    const parsed = insertWhatsNewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

    const [entry] = await db.insert(whatsNew).values(parsed.data).returning();
    res.status(201).json(entry);
  });

  // Health check endpoint for AWS load balancers
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  return httpServer;
}

