import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  UserCheck, UserX, User, MessageSquare, Activity,
  Send, ChevronRight, CheckSquare, Plus, Circle,
  CheckCircle2, XCircle, Clock, AlertTriangle, Calendar,
  Users, Search, Link2, Unlink, X, AlertCircle, Building2, MapPin,
} from "lucide-react";
import type { User as UserType, TypeLabel, Association, Unit, Contact } from "@shared/schema";
import type { NoteWithUser, ActivityWithUser, TaskWithMeta, ContactWithDetails, ThreadContactWithContact, IssueWithDetails } from "@shared/routes";
import { TASK_STATUSES, TASK_PRIORITIES, ISSUE_PRIORITIES } from "@shared/routes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: string | Date): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_OPTIONS = ["Open", "Waiting", "Closed", "Archived"] as const;

function activityDescription(entry: ActivityWithUser): string {
  const actor = entry.actorName ?? "Someone";
  const meta = (entry.metadata ?? {}) as Record<string, string>;
  switch (entry.action) {
    case "claimed": return `${actor} claimed this thread`;
    case "assigned": return `${actor} assigned to ${meta.assigneeName ?? "a user"}`;
    case "unassigned": return `${actor} removed the assignee`;
    case "status_changed": return `${actor} changed status: ${meta.from} → ${meta.to}`;
    case "note_added": return `${actor} added a note`;
    case "task_created": return `${actor} created task: ${meta.taskTitle ?? ""}`;
    default: return `${actor} performed ${entry.action}`;
  }
}

function taskStatusIcon(s: string) {
  if (s === "Completed") return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
  if (s === "Cancelled") return <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />;
  if (s === "In Progress") return <Clock className="h-3 w-3 text-blue-500 shrink-0" />;
  return <Circle className="h-3 w-3 text-muted-foreground shrink-0" />;
}

function priorityVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  if (p === "Urgent") return "destructive";
  if (p === "High") return "default";
  return "outline";
}

function isDueDateOverdue(d: string | Date | null): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

// ─── Link Contact Dialog ───────────────────────────────────────────────────────

interface LinkContactDialogProps {
  open: boolean;
  onClose: () => void;
  threadId: number;
}

