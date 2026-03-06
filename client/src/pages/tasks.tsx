import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckSquare, Plus, AlertTriangle, User, Link2, Calendar,
  ChevronRight, Circle, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { useLocation } from "wouter";
import type { TaskWithMeta } from "@shared/routes";
import type { User as UserType } from "@shared/schema";
import { TASK_STATUSES, TASK_PRIORITIES } from "@shared/routes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  if (p === "Urgent") return "destructive";
  if (p === "High") return "default";
  if (p === "Normal") return "secondary";
  return "outline";
}

function statusIcon(s: string) {
  if (s === "Completed") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (s === "Cancelled") return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  if (s === "In Progress") return <Clock className="h-3.5 w-3.5 text-blue-500" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatDueDate(d: string | Date | null): string | null {
  if (!d) return null;
  const date = new Date(d);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function isDueDateOverdue(d: string | Date | null): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

// ─── Create Task Dialog ───────────────────────────────────────────────────────

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  prefillTitle?: string;
  prefillThreadId?: number;
}

function CreateTaskDialog({ open, onClose, prefillTitle = "", prefillThreadId }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const [title, setTitle] = useState(prefillTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("Normal");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (prefillThreadId) queryClient.invalidateQueries({ queryKey: ["/api/threads", prefillThreadId, "tasks"] });
      toast({ title: "Task created" });
      onClose();
      setTitle(""); setDescription(""); setPriority("Normal"); setAssignedUserId(""); setDueDate("");
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
      threadId: prefillThreadId ?? null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              data-testid="input-task-title"
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea
              placeholder="Optional details..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              data-testid="input-task-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Due date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="text-sm"
                data-testid="input-task-due-date"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to</label>
            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
              <SelectTrigger data-testid="select-task-assignee">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {users?.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {prefillThreadId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              Will be linked to the current thread
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || createMutation.isPending}
            data-testid="button-create-task-submit"
          >
            {createMutation.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Task Drawer ─────────────────────────────────────────────────────────

interface EditTaskDialogProps {
  task: TaskWithMeta | null;
  onClose: () => void;
}

function EditTaskDialog({ task, onClose }: EditTaskDialogProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const [status, setStatus] = useState<string>(task?.status ?? "Open");
  const [priority, setPriority] = useState<string>(task?.priority ?? "Normal");
  const [assignedUserId, setAssignedUserId] = useState<string>(task?.assignedUserId ? String(task.assignedUserId) : "");
  const [dueDate, setDueDate] = useState<string>(task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "");
  const [description, setDescription] = useState<string>(task?.description ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", `/api/tasks/${task!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task?.threadId) queryClient.invalidateQueries({ queryKey: ["/api/threads", task.threadId, "tasks"] });
      toast({ title: "Task updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed to update task", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tasks/${task!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task?.threadId) queryClient.invalidateQueries({ queryKey: ["/api/threads", task.threadId, "tasks"] });
      toast({ title: "Task deleted" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed to delete task", description: e.message, variant: "destructive" }),
  });

  if (!task) return null;

  function handleSave() {
    updateMutation.mutate({
      status,
      priority,
      assignedUserId: assignedUserId ? Number(assignedUserId) : null,
      dueDate: dueDate || null,
      description: description.trim() || null,
    });
  }

  return (
    <Dialog open={!!task} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {task.threadSubject && (
            <button
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              onClick={() => { onClose(); navigate("/inbox"); }}
              data-testid="link-task-thread"
            >
              <Link2 className="h-3 w-3" />
              Thread: {task.threadSubject}
            </button>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              data-testid="input-edit-task-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-edit-task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-edit-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to</label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger data-testid="select-edit-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Due date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="text-sm"
                data-testid="input-edit-task-due-date"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Created by {task.createdByName ?? "Unknown"}
          </p>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-task"
          >
            Delete
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-task"
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onClick }: { task: TaskWithMeta; onClick: () => void }) {
  const dueDateText = formatDueDate(task.dueDate);
  const overdue = task.dueDate ? isDueDateOverdue(task.dueDate) : false;
  const done = task.status === "Completed" || task.status === "Cancelled";

  return (
    <button
      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0 flex items-center gap-3 group"
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
      <div className="shrink-0">{statusIcon(task.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium truncate ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </span>
          <Badge variant={priorityVariant(task.priority)} className="text-xs shrink-0">
            {task.priority}
          </Badge>
          {task.status !== "Open" && (
            <Badge variant="outline" className="text-xs shrink-0">{task.status}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {task.assigneeName && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assigneeName}
            </span>
          )}
          {dueDateText && (
            <span className={`text-xs flex items-center gap-1 ${overdue && !done ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {overdue && !done ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {dueDateText}
            </span>
          )}
          {task.threadSubject && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{task.threadSubject}</span>
            </span>
          )}
          {task.issueTitle && (
            <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1" data-testid={`task-issue-link-${task.id}`}>
              <AlertTriangle className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{task.issueTitle}</span>
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── Task List Panel ──────────────────────────────────────────────────────────

function TaskList({
  tasks,
  isLoading,
  emptyMessage,
  onTaskClick,
}: {
  tasks: TaskWithMeta[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  onTaskClick: (t: TaskWithMeta) => void;
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
      </div>
    );
  }
  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-12" data-testid="tasks-empty">
        <div>
          <CheckSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="task-list">
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
      ))}
    </div>
  );
}

// ─── Tasks Page ───────────────────────────────────────────────────────────────

export function TasksPage() {
  const { data: currentUser } = useUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskWithMeta | null>(null);

  const { data: myTasks, isLoading: loadingMine } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/tasks", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?assignedToMe=true", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: teamTasks, isLoading: loadingTeam } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/tasks", "team"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: overdueTasks, isLoading: loadingOverdue } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/tasks", "overdue"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?overdue=true", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const openCount = teamTasks?.filter(t => t.status === "Open" || t.status === "In Progress").length ?? 0;
  const overdueCount = overdueTasks?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">Tasks</h2>
          <Badge variant="secondary" className="text-xs" data-testid="badge-task-count">
            {openCount} open
          </Badge>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs" data-testid="badge-overdue-count">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-new-task">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Task
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="mine" className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 border-b border-border shrink-0">
          <TabsList className="h-10 bg-transparent p-0 gap-1">
            <TabsTrigger value="mine" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-my-tasks">
              My Tasks
              {myTasks && myTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1.5">{myTasks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="team" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-team-tasks">
              Team Tasks
              {teamTasks && teamTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1.5">{teamTasks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-overdue-tasks">
              Overdue
              {overdueCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 text-xs h-4 px-1.5">{overdueCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="mine" className="mt-0 h-full">
            <TaskList
              tasks={myTasks}
              isLoading={loadingMine}
              emptyMessage="No tasks assigned to you."
              onTaskClick={setEditTask}
            />
          </TabsContent>

          <TabsContent value="team" className="mt-0 h-full">
            <TaskList
              tasks={teamTasks}
              isLoading={loadingTeam}
              emptyMessage="No tasks yet. Create one from a thread or the New Task button."
              onTaskClick={setEditTask}
            />
          </TabsContent>

          <TabsContent value="overdue" className="mt-0 h-full">
            <TaskList
              tasks={overdueTasks}
              isLoading={loadingOverdue}
              emptyMessage="No overdue tasks. Nice work!"
              onTaskClick={setEditTask}
            />
          </TabsContent>
        </div>
      </Tabs>

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditTaskDialog task={editTask} onClose={() => setEditTask(null)} />
    </div>
  );
}
