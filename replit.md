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
    graphService.ts           # Microsoft Graph (mailbox sync via Replit Outlook connector)
    microsoftAuthService.ts   # PKCE helpers, token exchange, Graph user profile
    syncService.ts            # Thread/message sync orchestration
    threadWorkflowService.ts  # Thread workflow: claim, assign, unassign, status change, notes, activity
    taskService.ts            # Task creation, update, assignment, status changes with activity logging
    contactIdentityService.ts # Email normalization, phone normalization, findContactByEmail/Phone
    contactSearchService.ts   # searchContacts(query); getContactWithDetails(id)
    contactTimelineService.ts # getContactTimeline(contactId) aggregating threads, notes, tasks
    contactService.ts         # createContact, updateContact, addContactPhone/Email, linkThreadContact
    issueService.ts           # createIssue (sets createdByUserId, logs activity), updateIssue, getIssueWithDetails
    issueLinkService.ts       # linkIssueThread, unlinkIssueThread, linkIssueTask, unlinkIssueTask; getIssueThreads, getIssueTasks
    issueTimelineService.ts   # getIssueTimeline(issueId) aggregating threads, tasks, notes, activity log
    issueQueryService.ts      # listIssues(filters: status?, priority?, openOnly?) → IssueWithDetails[]
client/src/
  App.tsx         # Router, ProtectedRoute, LoginPage wrapper
  components/
    layout.tsx    # 3-panel workspace layout (sidebar | main | context panel)
    thread-sidebar.tsx  # Thread context panel: contact, ownership, status, tasks, notes, activity, issues
  pages/
    login.tsx     # Microsoft OAuth login page
    admin.tsx     # Mailbox management
    inbox.tsx     # Three-pane inbox: thread list | message view | thread sidebar
    tasks.tsx     # Task dashboard with My/Team/Overdue tabs + Create/Edit Task dialogs
    contacts.tsx  # Two-panel contacts: searchable list | detail with timeline
    issues.tsx    # Two-panel issues: list with filters | detail with tabs (Overview/Threads/Tasks/Notes/Timeline)
    placeholders.tsx   # Properties, Calls placeholders
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
- **contacts** — id, display_name, contact_type, primary_email, primary_phone, notes, updated_at, created_at; types = Owner|Tenant|Vendor|Board|Realtor|Attorney|Other
- **contact_phones** — id, contact_id, phone_number (normalized E.164), label, is_primary, created_at
- **contact_emails** — id, contact_id, email (normalized lowercase), is_primary, created_at
- **thread_contacts** — id, thread_id, contact_id, relationship_type (nullable), created_at
- **properties** — id, name, address, association_name, created_at
- **units** — id, property_id, unit_number, owner_contact_id, tenant_contact_id
- **issues** — id, title, description, contact_id, property_id, unit_id, assigned_user_id, created_by_user_id, status (Open|In Progress|Waiting|Resolved|Closed), priority (Low|Normal|High|Urgent), closed_at, updated_at, created_at
- **issue_threads** — id, issue_id, thread_id, created_at (links issues ↔ email_threads)
- **tasks** — id, issue_id, thread_id, assigned_user_id, created_by_user_id, title, description, status (Open|In Progress|Completed|Cancelled), priority (Low|Normal|High|Urgent), due_date, updated_at, created_at
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
- `GET /api/contacts/:id` — contact with details (phones, emails, threadCount)
- `GET /api/contacts/:id/timeline` — contact timeline
- `GET/POST /api/properties` — properties CRUD
- `GET /api/properties/:id/units` — units per property
- `GET /api/issues` — list issues (query: ?status=, ?priority=, ?openOnly=true) → IssueWithDetails[]
- `POST /api/issues` — create issue (sets createdByUserId from session)
- `GET /api/issues/:id` — get issue with details (IssueWithDetails)
- `PATCH /api/issues/:id` — update issue (status, priority, title, description, assignee, contact)
- `POST /api/issues/:id/link-thread` — link thread to issue (body: { threadId })
- `POST /api/issues/:id/unlink-thread` — unlink thread from issue (body: { threadId })
- `POST /api/issues/:id/link-task` — link task to issue (body: { taskId })
- `POST /api/issues/:id/unlink-task` — unlink task from issue (body: { taskId })
- `GET /api/issues/:id/timeline` — issue timeline
- `GET /api/issues/:id/threads` — threads linked to this issue
- `GET /api/issues/:id/tasks` — tasks linked to this issue
- `GET /api/issues/:id/notes` — notes for this issue
- `GET /api/tasks` — list tasks (query: ?assignedToMe=true, ?overdue=true, ?status=Open)
- `POST /api/tasks` — create task
- `GET /api/tasks/:id` — task with enriched meta (assignee name, thread subject, issue title)
- `PATCH /api/tasks/:id` — update task
- `DELETE /api/tasks/:id` — delete task
- `GET /api/threads/:id/tasks` — tasks linked to a thread
- `GET /api/threads/:id/issues` — issues linked to a thread (via issue_threads)
- `GET /api/threads/:id/notes` — notes for a thread
- `POST /api/threads/:id/notes` — add note to thread
- `GET /api/threads/:id/activity` — activity log for a thread
- `GET/POST /api/calls` — call log
- `GET /api/calls/pop?phone=+1...` — RingEX call pop lookup
- `GET /api/threads` — email threads (filtered by mailbox)
- `GET /api/threads/:id/messages` — messages in a thread
- `POST /api/threads/:id/claim` — claim unassigned thread
- `POST /api/threads/:id/assign` — assign thread (body: { userId })
- `POST /api/threads/:id/unassign` — remove assignee
- `PATCH /api/threads/:id/status` — update thread status

