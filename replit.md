# Property Management Operations Platform

## Overview
An internal operations platform for property management combining shared inbox, task management, CRM contacts, issue tracking, property/unit context, and RingEX call pop.

## Architecture
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui (Vite)
- **Backend**: Node.js + Express (tsx server)
- **Database**: PostgreSQL (Drizzle ORM)
- **Auth**: Microsoft Entra ID OAuth2 with PKCE (session-based)

## Project Structure
```
shared/
  schema.ts       # Drizzle table definitions + Zod types (single source of truth)
  routes.ts       # API contract with typed endpoints
server/
  index.ts        # Express entry point
  db.ts           # Drizzle + pg Pool
  storage.ts      # DatabaseStorage class (all DB operations)
  routes.ts       # Route handlers — includes OAuth, RBAC middleware
  services/
    graphService.ts         # Microsoft Graph (mailbox sync via Replit Outlook connector)
    microsoftAuthService.ts # PKCE helpers, token exchange, Graph user profile
client/src/
  App.tsx         # Router, ProtectedRoute, LoginPage wrapper
  components/
    layout.tsx    # 3-panel workspace layout (sidebar | main | context panel)
  pages/
    login.tsx     # Microsoft OAuth login page (no scaffold form)
    admin.tsx     # Mailbox management
    placeholders.tsx   # Inbox, Tasks, Issues, Contacts, Properties, Calls
    call-pop.tsx  # RingEX call pop screen (/call-pop?phone=+1...)
  hooks/
    use-auth.ts        # useUser (GET /api/auth/me), useLogout
    use-mailboxes.ts   # Mailbox CRUD hooks
```

## Database Schema (all tables in Postgres)
- **users** — id, name, email, role (admin|manager|staff), created_at
- **mailboxes** — id, name, type (shared|personal), microsoft_mailbox_id, is_default, created_at
- **email_threads** — id, mailbox_id, subject, microsoft_thread_id, assigned_user_id, contact_id, property_id, status, last_message_at, updated_at, created_at
- **messages** — id, thread_id, microsoft_message_id, sender_email, sender_name, recipients[], subject, body, body_html, body_preview, received_at, has_attachments, is_read, updated_at
- **attachments** — id, message_id, microsoft_attachment_id, name, content_type, size_bytes
- **contacts** — id, display_name, contact_type, primary_email, primary_phone, created_at
- **contact_phones** — id, contact_id, phone_number (E164), label
- **properties** — id, name, address, association_name, created_at
- **units** — id, property_id, unit_number, owner_contact_id, tenant_contact_id
- **issues** — id, title, description, contact_id, property_id, unit_id, assigned_user_id, status, priority, closed_at, created_at
- **tasks** — id, issue_id, thread_id, assigned_user_id, title, description, status, priority, due_date, created_at
- **notes** — id, issue_id, thread_id, user_id, body, created_at
- **calls** — id, phone_number, contact_id, user_id, started_at, ended_at, direction, notes, issue_id
- **activity_log** — id, entity_type, entity_id, action, user_id, metadata, created_at

## UI Layout
3-panel workspace: **Sidebar** | **Main Workspace** | **Context Panel** (right, 288px, appears at lg breakpoint)

Sidebar navigation: Inbox, Tasks, Issues, Contacts, Properties, Calls, Admin

## Authentication
Microsoft Entra ID OAuth2 with PKCE.
- `GET /api/auth/microsoft` — starts OAuth flow (redirects to Microsoft login)
- `GET /api/auth/microsoft/callback` — handles redirect, creates/validates user, sets session
- `GET /api/auth/me` — returns current user or 401
- `POST /api/auth/logout` — destroys session
- `GET /api/auth/status` — returns `{ oauthConfigured: boolean }`

### Bootstrap rules
- If users table is empty, first sign-in auto-creates admin account
- If `ALLOWED_EMAIL_DOMAIN` env var is set, matching-domain users are auto-created as staff
- Otherwise, user must already exist in the users table

### RBAC
Roles: admin > manager > staff. `requireRole` middleware enforces per-route.

## Key API Endpoints
- `GET /api/auth/me` — current user
- `POST /api/auth/logout` — logout
- `GET /api/auth/status` — OAuth config status
- `GET/POST /api/mailboxes` — mailbox management (admin only)
- `POST /api/mailboxes/:id/sync` — trigger Graph mailbox sync
- `GET /api/graph/status` — Graph connector status
- `GET/POST /api/contacts` — contacts CRUD
- `GET/POST /api/properties` — properties CRUD
- `GET /api/properties/:id/units` — units per property
- `GET/POST /api/issues` — issues CRUD
- `GET/POST /api/tasks` — tasks CRUD
- `GET/POST /api/calls` — call log
- `GET /api/calls/pop?phone=+1...` — RingEX call pop lookup
- `GET /api/threads` — email threads (filtered by mailbox)
- `GET /api/threads/:id/messages` — messages in a thread
- `POST /api/threads/:id/claim` — claim unassigned thread for current user
- `POST /api/threads/:id/assign` — assign thread to a user (body: { userId })
- `POST /api/threads/:id/unassign` — remove assignee from thread
- `PATCH /api/threads/:id/status` — update thread status (Open|Waiting|Closed|Archived)
- `GET /api/threads/:id/notes` — get internal notes for a thread (with author info)
- `POST /api/threads/:id/notes` — add an internal note to a thread
- `GET /api/threads/:id/activity` — get activity log for a thread (with actor info)

## Microsoft Graph Configuration
Required environment secrets for OAuth and mailbox sync:
- `MICROSOFT_TENANT_ID` — Azure AD tenant ID
- `MICROSOFT_CLIENT_ID` — App registration client ID
- `MICROSOFT_CLIENT_SECRET` — App registration client secret

The Azure AD app needs:
- **Mail.Read** application permission (admin consent) for mailbox sync
- **User.Read** delegated permission for sign-in
- Redirect URI registered: `https://<your-replit-domain>/api/auth/microsoft/callback`

Sync endpoint: `POST /api/mailboxes/:id/sync`
Graph status: `GET /api/graph/status`

## Services
- `server/services/graphService.ts` — Microsoft Graph mailbox sync
- `server/services/microsoftAuthService.ts` — PKCE OAuth helpers
- `server/services/syncService.ts` — Thread/message sync orchestration
- `server/services/threadWorkflowService.ts` — Thread workflow: claim, assign, unassign, status change, notes, activity

## Build Chunks Completed
- **Chunk 1**: Foundation — app shell, schema, users, mailboxes, full DB schema
- **Chunk 2**: Inbox Read — Microsoft Graph sync service, full inbox UI (thread list + message view), attachments
- **Chunk 2b**: Microsoft OAuth — PKCE auth flow, RBAC middleware, login page, session management
- **Chunk 3**: Shared Inbox Action Workflow — claim/assign/unassign threads, status changes (Open/Waiting/Closed/Archived), internal notes, activity log, thread sidebar UI
