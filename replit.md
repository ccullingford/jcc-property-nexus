# Property Management Operations Platform

## Overview
An internal operations platform for property management combining shared inbox, task management, CRM contacts, issue tracking, property/unit context, and RingEX call pop.

## Architecture
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui (Vite)
- **Backend**: Node.js + Express (tsx server)
- **Database**: PostgreSQL (Drizzle ORM)
- **Auth**: Microsoft Entra ID OAuth2 with PKCE (session-based)

## Versioning
- Current version: **1.5.0** (SemVer: MAJOR.MINOR.PATCH)
- Single source of truth: `shared/version.ts` — exports `APP_VERSION`
- Displayed in: sidebar footer, What's New page subtitle, Admin → System tab
- `/api/version` endpoint returns `{ version: string }`
- What's New entries must use SemVer `release_version`; DB normalizer in `seedDatabase()` upgrades short versions (e.g. `1.4`) to SemVer automatically on startup
- **Before any future release**: increment `APP_VERSION` in `shared/version.ts` first, then add What's New entries with the new version

## Project Structure
```
shared/
  schema.ts       # Drizzle table definitions + Zod types (single source of truth)
  version.ts      # APP_VERSION constant (single source of truth for app version)
  routes.ts       # API contract with typed endpoints
server/
  index.ts        # Express entry point
  db.ts           # Drizzle + pg Pool
  storage.ts      # DatabaseStorage class (all DB operations)
  routes.ts       # Route handlers — includes OAuth, RBAC middleware
  services/
    graphService.ts           # Microsoft Graph: fetchMailboxMessages (with since: Date filter), fetchSentMessages, sendMail, fetchMessageAttachments; optional token param
    microsoftAuthService.ts   # PKCE helpers, token exchange, refreshAccessToken(), Graph user profile; scope includes Mail.Read
    syncService.ts            # Thread/message sync: respects syncHistoryDays window, fetches sentitems if includeSentMail, marks direction=outbound, auto-links contacts, updates lastSyncedAt
    mailboxSyncScheduler.ts   # Background auto-sync scheduler: ticks every 60s, respects autoSyncEnabled + autoSyncIntervalMinutes per mailbox, prevents concurrent syncs
    threadWorkflowService.ts  # Thread workflow: claim, assign, unassign, status change, notes, activity
    taskService.ts            # Task creation, update, assignment, status changes with activity logging
    contactIdentityService.ts # Email normalization, phone normalization, findContactByEmail/Phone
    contactSearchService.ts   # searchContacts(query, filters: contactType?, hasThreads?, hasOpenIssues?, associationId?); getContactWithDetails(id)
    contactTimelineService.ts # getContactTimeline(contactId) aggregating threads, notes, tasks
    contactService.ts         # createContact, updateContact, addContactPhone/Email, linkThreadContact
    contactImportService.ts   # previewImport(rows, mapping) + executeImport(rows, mapping, mode, userId) — CSV bulk import with field mapping, validation, upsert
    combinedImportService.ts  # previewCombined(rows, mapping) + executeCombined(rows, mapping) — multi-entity import resolving assoc→unit→contact→links in one CSV
    contactMergeService.ts    # findDuplicates() by normalized email + cross-contact_emails check; mergeContacts(sourceId, targetId, userId) — re-links threads/emails/phones/issues/tasks/calls, logs merge
    issueService.ts           # createIssue (sets createdByUserId, logs activity), updateIssue, getIssueWithDetails
    issueLinkService.ts       # linkIssueThread, unlinkIssueThread, linkIssueTask, unlinkIssueTask; getIssueThreads, getIssueTasks
    issueTimelineService.ts   # getIssueTimeline(issueId) aggregating threads, tasks, notes, activity log
    issueQueryService.ts      # listIssues(filters: status?, priority?, openOnly?, contactId?, associationId?) → IssueWithDetails[]
    associationService.ts     # listAssociations, getAssociation, createAssociation, updateAssociation — HOA-level entities
    unitService.ts            # listUnits, getUnit, createUnit, updateUnit — units linked to associations
client/src/
  App.tsx         # Router, ProtectedRoute, LoginPage wrapper
  components/
    layout.tsx    # 3-panel workspace layout (sidebar | main | context panel)
    thread-sidebar.tsx  # Thread context panel: contact, ownership, status, tasks, notes, activity, issues; auto-derives Property Context from linked contacts/issues associationId
  pages/
    login.tsx     # Microsoft OAuth login page
    admin.tsx     # Mailbox management + Issue/Task Types + Imports + Solution Library (new tab)
    inbox.tsx     # Three-pane inbox: thread list (search + filter panel) | message view (reply/compose, unknown contact banner with Create/Link Existing/Ignore) | thread sidebar; auto-refreshes every 60s; Next Thread button; long thread message collapsing (VISIBLE_COUNT=2); has-issue/has-task filters
    tasks.tsx     # Task dashboard with My/Team/Overdue tabs + Create/Edit Task dialogs
    contacts.tsx  # Two-panel contacts: filter bar (type, has threads, has issues, association) + Import (CSV wizard) + Duplicates review | detail with emails/phones/linked issues/tasks/timeline + editable Association/Unit section
    issues.tsx    # Two-panel issues: list with status/priority/association filters | detail with tabs (Overview/Threads/Tasks/Notes/Timeline) + editable Association/Unit section
    associations.tsx  # Two-panel HOA Associations management: list + detail with units, linked contacts, open issues; create/edit dialogs for associations and units
    placeholders.tsx   # Properties, Calls placeholders
    call-pop.tsx  # RingEX call pop screen (/call-pop?phone=+1...)
  hooks/
    use-auth.ts        # useUser (GET /api/auth/me), useLogout
    use-mailboxes.ts   # Mailbox CRUD hooks
```