## Microsoft Graph Configuration
Required environment secrets for OAuth and mailbox sync:
- `MICROSOFT_TENANT_ID` — Azure AD tenant ID
- `MICROSOFT_CLIENT_ID` — App registration client ID
- `MICROSOFT_CLIENT_SECRET` — App registration client secret

The Azure AD app needs:
- **Mail.Read** application permission (admin consent) for mailbox sync
- **User.Read** delegated permission for sign-in
- Redirect URI registered: `https://<your-replit-domain>/api/auth/microsoft/callback`

## Shared Types (shared/routes.ts)
- `NoteWithUser` — note with author name/email
- `ActivityWithUser` — activity log entry with actor name
- `TaskWithMeta` — task enriched with assigneeName, assigneeEmail, createdByName, threadSubject, issueTitle
- `TASK_STATUSES` — Open | In Progress | Completed | Cancelled
- `TASK_PRIORITIES` — Low | Normal | High | Urgent
- `CONTACT_TYPES` — Owner | Tenant | Vendor | Board | Realtor | Attorney | Other
- `ContactWithDetails` — contact enriched with phones[], emails[], threadCount
- `ContactTimelineItem` — timeline item with type (thread|note|task), timestamp, summary, detail, entityId
- `ThreadContactWithContact` — thread_contacts row enriched with the full contact object
- `ISSUE_STATUSES` — Open | In Progress | Waiting | Resolved | Closed
- `ISSUE_PRIORITIES` — Low | Normal | High | Urgent
- `IssueWithDetails` — issue enriched with contactName, assigneeName, threadCount, taskCount, noteCount
- `IssueTimelineItem` — timeline item with id, type (thread|task|note|activity), timestamp, summary, detail, entityId
- `IssueThreadWithThread` — issue_threads row enriched with the full thread object

## Frontend Pages
- `/login` — Microsoft OAuth sign-in
- `/inbox` — Three-pane inbox: thread list | message view | thread sidebar (contact link, ownership, status, tasks, notes, activity, issues)
- `/tasks` — Task dashboard with My Tasks / Team Tasks / Overdue tabs; Create Task dialog; Edit Task dialog; issue badge on task rows
- `/contacts` — Two-panel contacts: left=searchable list; right=detail (emails, phones, timeline) + inline create/edit
- `/issues` — Two-panel issues: left=filterable list (status/priority filters); right=detail tabs (Overview, Threads, Tasks, Notes, Timeline); Create Issue dialog
- `/admin` — Mailbox management
- `/call-pop` — RingEX call pop screen

## Build Chunks Completed
- **Chunk 1**: Foundation — app shell, schema, users, mailboxes, full DB schema
- **Chunk 2**: Inbox Read — Microsoft Graph sync service, full inbox UI (thread list + message view), attachments
- **Chunk 2b**: Microsoft OAuth — PKCE auth flow, RBAC middleware, login page, session management
- **Chunk 3**: Shared Inbox Action Workflow — claim/assign/unassign threads, status changes (Open/Waiting/Closed/Archived), internal notes, activity log, thread sidebar UI
- **Chunk 4**: Task System — app-native tasks in Postgres, task dashboard (My/Team/Overdue tabs), create/edit/delete tasks, task-thread linking, thread sidebar task section, activity logging for task events
- **Chunk 5**: Contacts and Identity Layer — contacts/contact_emails/contact_phones/thread_contacts tables, identity normalization services, search by name/email/phone, contact detail page with timeline, thread-sidebar contact section with link/unlink, CONTACT_TYPES enum
- **Chunk 6**: Issues / Cases Layer — issue_threads linking table, createdByUserId + updatedAt on issues, four backend services (issueService, issueLinkService, issueTimelineService, issueQueryService), 12 new API endpoints, full Issues page with two-panel layout (list + detail with 5 tabs), Issue section in thread sidebar (create/link dialogs), issue title badge in task rows
