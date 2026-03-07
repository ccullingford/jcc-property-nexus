import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle, Plus, Tag, User, Clock, Mail, CheckCircle2,
  FileText, MessageSquare, Activity, X, Link2, ChevronRight,
  PenLine, Calendar, Building2, MapPin,
} from "lucide-react";
import type { IssueWithDetails, IssueTimelineItem, IssueThreadWithThread, TaskWithMeta, NoteWithUser } from "@shared/routes";
import { ISSUE_STATUSES, ISSUE_PRIORITIES } from "@shared/routes";
import type { Association, Unit, TypeLabel } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Open": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "In Progress": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "Waiting": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "Resolved": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Closed": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    default: return "bg-secondary text-secondary-foreground";
  }
}

function priorityVariant(p: string): "default" | "secondary" | "outline" | "destructive" {
  if (p === "Urgent") return "destructive";
  if (p === "High") return "secondary";
  return "outline";
}

// ─── Create Issue Dialog ───────────────────────────────────────────────────────

interface CreateIssueDialogProps {
  open: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultThreadId?: number;
}

function CreateIssueDialog({ open, onClose, defaultTitle, defaultThreadId }: CreateIssueDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [issueType, setIssueType] = useState<string>("General");
  const [associationId, setAssociationId] = useState<string>("none");
  const [unitId, setUnitId] = useState<string>("none");

  const { data: associations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()), enabled: open });
  const { data: assocUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/associations", associationId, "units"],
    queryFn: () => fetch(`/api/associations/${associationId}/units`).then(r => r.json()),
    enabled: open && associationId !== "none",
  });

  const { data: issueTypes = [] } = useQuery<TypeLabel[]>({
    queryKey: ["/api/type-labels", { category: "issue_type" }],
    queryFn: () => fetch("/api/type-labels?category=issue_type").then(r => r.json()),
    enabled: open,
  });

  function handleAssocChange(val: string) { setAssociationId(val); setUnitId("none"); }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/issues", {
        title,
        description: description || null,
        priority,
        issueType,
        associationId: associationId !== "none" ? Number(associationId) : null,
        unitId: unitId !== "none" ? Number(unitId) : null,
      });
      const issue: IssueWithDetails = await res.json();
      if (defaultThreadId) {
        await apiRequest("POST", `/api/issues/${issue.id}/link-thread`, { threadId: defaultThreadId });
      }
      return issue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({ title: "Issue created" });
      onClose();
      setTitle(defaultTitle ?? "");
      setDescription("");
      setPriority("Normal");
      setIssueType("General");
      setAssociationId("none");
      setUnitId("none");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input
              data-testid="input-issue-title"
              placeholder="Issue title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              data-testid="textarea-issue-description"
              placeholder="Describe the issue…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-issue-priority">
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
                <SelectTrigger data-testid="select-issue-type">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Association</label>
              <Select value={associationId} onValueChange={handleAssocChange}>
                <SelectTrigger data-testid="select-issue-association"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {associations.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Unit</label>
              <Select value={unitId} onValueChange={setUnitId} disabled={associationId === "none"}>
                <SelectTrigger data-testid="select-issue-unit"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {assocUnits.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.unitNumber}{u.building ? ` (${u.building})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="button-create-issue-submit"
            disabled={!title.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating…" : "Create Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Thread Dialog ────────────────────────────────────────────────────────

interface LinkThreadDialogProps {
  open: boolean;
  onClose: () => void;
  issueId: number;
  linkedThreadIds: number[];
}

function LinkThreadDialog({ open, onClose, issueId, linkedThreadIds }: LinkThreadDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: threads } = useQuery<any[]>({
    queryKey: ["/api/threads"],
    enabled: open,
  });

  const filtered = threads?.filter(t =>
    !linkedThreadIds.includes(t.id) &&
    (t.subject ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const linkMutation = useMutation({
    mutationFn: (threadId: number) =>
      apiRequest("POST", `/api/issues/${issueId}/link-thread`, { threadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issueId, "threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({ title: "Thread linked" });
      onClose();
      setSearch("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Link Email Thread</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            data-testid="input-thread-search"
            placeholder="Search threads…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ScrollArea className="h-64">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No threads found</p>
            ) : (
              filtered.slice(0, 30).map(t => (
                <button
                  key={t.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted rounded-md transition-colors"
                  data-testid={`option-thread-${t.id}`}
                  onClick={() => linkMutation.mutate(t.id)}
                  disabled={linkMutation.isPending}
                >
                  <p className="text-sm font-medium truncate">{t.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">{t.status} · {relativeTime(t.lastMessageAt)}</p>
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Task Dialog ──────────────────────────────────────────────────────────

interface LinkTaskDialogProps {
  open: boolean;
  onClose: () => void;
  issueId: number;
  linkedTaskIds: number[];
}

function LinkTaskDialog({ open, onClose, issueId, linkedTaskIds }: LinkTaskDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: tasks } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/tasks"],
    enabled: open,
  });

  const filtered = tasks?.filter(t =>
    !linkedTaskIds.includes(t.id) &&
    t.title.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const linkMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiRequest("POST", `/api/issues/${issueId}/link-task`, { taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issueId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({ title: "Task linked" });
      onClose();
      setSearch("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Link Task</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            data-testid="input-task-search"
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ScrollArea className="h-64">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No tasks found</p>
            ) : (
              filtered.slice(0, 30).map(t => (
                <button
                  key={t.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted rounded-md transition-colors"
                  data-testid={`option-task-${t.id}`}
                  onClick={() => linkMutation.mutate(t.id)}
                  disabled={linkMutation.isPending}
                >
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.status} · {t.priority}</p>
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue List Item ───────────────────────────────────────────────────────────

function IssueListItem({
  issue,
  selected,
  onClick,
}: {
  issue: IssueWithDetails;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors hover:bg-muted/50 ${selected ? "bg-muted" : ""}`}
      onClick={onClick}
      data-testid={`issue-row-${issue.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate text-foreground">{issue.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(issue.status)}`}>
              {issue.status}
            </span>
            <Badge variant={priorityVariant(issue.priority)} className="text-xs">
              {issue.priority}
            </Badge>
            {issue.issueType && issue.issueType !== "General" && (
              <Badge variant="outline" className="text-xs">
                {issue.issueType}
              </Badge>
            )}
            {issue.contactName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {issue.contactName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {issue.threadCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {issue.threadCount}
              </span>
            )}
            {issue.taskCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {issue.taskCount}
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{relativeTime(issue.createdAt?.toString())}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ─── Issue Association Section ────────────────────────────────────────────────

function IssueAssociationSection({ issue, onUpdate }: { issue: IssueWithDetails; onUpdate: (aid: number | null, uid: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [selAssocId, setSelAssocId] = useState<string>(issue.associationId?.toString() ?? "none");
  const [selUnitId, setSelUnitId] = useState<string>(issue.unitId?.toString() ?? "none");

  const { data: associations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()), enabled: editing });
  const { data: assocDetail } = useQuery<{ name: string }>({
    queryKey: ["/api/associations", issue.associationId],
    queryFn: () => fetch(`/api/associations/${issue.associationId}`).then(r => r.json()),
    enabled: !!issue.associationId && !editing,
  });
  const { data: assocUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/associations", selAssocId, "units"],
    queryFn: () => fetch(`/api/associations/${selAssocId}/units`).then(r => r.json()),
    enabled: editing && selAssocId !== "none",
  });
  const { data: unitDetail } = useQuery<{ unitNumber: string; building: string | null }>({
    queryKey: ["/api/units", issue.unitId],
    queryFn: () => fetch(`/api/units/${issue.unitId}`).then(r => r.json()),
    enabled: !!issue.unitId && !editing,
  });

  function handleEdit() { setSelAssocId(issue.associationId?.toString() ?? "none"); setSelUnitId(issue.unitId?.toString() ?? "none"); setEditing(true); }
  function handleSave() { onUpdate(selAssocId !== "none" ? Number(selAssocId) : null, selUnitId !== "none" ? Number(selUnitId) : null); setEditing(false); }

  return (
    <div className="space-y-2" data-testid="issue-association-section">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />Association
        </p>
        {!editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleEdit} data-testid="button-edit-issue-association">Edit</Button>}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Select value={selAssocId} onValueChange={v => { setSelAssocId(v); setSelUnitId("none"); }}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-issue-detail-association"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {associations.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selUnitId} onValueChange={setSelUnitId} disabled={selAssocId === "none"}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-issue-detail-unit"><SelectValue placeholder="No unit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No unit</SelectItem>
              {assocUnits.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.unitNumber}{u.building ? ` (${u.building})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} data-testid="button-save-issue-association">Save</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="text-sm space-y-1">
          {issue.associationId && assocDetail ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span data-testid="text-issue-assoc">{assocDetail.name}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="text-no-issue-association">No association linked.</p>
          )}
          {issue.unitId && unitDetail && (
            <div className="flex items-center gap-1.5 pl-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs" data-testid="text-issue-unit">Unit {unitDetail.unitNumber}{unitDetail.building ? ` · ${unitDetail.building}` : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline Thread Viewer ─────────────────────────────────────────────────────

interface InlineMessage {
  id: number;
  senderName: string;
  senderEmail: string;
  bodyPreview: string;
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: string;
  direction: string;
  subject: string;
}

function InlineThreadViewer({ threadId, threadSubject, onBack }: { threadId: number; threadSubject: string; onBack: () => void }) {
  const { data: messages, isLoading } = useQuery<InlineMessage[]>({
    queryKey: ["/api/threads", threadId, "messages"],
    queryFn: () => fetch(`/api/threads/${threadId}/messages`).then(r => r.json()),
  });

  const sorted = messages ? [...messages].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()) : [];

  function formatTime(ts: string) {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onBack} data-testid="button-back-from-thread">
          ← Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{threadSubject}</p>
          <p className="text-xs text-muted-foreground">{messages?.length ?? 0} messages</p>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages found.</p>
          ) : (
            sorted.map(msg => (
              <div key={msg.id} className={`rounded-lg border p-4 min-w-0 overflow-hidden ${msg.direction === "outbound" ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`} data-testid={`inline-message-${msg.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{msg.senderName || msg.senderEmail}</p>
                    <p className="text-xs text-muted-foreground truncate">{msg.senderEmail}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {msg.direction === "outbound" && <Badge variant="secondary" className="text-xs h-5">Sent</Badge>}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(msg.receivedAt)}</span>
                  </div>
                </div>
                {msg.bodyHtml ? (
                  <div className="border-t border-border/50 pt-2 mt-2 overflow-x-auto max-h-64 [&_*]:max-w-full [&_img]:max-w-full [&_table]:w-full [&_table]:table-fixed">
                    <div className="text-sm text-foreground prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: msg.bodyHtml }} />
                  </div>
                ) : (
                  <p className="text-sm text-foreground border-t border-border/50 pt-2 mt-2 whitespace-pre-wrap break-words">{msg.bodyPreview || msg.bodyText || "(no body)"}</p>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Issue Detail Panel ────────────────────────────────────────────────────────

function IssueDetailPanel({ issue, onUpdated }: { issue: IssueWithDetails; onUpdated: () => void }) {
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(issue.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(issue.description ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [showLinkThread, setShowLinkThread] = useState(false);
  const [showLinkTask, setShowLinkTask] = useState(false);
  const [viewingThread, setViewingThread] = useState<{ id: number; subject: string } | null>(null);

  const { data: linkedThreads, isLoading: threadsLoading } = useQuery<IssueThreadWithThread[]>({
    queryKey: ["/api/issues", issue.id, "threads"],
    queryFn: () => fetch(`/api/issues/${issue.id}/threads`).then(r => r.json()),
  });

  const { data: linkedTasks, isLoading: tasksLoading } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/issues", issue.id, "tasks"],
    queryFn: () => fetch(`/api/issues/${issue.id}/tasks`).then(r => r.json()),
  });

  const { data: notes, isLoading: notesLoading } = useQuery<NoteWithUser[]>({
    queryKey: ["/api/issues", issue.id, "notes"],
    queryFn: () => fetch(`/api/issues/${issue.id}/notes`).then(r => r.json()),
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<IssueTimelineItem[]>({
    queryKey: ["/api/issues", issue.id, "timeline"],
    queryFn: () => fetch(`/api/issues/${issue.id}/timeline`).then(r => r.json()),
  });

  const { data: issueTypes = [] } = useQuery<TypeLabel[]>({
    queryKey: ["/api/type-labels", { category: "issue_type" }],
    queryFn: () => fetch("/api/type-labels?category=issue_type").then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/issues/${issue.id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      onUpdated();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkThreadMutation = useMutation({
    mutationFn: (threadId: number) =>
      apiRequest("POST", `/api/issues/${issue.id}/unlink-thread`, { threadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issue.id, "threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
    },
  });

  const unlinkTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiRequest("POST", `/api/issues/${issue.id}/unlink-task`, { taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issue.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/issues/${issue.id}/notes`, { body: noteBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issue.id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues", issue.id, "timeline"] });
      setNoteBody("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const linkedThreadIds = linkedThreads?.map(t => t.threadId) ?? [];
  const linkedTaskIds = linkedTasks?.map(t => t.id) ?? [];

  if (viewingThread) {
    return (
      <InlineThreadViewer
        threadId={viewingThread.id}
        threadSubject={viewingThread.subject}
        onBack={() => setViewingThread(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0">
        {editingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-edit-issue-title"
              className="text-lg font-semibold h-8"
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  updateMutation.mutate({ title: titleVal });
                  setEditingTitle(false);
                }
                if (e.key === "Escape") setEditingTitle(false);
              }}
              autoFocus
            />
            <Button size="sm" onClick={() => { updateMutation.mutate({ title: titleVal }); setEditingTitle(false); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>Cancel</Button>
          </div>
        ) : (
          <button
            className="group flex items-center gap-2 text-left"
            onClick={() => { setTitleVal(issue.title); setEditingTitle(true); }}
            data-testid="button-edit-title"
          >
            <h2 className="text-lg font-semibold text-foreground">{issue.title}</h2>
            <PenLine className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        {issue.contactName && (
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {issue.contactName}
          </p>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-3 justify-start shrink-0" data-testid="tabs-issue-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="threads" data-testid="tab-threads">
            Emails {issue.threadCount > 0 && <span className="ml-1 text-xs">({issue.threadCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks">
            Tasks {issue.taskCount > 0 && <span className="ml-1 text-xs">({issue.taskCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            Notes {issue.noteCount > 0 && <span className="ml-1 text-xs">({issue.noteCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Overview */}
          <TabsContent value="overview" className="m-0 p-6 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
              <div className="flex flex-wrap gap-2">
                {ISSUE_STATUSES.map(s => (
                  <button
                    key={s}
                    data-testid={`status-pill-${s.replace(/\s/g, "-").toLowerCase()}`}
                    onClick={() => updateMutation.mutate({ status: s })}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                      issue.status === s
                        ? `${statusBadgeClass(s)} border-transparent ring-2 ring-offset-1 ring-current`
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</p>
                <Select value={issue.priority} onValueChange={v => updateMutation.mutate({ priority: v })}>
                  <SelectTrigger className="w-full" data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_PRIORITIES.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</p>
                <Select value={issue.issueType ?? "General"} onValueChange={v => updateMutation.mutate({ issueType: v })}>
                  <SelectTrigger className="w-full" data-testid="select-edit-type">
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

            {issue.assigneeName && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned To</p>
                <p className="text-sm text-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {issue.assigneeName}
                </p>
              </div>
            )}

            <IssueAssociationSection
              issue={issue}
              onUpdate={(aid, uid) => updateMutation.mutate({ associationId: aid, unitId: uid })}
            />

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</p>
                {!editingDesc && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setDescVal(issue.description ?? ""); setEditingDesc(true); }}>
                    Edit
                  </Button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea
                    data-testid="textarea-edit-description"
                    value={descVal}
                    onChange={e => setDescVal(e.target.value)}
                    rows={4}
                    placeholder="Add a description…"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { updateMutation.mutate({ description: descVal || null }); setEditingDesc(false); }}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {issue.description || <span className="italic text-muted-foreground/50">No description</span>}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</p>
              <p className="text-sm text-muted-foreground">{relativeTime(issue.createdAt?.toString())}</p>
            </div>
          </TabsContent>

          {/* Threads */}
          <TabsContent value="threads" className="m-0 p-6 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Linked Emails</p>
              <Button size="sm" variant="outline" onClick={() => setShowLinkThread(true)} data-testid="button-link-thread">
                <Link2 className="h-3.5 w-3.5 mr-1" />
                Link Thread
              </Button>
            </div>
            {threadsLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !linkedThreads?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No email threads linked</p>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedThreads.map(lt => (
                  <div key={lt.id} className="flex items-center gap-2 p-3 rounded-md border border-border bg-card min-w-0" data-testid={`linked-thread-${lt.threadId}`}>
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words">{lt.threadSubject || "(no subject)"}</p>
                      <p className="text-xs text-muted-foreground">{lt.threadStatus} · {relativeTime(lt.threadReceivedAt ?? undefined)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setViewingThread({ id: lt.threadId, subject: lt.threadSubject || "(no subject)" })} data-testid={`button-view-thread-${lt.threadId}`}>
                        View
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => unlinkThreadMutation.mutate(lt.threadId)} data-testid={`button-unlink-thread-${lt.threadId}`}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <LinkThreadDialog
              open={showLinkThread}
              onClose={() => setShowLinkThread(false)}
              issueId={issue.id}
              linkedThreadIds={linkedThreadIds}
            />
          </TabsContent>

          {/* Tasks */}
          <TabsContent value="tasks" className="m-0 p-6 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Linked Tasks</p>
              <Button size="sm" variant="outline" onClick={() => setShowLinkTask(true)} data-testid="button-link-task">
                <Link2 className="h-3.5 w-3.5 mr-1" />
                Link Task
              </Button>
            </div>
            {tasksLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !linkedTasks?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No tasks linked</p>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-3 rounded-md border border-border bg-card min-w-0" data-testid={`linked-task-${t.id}`}>
                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${t.status === "Completed" ? "text-green-500" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${t.status === "Completed" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={priorityVariant(t.priority)} className="text-xs">{t.priority}</Badge>
                        {t.assigneeName && <span className="text-xs text-muted-foreground">{t.assigneeName}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => unlinkTaskMutation.mutate(t.id)} data-testid={`button-unlink-task-${t.id}`}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <LinkTaskDialog
              open={showLinkTask}
              onClose={() => setShowLinkTask(false)}
              issueId={issue.id}
              linkedTaskIds={linkedTaskIds}
            />
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="m-0 p-6 space-y-4">
            <div className="space-y-2">
              <Textarea
                data-testid="textarea-issue-note"
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                placeholder="Add an internal note…"
                rows={3}
              />
              <Button
                size="sm"
                disabled={!noteBody.trim() || addNoteMutation.isPending}
                onClick={() => addNoteMutation.mutate()}
                data-testid="button-add-issue-note"
              >
                {addNoteMutation.isPending ? "Adding…" : "Add Note"}
              </Button>
            </div>
            <Separator />
            {notesLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : !notes?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {notes.map(note => (
                  <div key={note.id} className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" data-testid={`issue-note-${note.id}`}>
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                      {note.authorName ?? "Unknown"} · {relativeTime(note.createdAt)}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.body}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="m-0 p-6">
            {timelineLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !timeline?.length ? (
              <div className="text-center py-10 text-muted-foreground">
                <Activity className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {timeline.map(item => {
                  const icon =
                    item.type === "created" ? <AlertCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" /> :
                    item.type === "status_changed" ? <Tag className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" /> :
                    item.type === "thread_linked" ? <Mail className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" /> :
                    item.type === "task_linked" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> :
                    item.type === "note" ? <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> :
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
                  return (
                    <div key={item.id} className="flex gap-2.5 py-2 border-b border-border/50 last:border-0" data-testid={`timeline-item-${item.id}`}>
                      {icon}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{item.summary}</p>
                        {item.detail && <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>}
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {item.actorName && <span>{item.actorName} · </span>}
                          {relativeTime(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// ─── Issues Page ──────────────────────────────────────────────────────────────

export function IssuesPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assocFilter, setAssocFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const { data: filterAssociations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()) });

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (priorityFilter !== "all") queryParams.set("priority", priorityFilter);
  if (assocFilter !== "all") queryParams.set("associationId", assocFilter);

  const { data: issues, isLoading } = useQuery<IssueWithDetails[]>({
    queryKey: ["/api/issues", statusFilter, priorityFilter, assocFilter],
    queryFn: () => fetch(`/api/issues?${queryParams.toString()}`).then(r => r.json()),
  });

  const selected = issues?.find(i => i.id === selectedId) ?? null;
  const openCount = issues?.filter(i => ["Open", "In Progress", "Waiting"].includes(i.status)).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">Issues</h2>
          <Badge variant="secondary" className="text-xs" data-testid="badge-issue-count">
            {openCount} open
          </Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-new-issue">
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Issue
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Issue List */}
        <div className="w-80 border-r border-border flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-border flex gap-2 shrink-0 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ISSUE_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-filter-priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {ISSUE_PRIORITIES.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assocFilter} onValueChange={setAssocFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-filter-association">
                <SelectValue placeholder="Association" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All associations</SelectItem>
                {filterAssociations.map(a => (
                  <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
              </div>
            ) : !issues?.length ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-6">
                <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No issues found</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started</p>
              </div>
            ) : (
              issues.map(issue => (
                <IssueListItem
                  key={issue.id}
                  issue={issue}
                  selected={issue.id === selectedId}
                  onClick={() => setSelectedId(issue.id)}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* Right: Issue Detail */}
        <div className="flex-1 overflow-hidden">
          {selected ? (
            <IssueDetailPanel
              key={selected.id}
              issue={selected}
              onUpdated={() => queryClient.invalidateQueries({ queryKey: ["/api/issues"] })}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mb-4 opacity-20" />
              <p className="text-sm font-medium">Select an issue</p>
              <p className="text-xs mt-1 opacity-70">Pick an issue from the list to view details</p>
            </div>
          )}
        </div>
      </div>

      <CreateIssueDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
