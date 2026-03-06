# Property Management Operations Platform

## Overview
An internal operations platform for property management combining shared inbox, task management, CRM contacts, issue tracking, property/unit context, and RingEX call pop.

## Architecture
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui (Vite)
- **Backend**: Node.js + Express (tsx server)
- **Database**: PostgreSQL (Drizzle ORM)
- **Session**: express-session with cookie-based auth scaffold

## Project Structure
```
shared/
  schema.ts       # Drizzle table definitions + Zod types (single source of truth)
  routes.ts       # API contract with typed endpoints
server/
  index.ts        # Express entry point
  db.ts           # Drizzle + pg Pool
  storage.ts      # DatabaseStorage class (all DB operations)
  routes.ts       # Route handlers (thin — delegate to storage)
client/src/
  App.tsx         # Router, protected routes
  components/
    layout.tsx    # 3-panel workspace layout (sidebar | main | context panel)
  pages/
    login.tsx     # Auth scaffold login page
    admin.tsx     # Mailbox management
    placeholders.tsx   # Inbox, Tasks, Issues, Contacts, Properties, Calls
    call-pop.tsx  # RingEX call pop screen (/call-pop?phone=+1...)
  hooks/
    use-auth.ts   # useUser, useLogin, useLogout
    use-mailboxes.ts   # Mailbox CRUD hooks
```

## Database Schema (all tables in Postgres)
- **users** — id, name, email, role (admin|manager|staff), created_at
- **mailboxes** — id, name, type (shared|personal), microsoft_mailbox_id, is_default, created_at
- **email_threads** — id, mailbox_id, subject, microsoft_thread_id, assigned_user_id, contact_id, property_id, status, last_message_at, created_at
- **messages** — id, thread_id, microsoft_message_id, sender_email, recipients[], subject, body, received_at, has_attachments
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
Session-based scaffold. POST /api/auth/login-scaffold with email+name creates/finds user and sets session cookie. Full Microsoft OAuth is planned for a future chunk.

## Key API Endpoints
- `GET /api/auth/me` — current user
- `POST /api/auth/login-scaffold` — login
- `POST /api/auth/logout` — logout
- `GET/POST /api/mailboxes` — mailbox management
- `GET/POST /api/contacts` — contacts CRUD
- `GET/POST /api/properties` — properties CRUD
- `GET /api/properties/:id/units` — units per property
- `GET/POST /api/issues` — issues CRUD
- `GET/POST /api/tasks` — tasks CRUD
- `GET/POST /api/calls` — call log
- `GET /api/calls/pop?phone=+1...` — RingEX call pop lookup

## Build Chunks Completed
- **Chunk 1**: Foundation — auth scaffold, app shell, users, mailboxes, full schema for all future chunks
- **Chunk 2**: Inbox Read — Microsoft Graph sync service, full inbox UI (thread list + message view), attachments metadata, mailbox sync endpoint

## Microsoft Graph Configuration
For mailbox sync to work, set these environment secrets:
- `MICROSOFT_TENANT_ID` — Azure AD tenant ID
- `MICROSOFT_CLIENT_ID` — App registration client ID
- `MICROSOFT_CLIENT_SECRET` — App registration client secret

The Azure AD app needs **Mail.Read** application permission (admin consent required).
Shared mailboxes are read via `/users/{sharedMailboxEmail}/messages`.

Sync endpoint: `POST /api/mailboxes/:id/sync`
Graph status: `GET /api/graph/status`
