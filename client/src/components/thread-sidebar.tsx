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
} from "lucide-react";
import type { User as UserType } from "@shared/schema";
import type { NoteWithUser, ActivityWithUser, TaskWithMeta } from "@shared/routes";
import { TASK_STATUSES, TASK_PRIORITIES } from "@shared/routes";

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

// ─── Create Task Dialog (inline, for thread context) ──────────────────────────

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  threadId: number;
  defaultTitle: string;
  users: UserType[] | undefined;
}

function CreateTaskDialog({ open, onClose, threadId, defaultTitle, users }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [priority, setPriority] = useState("Normal");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
      toast({ title: "Task created" });
      onClose();
      setTitle(defaultTitle); setPriority("Normal"); setAssignedUserId(""); setDueDate(""); setDescription("");
    },
    onError: (e: Error) => toast({ title: "Failed to create task", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!title.trim()) return;
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      assignedUserId: assignedUserId ? Number(assignedUserId) : null,
      dueDate: dueDate || null,
      threadId,
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to</label>
            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-thread-task-assignee">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {users?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>)}
              </SelectContent>
            </Select>
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

// ─── Thread Sidebar ───────────────────────────────────────────────────────────

interface Props {
  threadId: number;
  threadSubject: string;
  assignedUserId: number | null;
  status: string;
  currentUser: UserType;
}

export function ThreadSidebar({ threadId, threadSubject, assignedUserId, status, currentUser }: Props) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState("");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

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
    onSuccess: () => { invalidateThread(); },
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

  const assignedUser = users?.find(u => u.id === assignedUserId);

  const isMutating =
    claimMutation.isPending ||
    assignMutation.isPending ||
    unassignMutation.isPending ||
    statusMutation.isPending;

  return (
    <ScrollArea className="h-full border-l border-border bg-card">
      <div className="p-4 space-y-5">

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
              data-testid="button-create-thread-task"
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
      />
    </ScrollArea>
  );
}