## Database Schema (all tables in Postgres)
- **users** — id, name, email, role (admin|manager|staff), ms_access_token, ms_refresh_token, ms_token_expires_at, created_at
- **mailboxes** — id, name, type (shared|personal), microsoft_mailbox_id, is_default, sync_mode (application|delegated), owner_user_id (FK→users), sync_history_days (default 30), include_sent_mail (default true), auto_sync_enabled (default true), auto_sync_interval_minutes (default 5), last_synced_at, created_at
- **email_threads** — id, mailbox_id, subject, microsoft_thread_id, assigned_user_id, contact_id, property_id, status, last_message_at, updated_at, created_at
- **messages** — id, thread_id, microsoft_message_id, sender_email, sender_name, recipients[], subject, body, body_html, body_preview, received_at, has_attachments, is_read, direction (inbound|outbound, default inbound), updated_at
- **attachments** — id, message_id, microsoft_attachment_id, name, content_type, size_bytes
- **contacts** — id, display_name, first_name (nullable), last_name (nullable), contact_type, primary_email, primary_phone, notes, association_id (nullable FK), unit_id (nullable FK), mailing_address_1, mailing_address_2, mailing_city, mailing_state, mailing_postal_code, updated_at, created_at; types = Owner|Tenant|Vendor|Board|Realtor|Attorney|Other
- **contact_import_jobs** — id, uploaded_by_user_id, filename, row_count, imported_count, skipped_count, error_count, status (pending|processing|done|failed), created_at, completed_at
- **contact_merge_log** — id, source_contact_id, target_contact_id, merged_by_user_id, merged_at
- **contact_phones** — id, contact_id, phone_number (normalized E.164), label, is_primary, created_at
- **contact_emails** — id, contact_id, email (normalized lowercase), is_primary, created_at
- **thread_contacts** — id, thread_id, contact_id, relationship_type (nullable), created_at
- **properties** — id, name, address, association_name, created_at
- **units** — id, property_id, unit_number, owner_contact_id, tenant_contact_id
- **issues** — id, title, description, contact_id, association_id, property_id, unit_id, assigned_user_id, created_by_user_id, issue_type (nullable FK→type_labels name), status (Open|In Progress|Waiting|Resolved|Closed), priority (Low|Normal|High|Urgent), closed_at, updated_at, created_at
- **issue_threads** — id, issue_id, thread_id, created_at (links issues ↔ email_threads)
- **tasks** — id, issue_id, thread_id, contact_id (nullable FK→contacts), association_id (nullable FK→associations), unit_id (nullable FK→units), assigned_user_id, created_by_user_id, title, description, task_type (nullable), status (Open|In Progress|Completed|Cancelled), priority (Low|Normal|High|Urgent), due_date, updated_at, created_at
- **notes** — id, issue_id, thread_id, user_id, body, created_at
- **calls** — id, phone_number, contact_id, user_id, started_at, ended_at, direction, notes, issue_id
- **activity_log** — id, entity_type, entity_id, action, user_id, metadata, created_at
- **type_labels** — id, category (issue_type|task_type), name, is_active (default true), sort_order (default 0), created_at; seeded with defaults on startup
- **notifications** — id, user_id, title, body, entity_type, entity_id, is_read (default false), created_at
- **solution_library** — id, title, summary, issue_type, symptoms, recommended_steps, internal_notes, response_template, status (draft|approved), owner_user_id, last_reviewed_at, created_at, updated_at

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
- `GET/POST /api/contacts` — contacts list (query: ?q=, ?contactType=, ?hasThreads=true, ?hasOpenIssues=true) / create
- `GET /api/contacts/:id` — contact with details (phones, emails, threadCount)
- `PATCH /api/contacts/:id` — update contact (displayName, contactType, firstName, lastName, notes, primaryEmail, primaryPhone)
- `GET /api/contacts/:id/timeline` — contact timeline
- `POST /api/contacts/import/preview` — preview CSV import rows with field mapping; returns { valid[], invalid[], existingMatches[], duplicatesInFile[] }
- `POST /api/contacts/import/execute` — execute CSV import; returns { imported, updated, skipped, errors[] }
- `GET /api/contacts/duplicates` — find duplicate contacts by normalized email; returns pairs with signal
- `POST /api/contacts/merge` — merge source into target (body: { sourceId, targetId }); re-links all data, deletes source
- `GET/POST /api/properties` — properties CRUD
- `GET /api/properties/:id/units` — units per property
- `GET /api/issues` — list issues (query: ?status=, ?priority=, ?openOnly=true, ?closedOnly=true, ?contactId=N) → IssueWithDetails[]
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
- `GET /api/tasks` — list tasks (query: ?assignedToMe=true, ?overdue=true, ?status=Open, ?contactId=N)
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
- `GET /api/threads` — email threads; query params: mailboxId, search, status, unreadOnly, hasAttachments, assignedUserId
- `GET /api/threads/:id/messages` — messages in a thread
- `POST /api/threads/:id/reply` — send reply (body: { body, replyAll?, to? }); stores outbound message
- `POST /api/threads/:id/claim` — claim unassigned thread
- `POST /api/threads/:id/assign` — assign thread (body: { userId })
- `POST /api/threads/:id/unassign` — remove assignee
- `PATCH /api/threads/:id/status` — update thread status
- `GET /api/contacts/lookup?email=` — find contact by email address, returns 404 if not found
- `GET /api/type-labels?category=issue_type|task_type` — list type labels (filtered by category)
- `POST /api/type-labels` — create type label (admin only)
- `PATCH /api/type-labels/:id` — update type label (admin only)
- `DELETE /api/type-labels/:id` — delete type label (admin only)
- `POST /api/associations/import` — bulk import associations from CSV rows
- `POST /api/units/import` — bulk import units from CSV rows

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
- `/admin` — Tabbed admin panel: Mailboxes (manage + sync), Users (roles), Associations (create/edit + unit management), Imports (contact CSV + association/unit CSV import), Types (issue types + task types — add/edit/toggle/delete)
- `/call-pop` — RingEX call pop screen

