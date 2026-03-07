import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, RefreshCw, Paperclip, Mail, ChevronDown,
  AlertCircle, Clock, CheckCheck, Search, Filter, X,
  Reply, ReplyAll, Send, UserPlus, UserX
} from "lucide-react";
import type { Mailbox, EmailThread, Message, Attachment, User, Contact } from "@shared/schema";
import type { ContactWithDetails } from "@shared/routes";
import { CONTACT_TYPES } from "@shared/routes";
import { ThreadSidebar } from "@/components/thread-sidebar";

// ─── Type extensions ───────────────────────────────────────────────────────────
interface ThreadWithMeta extends EmailThread {
  unreadCount: number;
  latestSender: string | null;
  latestSenderName: string | null;
  hasAttachments: boolean;
}

interface MessageWithAttachments extends Message {
  attachments: Attachment[];
}

interface InboxFilters {
  search: string;
  status: string;
  unreadOnly: boolean;
  hasAttachments: boolean;
  assignedUserId: string;
  view: "inbox" | "sent";
  hasTask: boolean;
  hasIssue: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Graph status banner ──────────────────────────────────────────────────────
function GraphStatusBanner() {
  const { data } = useQuery<{ configured: boolean; method: string | null; message: string }>({
    queryKey: ["/api/graph/status"],
  });
  if (!data || data.configured) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs" data-testid="banner-graph-not-configured">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Microsoft Graph is not connected — email sync is unavailable. Connect the Outlook integration or set{" "}
        <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_TENANT_ID</code>,{" "}
        <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_CLIENT_ID</code>, and{" "}
        <code className="font-mono bg-amber-100 px-1 rounded">MICROSOFT_CLIENT_SECRET</code>.
      </span>
    </div>
  );
}