function LinkContactDialog({ open, onClose, threadId }: LinkContactDialogProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");

  const { data: results, isLoading } = useQuery<ContactWithDetails[]>({
    queryKey: ["/api/contacts", { q: query }],
    queryFn: async () => {
      const url = query.trim()
        ? `/api/contacts?q=${encodeURIComponent(query.trim())}`
        : "/api/contacts";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: (contactId: number) =>
      apiRequest("POST", `/api/threads/${threadId}/link-contact`, { contactId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({ title: "Contact linked" });
      onClose();
      setQuery("");
    },
    onError: (e: Error) => toast({ title: "Failed to link contact", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Link Contact</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email, phone…"
              className="pl-8"
              data-testid="input-link-contact-search"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5" data-testid="link-contact-results">
            {isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !results || results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {query ? "No contacts found." : "No contacts yet."}
              </p>
            ) : (
              results.map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/70 text-left transition-colors"
                  onClick={() => linkMutation.mutate(c.id)}
                  disabled={linkMutation.isPending}
                  data-testid={`link-contact-option-${c.id}`}
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">{c.displayName?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.contactType} · {c.primaryEmail ?? c.emails[0]?.email ?? c.primaryPhone ?? ""}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Task Dialog (inline, for thread context) ──────────────────────────

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  threadId: number;
  defaultTitle: string;
  users: UserType[] | undefined;
  defaultContactId?: number | null;
  defaultAssociationId?: number | null;
  defaultUnitId?: number | null;
}

function CreateTaskDialog({ open, onClose, threadId, defaultTitle, users, defaultContactId, defaultAssociationId, defaultUnitId }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [priority, setPriority] = useState("Normal");
  const [taskType, setTaskType] = useState("General");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState<string>(defaultContactId ? String(defaultContactId) : "");
  const [associationId, setAssociationId] = useState<string>(defaultAssociationId ? String(defaultAssociationId) : "");
  const [unitId, setUnitId] = useState<string>(defaultUnitId ? String(defaultUnitId) : "");

  const { data: taskTypes = [] } = useQuery<TypeLabel[]>({
    queryKey: ["/api/type-labels", { category: "task_type" }],
    queryFn: () => fetch("/api/type-labels?category=task_type").then(r => r.json()),
    enabled: open,
  });

  const { data: associations = [] } = useQuery<Association[]>({
    queryKey: ["/api/associations"],
    enabled: open,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units", { associationId: associationId ? Number(associationId) : undefined }],
    queryFn: () => {
      const url = associationId ? `/api/units?associationId=${associationId}` : "/api/units";
      return fetch(url).then(r => r.json());
    },
    enabled: open,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
      toast({ title: "Task created" });
      onClose();
      setTitle(defaultTitle); setPriority("Normal"); setTaskType("General"); setAssignedUserId(""); setDueDate(""); setDescription("");
      setContactId(defaultContactId ? String(defaultContactId) : "");
      setAssociationId(defaultAssociationId ? String(defaultAssociationId) : "");
      setUnitId(defaultUnitId ? String(defaultUnitId) : "");
    },
    onError: (e: Error) => toast({ title: "Failed to create task", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!title.trim()) return;
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      taskType,
      assignedUserId: (assignedUserId && assignedUserId !== "__unassigned__") ? Number(assignedUserId) : null,
      dueDate: dueDate || null,
      threadId,
      contactId: contactId ? Number(contactId) : null,
      associationId: associationId ? Number(associationId) : null,
      unitId: unitId ? Number(unitId) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Task from Thread</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              data-testid="input-thread-task-title"
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid="input-thread-task-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Association</label>
              <Select value={associationId} onValueChange={setAssociationId}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-association">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {associations.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-unit">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={String(u.id)}>Unit {u.unitNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact</label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-contact">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {contacts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taskTypes.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to</label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {users?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Due date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="h-8 text-xs"
                data-testid="input-thread-task-due-date"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || createMutation.isPending}
            data-testid="button-thread-task-submit"
          >
            {createMutation.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Association Context Row ──────────────────────────────────────────────────

function AssociationContextRow({ associationId, unitId }: { associationId: number; unitId: number | null }) {
  const { data: assoc } = useQuery<{ name: string }>({
    queryKey: ["/api/associations", associationId],
    queryFn: () => fetch(`/api/associations/${associationId}`).then(r => r.json()),
  });
  const { data: unit } = useQuery<{ unitNumber: string; building: string | null }>({
    queryKey: ["/api/units", unitId],
    queryFn: () => fetch(`/api/units/${unitId}`).then(r => r.json()),
    enabled: !!unitId,
  });

  const { data: unitContacts = [] } = useQuery<ContactWithDetails[]>({
    queryKey: ["/api/units", unitId, "contacts"],
    queryFn: () => fetch(`/api/units/${unitId}/contacts`).then(r => r.json()),
    enabled: !!unitId,
  });

  const owners = unitContacts.filter(c => c.contactUnits?.some(cu => cu.isPrimary && cu.role === "Owner"));

  return (
    <div className="space-y-0.5" data-testid={`assoc-context-${associationId}`}>
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground font-medium">{assoc?.name ?? "Loading…"}</span>
      </div>
      {unit && (
        <div className="flex items-center gap-1.5 pl-1">
          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Unit {unit.unitNumber}{unit.building ? ` · ${unit.building}` : ""}</span>
        </div>
      )}
      {owners.length > 0 && (
        <div className="flex items-center gap-1.5 pl-1">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            Owner: {owners.map(c => c.displayName).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Thread Sidebar ───────────────────────────────────────────────────────────

interface Props {
  threadId: number;
  threadSubject: string;
  assignedUserId: number | null;
  status: string;
  currentUser: UserType;
  onStatusChange?: (newStatus: string) => void;
}

export function ThreadSidebar({ threadId, threadSubject, assignedUserId, status, currentUser, onStatusChange }: Props) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState("");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [showLinkIssue, setShowLinkIssue] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issuePriority, setIssuePriority] = useState("Normal");
  const [issueType, setIssueType] = useState("General");
  const [issueSearch, setIssueSearch] = useState("");

  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });

  const { data: notes, isLoading: loadingNotes } = useQuery<NoteWithUser[]>({
    queryKey: ["/api/threads", threadId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/threads/${threadId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: activity, isLoading: loadingActivity } = useQuery<ActivityWithUser[]>({
    queryKey: ["/api/threads", threadId, "activity"],
    queryFn: async () => {
      const res = await fetch(`/api/threads/${threadId}/activity`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: threadTasks, isLoading: loadingTasks } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/threads", threadId, "tasks"],
    queryFn: async () => {
      const res = await fetch(`/api/threads/${threadId}/tasks`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  function invalidateThread() {
    queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
  }

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/threads/${threadId}/claim`),
    onSuccess: () => { invalidateThread(); toast({ title: "Thread claimed" }); },
    onError: (e: Error) => toast({ title: "Failed to claim", description: e.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", `/api/threads/${threadId}/assign`, { userId }),
    onSuccess: () => { invalidateThread(); toast({ title: "Thread assigned" }); },
    onError: (e: Error) => toast({ title: "Failed to assign", description: e.message, variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/threads/${threadId}/unassign`),
    onSuccess: () => { invalidateThread(); toast({ title: "Assignee removed" }); },
    onError: (e: Error) => toast({ title: "Failed to unassign", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: (s: string) => apiRequest("PATCH", `/api/threads/${threadId}/status`, { status: s }),
    onSuccess: (_data, newStatus) => {
      invalidateThread();
      toast({ title: `Status changed to ${newStatus}` });
      onStatusChange?.(newStatus);
    },
    onError: (e: Error) => toast({ title: "Failed to update status", description: e.message, variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/threads/${threadId}/notes`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
      setNoteBody("");
      toast({ title: "Note added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiRequest("PATCH", `/api/tasks/${taskId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
    },
    onError: (e: Error) => toast({ title: "Failed to update task", description: e.message, variant: "destructive" }),
  });

  const { data: threadContacts, isLoading: loadingContacts } = useQuery<ThreadContactWithContact[]>({
    queryKey: ["/api/threads", threadId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/threads/${threadId}/contacts`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const unlinkContactMutation = useMutation({
    mutationFn: (contactId: number) =>
      apiRequest("POST", `/api/threads/${threadId}/unlink-contact`, { contactId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({ title: "Contact unlinked" });
    },
    onError: (e: Error) => toast({ title: "Failed to unlink contact", description: e.message, variant: "destructive" }),
  });

  const primaryContact = threadContacts?.find(tc => tc.relationshipType === "primary")?.contact || threadContacts?.[0]?.contact;

  const { data: threadIssues, isLoading: loadingIssues } = useQuery<IssueWithDetails[]>({
    queryKey: ["/api/threads", threadId, "issues"],
    queryFn: async () => {
      const res = await fetch(`/api/threads/${threadId}/issues`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: allIssues } = useQuery<IssueWithDetails[]>({
    queryKey: ["/api/issues"],
    enabled: showLinkIssue,
  });

  const { data: issueTypes = [] } = useQuery<TypeLabel[]>({
    queryKey: ["/api/type-labels", { category: "issue_type" }],
    queryFn: () => fetch("/api/type-labels?category=issue_type").then(r => r.json()),
  });

  const createIssueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/issues", {
        title: issueTitle || threadSubject,
        description: issueDesc || null,
        priority: issuePriority,
        issueType,
        contactId: primaryContact?.id || null,
        associationId: primaryContact?.associationId || null,
        unitId: primaryContact?.unitId || null,
      });
      const issue: IssueWithDetails = await res.json();
      await apiRequest("POST", `/api/issues/${issue.id}/link-thread`, { threadId });
      return issue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({ title: "Issue created and linked" });
      setShowCreateIssue(false);
      setIssueTitle("");
      setIssueDesc("");
      setIssuePriority("Normal");
      setIssueType("General");
    },
    onError: (e: Error) => toast({ title: "Failed to create issue", description: e.message, variant: "destructive" }),
  });

  const linkExistingIssueMutation = useMutation({
    mutationFn: (issueId: number) =>
      apiRequest("POST", `/api/issues/${issueId}/link-thread`, { threadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({ title: "Issue linked" });
      setShowLinkIssue(false);
      setIssueSearch("");
    },
    onError: (e: Error) => toast({ title: "Failed to link issue", description: e.message, variant: "destructive" }),
  });

  const assignedUser = users?.find(u => u.id === assignedUserId);

  const isMutating =
    claimMutation.isPending ||
    assignMutation.isPending ||
    unassignMutation.isPending ||
    statusMutation.isPending;

  return (
    <ScrollArea className="h-full border-l border-border bg-card">
      <div className="p-4 space-y-5">

        {/* ─── Contact ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Contact
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setLinkContactOpen(true)}
              data-testid="button-link-contact"
            >
              <Link2 className="h-3 w-3 mr-0.5" />
              Link
            </Button>
          </div>

          {loadingContacts ? (
            <Skeleton className="h-10 w-full rounded" />
          ) : !threadContacts || threadContacts.length === 0 ? (
            <div className="py-1">
              <p className="text-xs text-muted-foreground" data-testid="contact-unlinked">No contact linked.</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => setLinkContactOpen(true)}
                data-testid="button-link-first-contact"
              >
                <Link2 className="h-3 w-3 mr-1" />
                Link Contact
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="thread-contacts-list">
              {threadContacts.map(tc => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 bg-muted/20"
                  data-testid={`thread-contact-${tc.contactId}`}
                >
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {tc.contact.displayName?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate" data-testid={`contact-name-${tc.contactId}`}>
                      {tc.contact.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">{tc.contact.contactType}</p>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Unlink contact"
                    onClick={() => unlinkContactMutation.mutate(tc.contactId)}
                    disabled={unlinkContactMutation.isPending}
                    data-testid={`button-unlink-contact-${tc.contactId}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Issues ────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Issue
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setIssueTitle(threadSubject); setShowCreateIssue(true); }}
                data-testid="button-create-issue-from-thread"
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowLinkIssue(true)}
                data-testid="button-link-thread-issue"
              >
                <Link2 className="h-3 w-3 mr-0.5" />
                Link
              </Button>
            </div>
          </div>

          {loadingIssues ? (
            <Skeleton className="h-10 w-full rounded" />
          ) : !threadIssues || threadIssues.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="issue-unlinked">No issue linked.</p>
          ) : (
            <div className="space-y-1.5" data-testid="thread-issues-list">
              {threadIssues.map(issue => (
                <div
                  key={issue.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 bg-muted/20"
                  data-testid={`thread-issue-${issue.id}`}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{issue.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground">{issue.status}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{issue.priority}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create Issue Dialog */}
          <Dialog open={showCreateIssue} onOpenChange={v => !v && setShowCreateIssue(false)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Issue</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    data-testid="input-sidebar-issue-title"
                    value={issueTitle}
                    onChange={e => setIssueTitle(e.target.value)}
                    placeholder="Issue title"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    data-testid="textarea-sidebar-issue-desc"
                    value={issueDesc}
                    onChange={e => setIssueDesc(e.target.value)}
                    placeholder="Optional description…"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Priority</label>
                    <Select value={issuePriority} onValueChange={setIssuePriority}>
                      <SelectTrigger data-testid="select-sidebar-issue-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ISSUE_PRIORITIES.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Type</label>
                    <Select value={issueType} onValueChange={setIssueType}>
                      <SelectTrigger data-testid="select-sidebar-issue-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {issueTypes.filter(t => t.isActive).map(t => (
                          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setShowCreateIssue(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={!issueTitle.trim() || createIssueMutation.isPending}
                  onClick={() => createIssueMutation.mutate()}
                  data-testid="button-sidebar-create-issue-submit"
                >
                  {createIssueMutation.isPending ? "Creating…" : "Create Issue"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Link to Existing Issue Dialog */}
          <Dialog open={showLinkIssue} onOpenChange={v => !v && setShowLinkIssue(false)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Link to Issue</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Input
                  data-testid="input-sidebar-issue-search"
                  placeholder="Search issues…"
                  value={issueSearch}
                  onChange={e => setIssueSearch(e.target.value)}
                />
                <ScrollArea className="h-56">
                  {!allIssues?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No issues found</p>
                  ) : (
                    allIssues
                      .filter(i => i.title.toLowerCase().includes(issueSearch.toLowerCase()))
                      .filter(i => !(threadIssues ?? []).find(ti => ti.id === i.id))
                      .map(issue => (
                        <button
                          key={issue.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted rounded-md transition-colors"
                          data-testid={`option-issue-${issue.id}`}
                          onClick={() => linkExistingIssueMutation.mutate(issue.id)}
                          disabled={linkExistingIssueMutation.isPending}
                        >
                          <p className="text-sm font-medium truncate">{issue.title}</p>
                          <p className="text-xs text-muted-foreground">{issue.status} · {issue.priority}</p>
                        </button>
                      ))
                  )}
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </section>

        {/* ─── Association Context ────────────────────────────────────── */}
        {(() => {
          const seenIds = new Set<number>();
          const contexts: Array<{ associationId: number; unitId: number | null }> = [];
          for (const tc of (threadContacts ?? [])) {
            if (tc.contact.associationId && !seenIds.has(tc.contact.associationId)) {
              seenIds.add(tc.contact.associationId);
              contexts.push({ associationId: tc.contact.associationId, unitId: tc.contact.unitId ?? null });
            }
          }
          for (const issue of (threadIssues ?? [])) {
            if (issue.associationId && !seenIds.has(issue.associationId)) {
              seenIds.add(issue.associationId);
              contexts.push({ associationId: issue.associationId, unitId: issue.unitId ?? null });
            }
          }
          if (contexts.length === 0) return null;
          return (
            <>
              <Separator />
              <section data-testid="thread-association-context">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Property Context
                </p>
                <div className="space-y-2">
                  {contexts.map(ctx => (
                    <AssociationContextRow key={ctx.associationId} associationId={ctx.associationId} unitId={ctx.unitId} />
                  ))}
                </div>
              </section>
            </>
          );
        })()}

        <Separator />

        {/* ─── Ownership ─────────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Owner
          </p>

          {assignedUserId === null ? (
            <div className="space-y-2" data-testid="ownership-unassigned">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Unassigned</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => claimMutation.mutate()}
                disabled={isMutating}
                data-testid="button-claim"
              >
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Claim for myself
              </Button>
              {users && users.length > 0 && (
                <Select onValueChange={(v) => assignMutation.mutate(Number(v))} disabled={isMutating}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-assign">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-2" data-testid="ownership-assigned">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {(assignedUser?.name ?? assignedUser?.email ?? "?")?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" data-testid="text-assignee-name">
                      {assignedUser?.name ?? assignedUser?.email ?? "Unknown"}
                    </p>
                    {assignedUserId === currentUser.id && (
                      <p className="text-xs text-primary">You</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => unassignMutation.mutate()}
                  disabled={isMutating}
                  data-testid="button-unassign"
                  title="Remove assignee"
                >
                  <UserX className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Select onValueChange={(v) => assignMutation.mutate(Number(v))} disabled={isMutating}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-reassign">
                  <SelectValue placeholder="Reassign to..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.filter(u => u.id !== assignedUserId).map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Status ────────────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Status
          </p>
          <div className="flex flex-wrap gap-1.5" data-testid="status-selector">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => status !== s && statusMutation.mutate(s)}
                disabled={statusMutation.isPending}
                data-testid={`status-option-${s.toLowerCase()}`}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  status === s
                    ? "bg-primary text-primary-foreground border-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <Separator />

        {/* ─── Tasks ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" />
              Tasks
              {threadTasks && threadTasks.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-xs">{threadTasks.length}</Badge>
              )}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setCreateTaskOpen(true)}
              data-testid="button-create-task-from-thread"
            >
              <Plus className="h-3 w-3 mr-0.5" />
              Create
            </Button>
          </div>

          {loadingTasks ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded" />
            </div>
          ) : !threadTasks || threadTasks.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground" data-testid="tasks-empty">No tasks yet.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs w-full"
                onClick={() => setCreateTaskOpen(true)}
                data-testid="button-create-first-task"
              >
                <Plus className="h-3 w-3 mr-1" />
                Create Task
              </Button>
            </div>
          ) : (
            <div className="space-y-1" data-testid="thread-tasks-list">
              {threadTasks.map(task => {
                const overdue = isDueDateOverdue(task.dueDate) && task.status !== "Completed" && task.status !== "Cancelled";
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group"
                    data-testid={`thread-task-${task.id}`}
                  >
                    {taskStatusIcon(task.status)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-tight ${task.status === "Completed" || task.status === "Cancelled" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {task.priority !== "Normal" && (
                          <Badge variant={priorityVariant(task.priority)} className="text-xs h-4 px-1">
                            {task.priority}
                          </Badge>
                        )}
                        {task.assigneeName && (
                          <span className="text-xs text-muted-foreground">{task.assigneeName}</span>
                        )}
                        {task.dueDate && (
                          <span className={`text-xs flex items-center gap-0.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                            {overdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
                            {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.status !== "Completed" && task.status !== "Cancelled" && (
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Mark complete"
                        onClick={() => updateTaskStatusMutation.mutate({ taskId: task.id, status: "Completed" })}
                        data-testid={`button-complete-task-${task.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground hover:text-green-500 transition-colors" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Notes ─────────────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Internal Notes
          </p>

          <div className="space-y-2 mb-3">
            <Textarea
              placeholder="Add a private note..."
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid="input-note-body"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => noteBody.trim() && noteMutation.mutate(noteBody.trim())}
              disabled={!noteBody.trim() || noteMutation.isPending}
              data-testid="button-add-note"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {noteMutation.isPending ? "Adding…" : "Add Note"}
            </Button>
          </div>

          {loadingNotes ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded" />
              <Skeleton className="h-12 w-full rounded" />
            </div>
          ) : !notes || notes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3" data-testid="notes-empty">
              No notes yet.
            </p>
          ) : (
            <div className="space-y-2" data-testid="notes-list">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2"
                  data-testid={`note-${note.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {note.authorName ?? note.authorEmail ?? "Staff"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(note.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {note.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Activity ──────────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Activity
          </p>

          {loadingActivity ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-full rounded" />
            </div>
          ) : !activity || activity.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3" data-testid="activity-empty">
              No activity yet.
            </p>
          ) : (
            <div className="space-y-1" data-testid="activity-list">
              {activity.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2"
                  data-testid={`activity-${entry.id}`}
                >
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-snug">
                      {activityDescription(entry)}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <CreateTaskDialog
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        threadId={threadId}
        defaultTitle={threadSubject}
        users={users}
        defaultContactId={threadContacts?.[0]?.contactId}
        defaultAssociationId={threadContacts?.[0]?.contact?.associationId}
        defaultUnitId={threadContacts?.[0]?.contact?.unitId}
      />

      <LinkContactDialog
        open={linkContactOpen}
        onClose={() => setLinkContactOpen(false)}
        threadId={threadId}
      />
    </ScrollArea>
  );
}
