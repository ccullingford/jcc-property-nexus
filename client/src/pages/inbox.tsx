import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, RefreshCw, Paperclip, Mail, ChevronDown,
  AlertCircle, Clock, CheckCheck
} from "lucide-react";
import type { Mailbox, EmailThread, Message, Attachment, User } from "@shared/schema";
import { ThreadSidebar } from "@/components/thread-sidebar";

// ─── Type extensions (match API response) ─────────────────────────────────────
interface ThreadWithMeta extends EmailThread {
  unreadCount: number;
  latestSender: string | null;
  latestSenderName: string | null;
}

interface MessageWithAttachments extends Message {
  attachments: Attachment[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: string | Date | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFullDate(ts: string | Date | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function senderDisplay(thread: ThreadWithMeta): string {
  if (thread.latestSenderName) return thread.latestSenderName;
  if (thread.latestSender) {
    const [local] = thread.latestSender.split("@");
    return local.replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  return "Unknown";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Graph status banner ──────────────────────────────────────────────────────
function GraphStatusBanner() {
  const { data } = useQuery<{ configured: boolean; method: string | null; message: string }>({
    queryKey: ["/api/graph/status"],
  });

  if (!data) return null;

  if (!data.configured) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs"
        data-testid="banner-graph-not-configured"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          Microsoft Graph is not connected — email sync is unavailable. Connect the Outlook
          integration or set{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_TENANT_ID</code>,{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_CLIENT_ID</code>, and{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_CLIENT_SECRET</code>.
        </span>
      </div>
    );
  }

  return null;
}

// ─── Thread list item ─────────────────────────────────────────────────────────
function ThreadItem({
  thread,
  selected,
  onClick,
}: {
  thread: ThreadWithMeta;
  selected: boolean;
  onClick: () => void;
}) {
  const hasUnread = thread.unreadCount > 0;

  return (
    <button
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-accent/50 focus:outline-none ${
        selected ? "bg-accent" : ""
      }`}
      onClick={onClick}
      data-testid={`thread-item-${thread.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <span
          className={`text-sm truncate leading-5 ${hasUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          data-testid={`thread-sender-${thread.id}`}
        >
          {senderDisplay(thread)}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
          {formatDate(thread.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {hasUnread && (
          <span className="h-2 w-2 rounded-full bg-primary shrink-0" data-testid={`unread-dot-${thread.id}`} />
        )}
        <span
          className={`text-sm truncate ${hasUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}
          data-testid={`thread-subject-${thread.id}`}
        >
          {thread.subject || "(no subject)"}
        </span>
      </div>
      {thread.hasAttachments && (
        <div className="flex items-center gap-1 mt-1">
          <Paperclip className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground/60">Attachment</span>
        </div>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageCard({ message }: { message: MessageWithAttachments }) {
  const [showHtml, setShowHtml] = useState(false);
  const bodyContent = message.bodyHtml || message.bodyText || message.bodyPreview;
  const hasRichBody = !!message.bodyHtml;

  return (
    <div className="border border-border rounded-lg bg-card" data-testid={`message-card-${message.id}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {(message.senderName || message.senderEmail)?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate" data-testid={`msg-sender-${message.id}`}>
                  {message.senderName || message.senderEmail}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {message.senderName ? `<${message.senderEmail}>` : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {message.isRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/50" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
            <span className="text-xs text-muted-foreground" data-testid={`msg-time-${message.id}`}>
              {formatFullDate(message.receivedAt)}
            </span>
          </div>
        </div>

        {/* Recipients */}
        {message.recipients && message.recipients.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 ml-10">
            To:{" "}
            <span data-testid={`msg-recipients-${message.id}`}>
              {message.recipients.slice(0, 3).join(", ")}
              {message.recipients.length > 3 && ` +${message.recipients.length - 3} more`}
            </span>
          </p>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {hasRichBody ? (
          <div>
            {showHtml ? (
              <div
                className="prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_img]:max-w-full text-sm"
                dangerouslySetInnerHTML={{ __html: message.bodyHtml! }}
                data-testid={`msg-body-${message.id}`}
              />
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed" data-testid={`msg-body-${message.id}`}>
                {message.bodyPreview || "(no preview)"}
              </p>
            )}
            <button
              onClick={() => setShowHtml(!showHtml)}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
              data-testid={`toggle-html-${message.id}`}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showHtml ? "rotate-180" : ""}`} />
              {showHtml ? "Show plain text" : "Show full message"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed" data-testid={`msg-body-${message.id}`}>
            {bodyContent || "(no content)"}
          </p>
        )}
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="px-4 pb-4 pt-0 border-t border-border mt-0">
          <p className="text-xs font-medium text-muted-foreground mb-2 pt-3">
            Attachments ({message.attachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {message.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary/50 text-xs"
                data-testid={`attachment-${att.id}`}
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground font-medium truncate max-w-[200px]">{att.filename}</span>
                {att.sizeBytes && (
                  <span className="text-muted-foreground shrink-0">{formatBytes(att.sizeBytes)}</span>
                )}
                {att.contentType && (
                  <span className="text-muted-foreground/60 uppercase shrink-0">
                    {att.contentType.split("/").pop()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Thread detail view ───────────────────────────────────────────────────────
function ThreadDetail({ thread, currentUser }: { thread: ThreadWithMeta; currentUser: User }) {
  const { data: messages, isLoading } = useQuery<MessageWithAttachments[]>({
    queryKey: ["/api/threads", thread.id, "messages"],
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread header */}
      <div
        className="px-6 py-4 border-b border-border shrink-0 bg-card"
        data-testid="thread-detail-header"
      >
        <h2 className="font-semibold text-foreground text-base leading-tight" data-testid="thread-detail-subject">
          {thread.subject || "(no subject)"}
        </h2>
        <div className="flex items-center gap-3 mt-1">
          <Badge
            variant={thread.status === "Open" ? "default" : "secondary"}
            className="text-xs"
            data-testid="thread-status-badge"
          >
            {thread.status}
          </Badge>
          {thread.unreadCount > 0 && (
            <span className="text-xs text-muted-foreground" data-testid="thread-unread-count">
              {thread.unreadCount} unread
            </span>
          )}
          {thread.lastMessageAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatFullDate(thread.lastMessageAt)}
            </span>
          )}
        </div>
      </div>

      {/* Two-column: messages + sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-4" data-testid="thread-messages-container">
            {isLoading ? (
              <>
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </>
            ) : !messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="thread-no-messages">
                <Mail className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No messages in this thread.</p>
              </div>
            ) : (
              messages.map(msg => <MessageCard key={msg.id} message={msg} />)
            )}
          </div>
        </ScrollArea>

        {/* Actions sidebar */}
        <div className="w-64 shrink-0 min-h-0 overflow-hidden" data-testid="thread-sidebar">
          <ThreadSidebar
            threadId={thread.id}
            assignedUserId={thread.assignedUserId ?? null}
            status={thread.status}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sync result toast helper ─────────────────────────────────────────────────
function useSyncMailbox(mailboxId: number) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailboxes/${mailboxId}/sync`).then(r => r.json()),
    onSuccess: (result: { threadsUpserted: number; messagesUpserted: number; errors: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      if (result.errors.length > 0) {
        toast({
          title: "Sync completed with errors",
          description: result.errors[0],
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync complete",
          description: `${result.threadsUpserted} threads, ${result.messagesUpserted} new messages synced.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Sync failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

// ─── Main inbox page ──────────────────────────────────────────────────────────
export function InboxPage() {
  const [selectedMailboxId, setSelectedMailboxId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const { data: currentUser } = useQuery<User>({ queryKey: ["/api/auth/me"] });

  const { data: mailboxes, isLoading: loadingMailboxes } = useQuery<Mailbox[]>({
    queryKey: ["/api/mailboxes"],
  });

  useEffect(() => {
    if (mailboxes && mailboxes.length > 0 && selectedMailboxId === null) {
      setSelectedMailboxId(mailboxes.find(m => m.isDefault)?.id ?? mailboxes[0].id);
    }
  }, [mailboxes, selectedMailboxId]);

  const activeMailboxId = selectedMailboxId ?? mailboxes?.[0]?.id ?? null;

  const { data: threads, isLoading: loadingThreads } = useQuery<ThreadWithMeta[]>({
    queryKey: ["/api/threads", activeMailboxId],
    queryFn: async () => {
      const url = activeMailboxId ? `/api/threads?mailboxId=${activeMailboxId}` : "/api/threads";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const sync = useSyncMailbox(activeMailboxId!);

  const selectedThread = threads?.find(t => t.id === selectedThreadId) ?? null;
  const unreadTotal = threads?.reduce((sum, t) => sum + t.unreadCount, 0) ?? 0;

  const activeMailbox = mailboxes?.find(m => m.id === activeMailboxId);

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="inbox-page">
      {/* Graph status banner */}
      <GraphStatusBanner />

      {/* Top toolbar */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border shrink-0 bg-card">
        {/* Mailbox selector */}
        {loadingMailboxes ? (
          <Skeleton className="h-8 w-40 rounded" />
        ) : (
          <div className="flex items-center gap-2">
            {mailboxes && mailboxes.length > 1 ? (
              <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5" data-testid="mailbox-selector">
                {mailboxes.map(mb => (
                  <button
                    key={mb.id}
                    onClick={() => {
                      setSelectedMailboxId(mb.id);
                      setSelectedThreadId(null);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      activeMailboxId === mb.id
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`mailbox-tab-${mb.id}`}
                  >
                    {mb.name}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="font-semibold text-sm text-foreground" data-testid="mailbox-name">
                {activeMailbox?.name ?? "Inbox"}
              </h2>
            )}
          </div>
        )}

        <div className="flex-1" />

        {unreadTotal > 0 && (
          <Badge variant="default" className="text-xs" data-testid="badge-unread-count">
            {unreadTotal} unread
          </Badge>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => activeMailboxId && sync.mutate()}
          disabled={sync.isPending || !activeMailboxId}
          data-testid="button-sync"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "Syncing…" : "Sync"}
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Thread list ─────────────────────────────────────── */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
          <ScrollArea className="flex-1 min-h-0" data-testid="thread-list">
            {loadingThreads ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-full rounded" />
                  </div>
                ))}
              </div>
            ) : !threads || threads.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-full py-16 px-6 text-center"
                data-testid="thread-list-empty"
              >
                <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No threads synced yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Configure Microsoft Graph credentials and click Sync to load emails.
                </p>
              </div>
            ) : (
              threads.map(thread => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  selected={thread.id === selectedThreadId}
                  onClick={() => setSelectedThreadId(thread.id)}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* ── Thread detail ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="thread-detail-panel">
          {selectedThread && currentUser ? (
            <ThreadDetail thread={selectedThread} currentUser={currentUser} />
          ) : selectedThread ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-6 py-4 border-b border-border shrink-0 bg-card">
                <Skeleton className="h-5 w-2/3 rounded" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-12" data-testid="thread-detail-empty">
              <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {threads && threads.length > 0 ? "Select a thread to read it" : "No threads to show"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
