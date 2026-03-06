import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  UserCheck, UserX, User, MessageSquare, Activity,
  Send, ChevronRight,
} from "lucide-react";
import type { User as UserType } from "@shared/schema";
import type { NoteWithUser, ActivityWithUser } from "@shared/routes";

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
type ThreadStatus = typeof STATUS_OPTIONS[number];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Open") return "default";
  if (status === "Waiting") return "outline";
  if (status === "Closed") return "secondary";
  return "secondary";
}

function activityDescription(entry: ActivityWithUser): string {
  const actor = entry.actorName ?? "Someone";
  const meta = (entry.metadata ?? {}) as Record<string, string>;
  switch (entry.action) {
    case "claimed": return `${actor} claimed this thread`;
    case "assigned": return `${actor} assigned to ${meta.assigneeName ?? "a user"}`;
    case "unassigned": return `${actor} removed the assignee`;
    case "status_changed": return `${actor} changed status: ${meta.from} → ${meta.to}`;
    case "note_added": return `${actor} added a note`;
    default: return `${actor} performed ${entry.action}`;
  }
}

// ─── Thread Sidebar ───────────────────────────────────────────────────────────

interface Props {
  threadId: number;
  assignedUserId: number | null;
  status: string;
  currentUser: UserType;
}

export function ThreadSidebar({ threadId, assignedUserId, status, currentUser }: Props) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState("");

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
    mutationFn: (userId: number) =>
      apiRequest("POST", `/api/threads/${threadId}/assign`, { userId }),
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
    mutationFn: (body: string) =>
      apiRequest("POST", `/api/threads/${threadId}/notes`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "activity"] });
      setNoteBody("");
      toast({ title: "Note added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const assignedUser = users?.find(u => u.id === assignedUserId);
  const otherUsers = users?.filter(u => u.id !== assignedUserId) ?? [];

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
              {otherUsers.length > 0 && (
                <Select
                  onValueChange={(v) => assignMutation.mutate(Number(v))}
                  disabled={isMutating}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-assign">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map(u => (
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
              <Select
                onValueChange={(v) => assignMutation.mutate(Number(v))}
                disabled={isMutating}
              >
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
    </ScrollArea>
  );
}