// ─── Quick Link Contact Dialog ────────────────────────────────────────────────
function QuickLinkContactDialog({
  open,
  onClose,
  threadId,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  threadId: number;
  onLinked: () => void;
}) {
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
      toast({ title: "Contact linked to thread" });
      onLinked();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed to link contact", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setQuery(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Link Existing Contact</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email, phone…"
              className="pl-8"
              data-testid="input-quick-link-search"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5" data-testid="quick-link-results">
            {isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !results || results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {query ? "No contacts found." : "Type to search contacts."}
              </p>
            ) : (
              results.map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/70 text-left transition-colors"
                  onClick={() => linkMutation.mutate(c.id)}
                  disabled={linkMutation.isPending}
                  data-testid={`quick-link-contact-${c.id}`}
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

// ─── Unknown contact banner ───────────────────────────────────────────────────
function UnknownContactBanner({
  thread,
  latestInboundMessage,
  onIgnore,
}: {
  thread: ThreadWithMeta;
  latestInboundMessage: MessageWithAttachments | null;
  onIgnore: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const { toast } = useToast();

  const email = latestInboundMessage?.senderEmail ?? "";
  const name = latestInboundMessage?.senderName ?? "";

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: ["/api/contacts/lookup", email],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/lookup?email=${encodeURIComponent(email)}`, { credentials: "include" });
      if (res.status === 404) return null as any;
      if (!res.ok) throw new Error("Lookup failed");
      return res.json();
    },
    enabled: !!email && !thread.contactId,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading || contact || thread.contactId || !email) return null;

  return (
    <>
      <div className="mx-6 mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 flex items-start justify-between gap-3" data-testid="unknown-contact-banner">
        <div className="flex items-start gap-2">
          <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Unknown sender</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {name ? `${name} ` : ""}<span className="font-mono">&lt;{email}&gt;</span> is not in your contacts.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)} data-testid="button-create-contact-from-thread">
            <UserPlus className="h-3 w-3" />
            Create
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLinkOpen(true)} data-testid="button-link-existing-contact-from-thread">
            <Search className="h-3 w-3" />
            Link Existing
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onIgnore} data-testid="button-ignore-unknown-contact">
            Ignore
          </Button>
        </div>
      </div>

      <QuickCreateContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        prefillName={name}
        prefillEmail={email}
        threadId={thread.id}
        onCreated={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/contacts/lookup", email] });
          queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
          toast({ title: "Contact created and linked to thread" });
        }}
      />

      <QuickLinkContactDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        threadId={thread.id}
        onLinked={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts/lookup", email] });
          queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
        }}
      />
    </>
  );
}

function QuickCreateContactDialog({
  open, onOpenChange, prefillName, prefillEmail, threadId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillName: string;
  prefillEmail: string;
  threadId: number;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const lastAutoRef = useRef("");

  function parseName(full: string) {
    const parts = full.trim().split(/\s+/);
    if (parts.length >= 2) return { first: parts[0], last: parts.slice(1).join(" ") };
    return { first: full.trim(), last: "" };
  }

  const { first: initFirst, last: initLast } = parseName(prefillName);
  const [firstName, setFirstName] = useState(initFirst);
  const [lastName, setLastName] = useState(initLast);
  const [displayName, setDisplayName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [contactType, setContactType] = useState("Other");

  useEffect(() => {
    const { first, last } = parseName(prefillName);
    setFirstName(first);
    setLastName(last);
    setDisplayName(prefillName);
    setEmail(prefillEmail);
    lastAutoRef.current = prefillName;
  }, [prefillName, prefillEmail]);

  function handleFirstChange(v: string) {
    setFirstName(v);
    const auto = [v, lastName].filter(Boolean).join(" ").trim();
    if (displayName === lastAutoRef.current || displayName === "") {
      setDisplayName(auto);
      lastAutoRef.current = auto;
    }
  }
  function handleLastChange(v: string) {
    setLastName(v);
    const auto = [firstName, v].filter(Boolean).join(" ").trim();
    if (displayName === lastAutoRef.current || displayName === "") {
      setDisplayName(auto);
      lastAutoRef.current = auto;
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const contact = await apiRequest("POST", "/api/contacts", {
        displayName: displayName.trim() || [firstName, lastName].filter(Boolean).join(" "),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        primaryEmail: email,
        contactType,
      }).then(r => r.json());
      await apiRequest("POST", `/api/threads/${threadId}/contacts`, { contactId: contact.id, relationshipType: null });
      return contact;
    },
    onSuccess: onCreated,
    onError: (err: Error) => toast({ title: "Failed to create contact", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Contact</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">The new contact will be automatically linked to this thread.</p>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">First Name</Label>
              <Input value={firstName} onChange={e => handleFirstChange(e.target.value)} placeholder="Jane" className="h-8" data-testid="input-quick-contact-firstname" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Last Name</Label>
              <Input value={lastName} onChange={e => handleLastChange(e.target.value)} placeholder="Smith" className="h-8" data-testid="input-quick-contact-lastname" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Display Name</Label>
            <Input value={displayName} onChange={e => { setDisplayName(e.target.value); lastAutoRef.current = e.target.value; }} placeholder="Full name" className="h-8" data-testid="input-quick-contact-name" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="h-8" data-testid="input-quick-contact-email" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Contact Type</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !displayName.trim()} data-testid="button-save-quick-contact">
            {mutation.isPending ? "Creating..." : "Create & Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reply compose panel ──────────────────────────────────────────────────────
function ReplyCompose({
  thread,
  replyToMessage,
  replyAll,
  onClose,
  onSent,
}: {
  thread: ThreadWithMeta;
  replyToMessage: MessageWithAttachments;
  replyAll: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/threads/${thread.id}/reply`, {
      body: `<p>${body.replace(/\n/g, "<br>")}</p>`,
      replyAll,
      to: replyAll ? undefined : [replyToMessage.senderEmail],
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", thread.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({ title: "Reply sent" });
      onSent();
    },
    onError: (err: Error) => toast({ title: "Failed to send reply", description: err.message, variant: "destructive" }),
  });

  const recipientDisplay = replyAll
    ? `${replyToMessage.senderEmail} + all recipients`
    : replyToMessage.senderEmail;

  return (
    <div className="border-t border-border bg-card shrink-0" data-testid="reply-compose">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{replyAll ? "Reply All" : "Reply"}</span>
          <span>to</span>
          <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded truncate max-w-[300px]" data-testid="reply-to-address">{recipientDisplay}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose} data-testid="button-close-reply">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-4 pb-3">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your reply..."
          className="min-h-[100px] resize-none text-sm"
          data-testid="textarea-reply-body"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
              e.preventDefault();
              mutation.mutate();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">Cmd+Enter to send</p>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !body.trim()}
            data-testid="button-send-reply"
            className="gap-2"
          >
            <Send className="h-3.5 w-3.5" />
            {mutation.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageCard({
  message,
  onReply,
  onReplyAll,
  highlight,
  dimmed,
}: {
  message: MessageWithAttachments;
  onReply: () => void;
  onReplyAll: () => void;
  highlight?: boolean;
  dimmed?: boolean;
}) {
  const [showHtml, setShowHtml] = useState(false);
  const bodyContent = message.bodyHtml || message.bodyText || message.bodyPreview;
  const hasRichBody = !!message.bodyHtml;
  const isOutbound = message.direction === "outbound";

  return (
    <div
      className={`border border-border rounded-lg bg-card transition-opacity ${isOutbound ? "border-l-2 border-l-primary/30" : ""} ${highlight ? "border-l-2 border-l-primary ring-1 ring-primary/20" : ""} ${dimmed ? "opacity-70" : ""}`}
      data-testid={`message-card-${message.id}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isOutbound ? "bg-primary/20" : "bg-primary/10"}`}>
                <span className="text-xs font-semibold text-primary">
                  {(message.senderName || message.senderEmail)?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate" data-testid={`msg-sender-${message.id}`}>
                    {message.senderName || message.senderEmail}
                  </p>
                  {isOutbound && (
                    <Badge variant="outline" className="text-xs h-4 px-1 py-0 shrink-0">Sent</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {message.senderName ? `<${message.senderEmail}>` : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              {!isOutbound && (
                <>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={onReply} data-testid={`button-reply-${message.id}`}>
                    <Reply className="h-3 w-3" />Reply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={onReplyAll} data-testid={`button-reply-all-${message.id}`}>
                    <ReplyAll className="h-3 w-3" />All
                  </Button>
                </>
              )}
            </div>
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
        {message.recipients && message.recipients.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 ml-10">
            To: <span data-testid={`msg-recipients-${message.id}`}>{message.recipients.slice(0, 3).join(", ")}{message.recipients.length > 3 && ` +${message.recipients.length - 3} more`}</span>
          </p>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4 group">
        {hasRichBody ? (
          <div>
            {showHtml ? (
              <div className="prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_img]:max-w-full text-sm" dangerouslySetInnerHTML={{ __html: message.bodyHtml! }} data-testid={`msg-body-${message.id}`} />
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed" data-testid={`msg-body-${message.id}`}>
                {message.bodyPreview || "(no preview)"}
              </p>
            )}
            <button onClick={() => setShowHtml(!showHtml)} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1" data-testid={`toggle-html-${message.id}`}>
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
          <p className="text-xs font-medium text-muted-foreground mb-2 pt-3">Attachments ({message.attachments.length})</p>
          <div className="flex flex-col gap-3">
            {message.attachments.map(att => {
              const downloadUrl = `/api/attachments/${att.id}/download`;
              const isAudio = att.contentType?.startsWith("audio/") || att.filename?.toLowerCase().endsWith(".mp3");
              const isImage = att.contentType?.startsWith("image/");
              return (
                <div key={att.id} className="rounded-md border border-border bg-secondary/50 overflow-hidden" data-testid={`attachment-${att.id}`}>
                  {isAudio && (
                    <div className="px-3 pt-3">
                      <audio controls className="w-full h-8" preload="metadata" src={downloadUrl}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  )}
                  {isImage && (
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={downloadUrl}
                        alt={att.filename ?? "attachment"}
                        className="max-w-full max-h-48 object-contain block"
                        loading="lazy"
                      />
                    </a>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={downloadUrl}
                      download={att.filename ?? "file"}
                      className="text-foreground font-medium truncate max-w-[200px] hover:underline"
                      data-testid={`attachment-download-${att.id}`}
                    >
                      {att.filename}
                    </a>
                    {att.sizeBytes && <span className="text-muted-foreground shrink-0">{formatBytes(att.sizeBytes)}</span>}
                    {att.contentType && (
                      <span className="text-muted-foreground/60 uppercase shrink-0">
                        {att.contentType.split("/").pop()}
                      </span>
                    )}
                    <a
                      href={downloadUrl}
                      download={att.filename ?? "file"}
                      className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Download"
                      data-testid={`attachment-download-btn-${att.id}`}
                    >
                      ↓
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Thread detail view ───────────────────────────────────────────────────────
const VISIBLE_COUNT = 2;

function ThreadDetail({
  thread,
  currentUser,
  threads,
  onSelectThread,
}: {
  thread: ThreadWithMeta;
  currentUser: User;
  threads: ThreadWithMeta[];
  onSelectThread: (id: number) => void;
}) {
  const [replyState, setReplyState] = useState<{ message: MessageWithAttachments; replyAll: boolean } | null>(null);
  const [ignoredContact, setIgnoredContact] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  const { data: messages, isLoading, refetch } = useQuery<MessageWithAttachments[]>({
    queryKey: ["/api/threads", thread.id, "messages"],
    staleTime: 30_000,
  });

  // Sort newest first — show newest VISIBLE_COUNT expanded by default
  const sortedMessages = messages ? [...messages].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()) : [];
  const newestMessages = sortedMessages.slice(0, VISIBLE_COUNT);
  const olderMessages = sortedMessages.slice(VISIBLE_COUNT);
  const hasOlder = olderMessages.length > 0;

  const latestInbound = sortedMessages.find(m => m.direction !== "outbound") || null;

  const openReply = useCallback((message: MessageWithAttachments, replyAll: boolean) => {
    setReplyState({ message, replyAll });
  }, []);

  // Next thread navigation
  const currentIndex = threads.findIndex(t => t.id === thread.id);
  const openThreads = threads.filter(t => t.status === "Open");
  const currentOpenIndex = openThreads.findIndex(t => t.id === thread.id);
  const nextOpenThread = openThreads[currentOpenIndex + 1] ?? openThreads[0] ?? null;
  const nextThread = threads[currentIndex + 1] ?? null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread header */}
      <div className="px-6 py-4 border-b border-border shrink-0 bg-card" data-testid="thread-detail-header">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-foreground text-base leading-tight flex-1 min-w-0" data-testid="thread-detail-subject">
            {thread.subject || "(no subject)"}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            {nextOpenThread && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => onSelectThread(nextOpenThread.id)}
                data-testid="button-next-thread"
                title="Go to next open thread"
              >
                Next →
              </Button>
            )}
            {!nextOpenThread && nextThread && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs gap-1 text-muted-foreground"
                onClick={() => onSelectThread(nextThread.id)}
                data-testid="button-next-thread-any"
                title="Go to next thread"
              >
                Next →
              </Button>
            )}
            <button onClick={() => refetch()} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted" data-testid="button-refresh-messages">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <Badge variant={thread.status === "Open" ? "default" : "secondary"} className="text-xs" data-testid="thread-status-badge">
            {thread.status}
          </Badge>
          {thread.unreadCount > 0 && (
            <span className="text-xs text-primary font-medium" data-testid="thread-unread-count">{thread.unreadCount} unread</span>
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
        {/* Messages + compose */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Unknown contact banner */}
          {!ignoredContact && latestInbound && (
            <UnknownContactBanner
              thread={thread}
              latestInboundMessage={latestInbound}
              onIgnore={() => setIgnoredContact(true)}
            />
          )}

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4 space-y-4" data-testid="thread-messages-container">
              {isLoading ? (
                <>
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </>
              ) : !sortedMessages || sortedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="thread-no-messages">
                  <Mail className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No messages in this thread.</p>
                </div>
              ) : (
                <>
                  {/* Older messages (collapsed by default) */}
                  {hasOlder && (
                    <div className="flex items-center gap-2" data-testid="older-messages-toggle-container">
                      <div className="h-px flex-1 bg-border" />
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-muted/50 transition-colors whitespace-nowrap"
                        onClick={() => setShowOlder(v => !v)}
                        data-testid="button-toggle-older-messages"
                      >
                        {showOlder ? `Hide ${olderMessages.length} older` : `Show ${olderMessages.length} older`}
                      </button>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  {showOlder && olderMessages.map(msg => (
                    <MessageCard
                      key={msg.id}
                      message={msg}
                      onReply={() => openReply(msg, false)}
                      onReplyAll={() => openReply(msg, true)}
                      dimmed
                    />
                  ))}

                  {hasOlder && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Latest {newestMessages.length} messages</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  {newestMessages.map((msg, i) => (
                    <MessageCard
                      key={msg.id}
                      message={msg}
                      onReply={() => openReply(msg, false)}
                      onReplyAll={() => openReply(msg, true)}
                      highlight={i === 0 && !msg.isRead}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>

          {/* Reply compose */}
          {replyState ? (
            <ReplyCompose
              thread={thread}
              replyToMessage={replyState.message}
              replyAll={replyState.replyAll}
              onClose={() => setReplyState(null)}
              onSent={() => setReplyState(null)}
            />
          ) : latestInbound && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 shrink-0 flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openReply(latestInbound, false)} data-testid="button-quick-reply">
                <Reply className="h-3.5 w-3.5" />Reply
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openReply(latestInbound, true)} data-testid="button-quick-reply-all">
                <ReplyAll className="h-3.5 w-3.5" />Reply All
              </Button>
            </div>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="w-64 shrink-0 min-h-0 overflow-hidden border-l border-border" data-testid="thread-sidebar">
          <ThreadSidebar
            threadId={thread.id}
            threadSubject={thread.subject}
            assignedUserId={thread.assignedUserId ?? null}
            status={thread.status}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sync mutation hook ───────────────────────────────────────────────────────
function useSyncMailbox(mailboxId: number) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailboxes/${mailboxId}/sync`).then(r => r.json()),
    onSuccess: (result: { threadsUpserted: number; messagesUpserted: number; errors: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      if (result.errors.length > 0) {
        toast({ title: "Sync completed with errors", description: result.errors[0], variant: "destructive" });
      } else {
        toast({ title: "Sync complete", description: `${result.threadsUpserted} threads, ${result.messagesUpserted} new messages synced.` });
      }
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });
}

// ─── Filter panel ─────────────────────────────────────────────────────────────
function FilterPanel({
  filters,
  onChange,
  users,
}: {
  filters: InboxFilters;
  onChange: (f: Partial<InboxFilters>) => void;
  users: User[];
}) {
  const activeCount = [
    filters.status !== "all",
    filters.unreadOnly,
    filters.hasAttachments,
    filters.assignedUserId !== "all",
    filters.hasTask,
    filters.hasIssue,
  ].filter(Boolean).length;

  return (
    <div className="px-3 py-2 border-b border-border bg-muted/20 space-y-2" data-testid="filter-panel">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={filters.status} onValueChange={v => onChange({ status: v })}>
            <SelectTrigger className="h-7 text-xs" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Waiting">Waiting</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Assigned to</Label>
          <Select value={filters.assignedUserId} onValueChange={v => onChange({ assignedUserId: v })}>
            <SelectTrigger className="h-7 text-xs" data-testid="filter-assigned">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <Switch id="unread-only" checked={filters.unreadOnly} onCheckedChange={v => onChange({ unreadOnly: v })} data-testid="filter-unread-only" />
          <Label htmlFor="unread-only" className="text-xs cursor-pointer">Unread only</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="has-attachments" checked={filters.hasAttachments} onCheckedChange={v => onChange({ hasAttachments: v })} data-testid="filter-has-attachments" />
          <Label htmlFor="has-attachments" className="text-xs cursor-pointer">Has attachments</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="has-issue" checked={filters.hasIssue} onCheckedChange={v => onChange({ hasIssue: v })} data-testid="filter-has-issue" />
          <Label htmlFor="has-issue" className="text-xs cursor-pointer">Has issue</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="has-task" checked={filters.hasTask} onCheckedChange={v => onChange({ hasTask: v })} data-testid="filter-has-task" />
          <Label htmlFor="has-task" className="text-xs cursor-pointer">Has task</Label>
        </div>
        {activeCount > 0 && (
          <button
            className="text-xs text-primary hover:underline ml-auto"
            onClick={() => onChange({ status: "all", unreadOnly: false, hasAttachments: false, assignedUserId: "all", hasTask: false, hasIssue: false })}
            data-testid="button-clear-filters"
          >
            Clear filters ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main inbox page ──────────────────────────────────────────────────────────
export function InboxPage() {
  const [selectedMailboxId, setSelectedMailboxId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<InboxFilters>({
    search: "",
    status: "all",
    unreadOnly: false,
    hasAttachments: false,
    assignedUserId: "all",
    view: "inbox",
    hasTask: false,
    hasIssue: false,
  });

  const debouncedSearch = useDebounce(searchInput, 350);

  const { data: currentUser } = useQuery<User>({ queryKey: ["/api/auth/me"] });
  const { data: mailboxes, isLoading: loadingMailboxes } = useQuery<Mailbox[]>({ queryKey: ["/api/mailboxes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  useEffect(() => {
    if (mailboxes && mailboxes.length > 0 && selectedMailboxId === null) {
      setSelectedMailboxId(mailboxes.find(m => m.isDefault)?.id ?? mailboxes[0].id);
    }
  }, [mailboxes, selectedMailboxId]);

  const activeMailboxId = selectedMailboxId ?? mailboxes?.[0]?.id ?? null;
  const activeMailbox = mailboxes?.find(m => m.id === activeMailboxId);

  // Build query params for thread list
  const buildThreadsUrl = () => {
    const params = new URLSearchParams();
    if (activeMailboxId) params.set("mailboxId", String(activeMailboxId));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.unreadOnly) params.set("unreadOnly", "true");
    if (filters.hasAttachments) params.set("hasAttachments", "true");
    if (filters.assignedUserId !== "all") params.set("assignedUserId", filters.assignedUserId);
    params.set("sentOnly", filters.view === "sent" ? "true" : "false");
    if (filters.hasTask) params.set("hasTask", "true");
    if (filters.hasIssue) params.set("hasIssue", "true");
    return `/api/threads?${params.toString()}`;
  };

  const { data: threads, isLoading: loadingThreads, refetch: refetchThreads } = useQuery<ThreadWithMeta[]>({
    queryKey: ["/api/threads", activeMailboxId, debouncedSearch, filters],
    queryFn: async () => {
      const res = await fetch(buildThreadsUrl(), { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 30_000,
  });

  const sync = useSyncMailbox(activeMailboxId!);
  const selectedThread = threads?.find(t => t.id === selectedThreadId) ?? null;
  const unreadTotal = threads?.reduce((sum, t) => sum + t.unreadCount, 0) ?? 0;

  const activeFilterCount = [
    filters.status !== "all",
    filters.unreadOnly,
    filters.hasAttachments,
    filters.assignedUserId !== "all",
    filters.hasTask,
    filters.hasIssue,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="inbox-page">
      <GraphStatusBanner />

      {/* Top toolbar */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border shrink-0 bg-card">
        {loadingMailboxes ? (
          <Skeleton className="h-8 w-40 rounded" />
        ) : (
          <div className="flex items-center gap-2">
            {mailboxes && mailboxes.length > 1 ? (
              <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5" data-testid="mailbox-selector">
                {mailboxes.map(mb => (
                  <button
                    key={mb.id}
                    onClick={() => { setSelectedMailboxId(mb.id); setSelectedThreadId(null); }}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${activeMailboxId === mb.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
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

        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg" data-testid="inbox-view-toggle">
          <button
            onClick={() => setFilters(f => ({ ...f, view: "inbox" }))}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filters.view === "inbox" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-view-inbox"
          >
            Inbox
          </button>
          <button
            onClick={() => setFilters(f => ({ ...f, view: "sent" }))}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filters.view === "sent" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-view-sent"
          >
            Sent
          </button>
        </div>

        {unreadTotal > 0 && (
          <Badge variant="default" className="text-xs" data-testid="badge-unread-count">{unreadTotal} unread</Badge>
        )}

        <Button size="sm" variant="outline" onClick={() => refetchThreads()} disabled={loadingThreads} data-testid="button-refresh-inbox">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingThreads ? "animate-spin" : ""}`} />
          Refresh
        </Button>

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
          {/* Search + filter toggle */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-card shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search threads…"
                className="h-8 pl-8 text-xs"
                data-testid="input-search-threads"
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" data-testid="button-clear-search">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant={filtersOpen || activeFilterCount > 0 ? "default" : "outline"}
              className="h-8 px-2 shrink-0 gap-1"
              onClick={() => setFiltersOpen(v => !v)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
            </Button>
          </div>

          {/* Filter panel */}
          {filtersOpen && (
            <FilterPanel
              filters={filters}
              onChange={patch => setFilters(prev => ({ ...prev, ...patch }))}
              users={users}
            />
          )}

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
              <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center" data-testid="thread-list-empty">
                <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || activeFilterCount > 0 ? "No threads match your filters." : "No threads synced yet."}
                </p>
                {!debouncedSearch && activeFilterCount === 0 && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Configure Microsoft Graph credentials and click Sync to load emails.
                  </p>
                )}
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
            <ThreadDetail
              thread={selectedThread}
              currentUser={currentUser}
              threads={threads ?? []}
              onSelectThread={(id) => setSelectedThreadId(id)}
            />
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

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Open: "bg-blue-500",
    Waiting: "bg-amber-500",
    Closed: "bg-slate-400",
    Archived: "bg-slate-600",
  };
  return <div className={`h-2 w-2 rounded-full shrink-0 ${colors[status] || "bg-gray-300"}`} />;
}

// ─── Thread list item ─────────────────────────────────────────────────────────
function ThreadItem({
  thread, selected, onClick,
}: {
  thread: ThreadWithMeta;
  selected: boolean;
  onClick: () => void;
}) {
  const hasUnread = thread.unreadCount > 0;
  return (
    <button
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-accent/50 focus:outline-none ${selected ? "bg-accent" : ""}`}
      onClick={onClick}
      data-testid={`thread-item-${thread.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={thread.status} />
          <span className={`text-sm truncate leading-5 ${hasUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`} data-testid={`thread-sender-${thread.id}`}>
            {senderDisplay(thread)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
          {formatDate(thread.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 ml-4">
        {hasUnread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" data-testid={`unread-dot-${thread.id}`} />}
        <span className={`text-sm truncate ${hasUnread ? "font-medium text-foreground" : "text-muted-foreground"}`} data-testid={`thread-subject-${thread.id}`}>
          {thread.subject || "(no subject)"}
        </span>
      </div>
      {thread.hasAttachments && (
        <div className="flex items-center gap-1 mt-1 ml-4">
          <Paperclip className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground/60">Attachment</span>
        </div>
      )}
    </button>
  );
}
