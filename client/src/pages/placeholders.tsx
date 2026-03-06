import { Inbox, CheckSquare, AlertCircle, Users, Building2, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── INBOX ───────────────────────────────────────────────────────────────────
export function InboxPage() {
  return (
    <div className="flex h-full">
      {/* Thread list panel */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-sm">Inbox</h2>
          <Badge variant="secondary" className="text-xs" data-testid="badge-thread-count">0 threads</Badge>
        </div>
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <div>
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No threads yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Connect a mailbox in Admin to get started.</p>
          </div>
        </div>
      </div>

      {/* Thread view panel */}
      <div className="flex-1 flex items-center justify-center text-center p-12">
        <div>
          <p className="text-sm text-muted-foreground">Select a thread to read it.</p>
        </div>
      </div>
    </div>
  );
}

// ─── TASKS ───────────────────────────────────────────────────────────────────
export function TasksPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">Tasks</h2>
        <Badge variant="secondary" className="text-xs" data-testid="badge-task-count">0 open</Badge>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <CheckSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Tasks will appear here once created from threads or issues.</p>
        </div>
      </div>
    </div>
  );
}

// ─── ISSUES ──────────────────────────────────────────────────────────────────
export function IssuesPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">Issues</h2>
        <Badge variant="secondary" className="text-xs" data-testid="badge-issue-count">0 open</Badge>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No issues open.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Issues group communication and tasks around a case or problem.</p>
        </div>
      </div>
    </div>
  );
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────
export function ContactsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">Contacts</h2>
        <Badge variant="secondary" className="text-xs" data-testid="badge-contact-count">0 contacts</Badge>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Owners, tenants, vendors, and other contacts live here.</p>
        </div>
      </div>
    </div>
  );
}

// ─── PROPERTIES ──────────────────────────────────────────────────────────────
export function PropertiesPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">Properties</h2>
        <Badge variant="secondary" className="text-xs" data-testid="badge-property-count">0 properties</Badge>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No properties yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add properties and units to link contacts and issues to addresses.</p>
        </div>
      </div>
    </div>
  );
}

// ─── CALLS ───────────────────────────────────────────────────────────────────
export function CallsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">Call Log</h2>
        <Badge variant="secondary" className="text-xs" data-testid="badge-call-count">0 calls</Badge>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <Phone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No calls logged.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Inbound calls from RingEX will appear here. Use <code className="text-xs bg-muted px-1 rounded">/call-pop?phone=+1...</code> to trigger a call pop.
          </p>
        </div>
      </div>
    </div>
  );
}