## Build Chunks Completed
- **Chunk 11**: Priority features — Dark mode (ThemeProvider + localStorage + CSS variables in `.dark`, toggle in user menu); Attachment streaming + voicemail MP3 (GET /api/attachments/:id/download proxies Graph API binary, inline audio player for audio/* content, image preview for image/*); Global search command palette (Cmd+K, GET /api/search?q= across contacts/threads/issues/tasks/associations/units, grouped results with navigation); Global create menu ("Create" button in header, dialogs for Issue/Task/Contact with full field support, navigate to Associations page for that entity)
- **Chunk 10**: 13-fix improvement session — inline thread view in Issues email tab; inbox Inbox/Sent tabs + newest-first messages + color-coded status dots; contacts first/last name auto-populate + mailing address (schema + UI); type_labels table + seeding + admin Types tab (issue/task types — add/edit/toggle/delete) + type selector in create/edit issue/task forms; admin Imports tab (contact CSV + association/unit CSV import); user menu with Connect My Mailbox in layout header
- **Chunk 1**: Foundation — app shell, schema, users, mailboxes, full DB schema
- **Chunk 2**: Inbox Read — Microsoft Graph sync service, full inbox UI (thread list + message view), attachments
- **Chunk 2b**: Microsoft OAuth — PKCE auth flow, RBAC middleware, login page, session management
- **Chunk 3**: Shared Inbox Action Workflow — claim/assign/unassign threads, status changes (Open/Waiting/Closed/Archived), internal notes, activity log, thread sidebar UI
- **Chunk 4**: Task System — app-native tasks in Postgres, task dashboard (My/Team/Overdue tabs), create/edit/delete tasks, task-thread linking, thread sidebar task section, activity logging for task events
- **Chunk 5**: Contacts and Identity Layer — contacts/contact_emails/contact_phones/thread_contacts tables, identity normalization services, search by name/email/phone, contact detail page with timeline, thread-sidebar contact section with link/unlink, CONTACT_TYPES enum
- **Chunk 6**: Issues / Cases Layer — issue_threads linking table, createdByUserId + updatedAt on issues, four backend services (issueService, issueLinkService, issueTimelineService, issueQueryService), 12 new API endpoints, full Issues page with two-panel layout (list + detail with 5 tabs), Issue section in thread sidebar (create/link dialogs), issue title badge in task rows
- **Chunk 7**: Mailbox Sync & Inbox Usability — mailboxes extended (syncHistoryDays, includeSentMail, autoSyncEnabled, autoSyncIntervalMinutes, lastSyncedAt), messages direction field (inbound/outbound), graphService sentitems + sendMail, syncService sync window + sent mail + auto contact linking, mailboxSyncScheduler background job, GET /api/threads with full filters (search/status/unread/hasAttachments/assignedUserId), POST /api/threads/:id/reply, GET /api/contacts/lookup, inbox search bar + filter panel + auto-refresh, reply/compose UI, unknown contact prompt with quick-create dialog, admin UI sync settings
