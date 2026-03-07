import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, AlertCircle, CheckSquare, Users, Building2, Loader2, Mail, X, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Association, Mailbox, Contact } from "@shared/schema";

type CreateType = "issue" | "task" | "contact" | "association" | "email" | null;

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CONTACT_TYPES = ["Owner", "Tenant", "Vendor", "Board", "Realtor", "Attorney", "Property Manager", "Other"];

export function GlobalCreateMenu() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState<CreateType>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: associations = [] } = useQuery<Association[]>({
    queryKey: ["/api/associations"],
    enabled: open === "issue",
  });

  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/users"],
    enabled: open === "task",
  });

  const { data: issueTypes = [] } = useQuery<{ id: number; value: string; label: string }[]>({
    queryKey: ["/api/types", "issue_type"],
    queryFn: async () => {
      const res = await fetch("/api/types?category=issue_type");
      return res.json();
    },
    enabled: open === "issue",
  });

  const { data: taskTypes = [] } = useQuery<{ id: number; value: string; label: string }[]>({
    queryKey: ["/api/types", "task_type"],
    queryFn: async () => {
      const res = await fetch("/api/types?category=task_type");
      return res.json();
    },
    enabled: open === "task",
  });

  const { data: mailboxes = [] } = useQuery<Mailbox[]>({
    queryKey: ["/api/mailboxes"],
    enabled: open === "email",
  });

  function close() { setOpen(null); }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-sm font-medium"
            data-testid="button-global-create"
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">New…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("email")} data-testid="create-email-menu-item">
            <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
            Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("issue")} data-testid="create-issue-menu-item">
            <AlertCircle className="mr-2 h-4 w-4 text-muted-foreground" />
            Issue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("task")} data-testid="create-task-menu-item">
            <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
            Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("contact")} data-testid="create-contact-menu-item">
            <Users className="mr-2 h-4 w-4 text-muted-foreground" />
            Contact
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { navigate("/associations?create=true"); }} data-testid="create-association-menu-item">
            <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
            Association
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ComposeEmailDialog
        open={open === "email"}
        onClose={close}
        mailboxes={mailboxes}
        onSent={() => {
          toast({ title: "Email sent" });
          close();
        }}
      />

      <CreateIssueDialog
        open={open === "issue"}
        onClose={close}
        associations={associations}
        issueTypes={issueTypes}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
          toast({ title: "Issue created" });
          close();
          navigate(`/issues?id=${id}`);
        }}
      />

      <CreateTaskDialog
        open={open === "task"}
        onClose={close}
        users={users}
        taskTypes={taskTypes}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          toast({ title: "Task created" });
          close();
          navigate(`/tasks?id=${id}`);
        }}
      />

      <CreateContactDialog
        open={open === "contact"}
        onClose={close}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          toast({ title: "Contact created" });
          close();
          navigate(`/contacts?id=${id}`);
        }}
      />
    </>
  );
}

function EmailTagInput({
  label,
  value,
  onChange,
  testId,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  testId: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: contactResults = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "autocomplete", raw],
    queryFn: () => fetch(`/api/contacts?q=${encodeURIComponent(raw)}&limit=8`).then(r => r.json()),
    enabled: raw.length >= 2,
    staleTime: 10000,
  });

  const showDropdown = dropdownOpen && raw.length >= 2 && contactResults.length > 0;

  useEffect(() => { setHighlightIdx(0); }, [raw, contactResults.length]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addEmail(email: string) {
    if (!email) return;
    if (!value.includes(email)) onChange([...value, email]);
    setRaw("");
    setDropdownOpen(false);
  }

  function commit() {
    const email = raw.trim();
    if (!email) return;
    addEmail(email);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, contactResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const c = contactResults[highlightIdx];
        if (c?.primaryEmail) addEmail(c.primaryEmail);
        else commit();
        return;
      }
      if (e.key === "Escape") { setDropdownOpen(false); return; }
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && raw === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label>{label}</Label>
      <div className="relative">
        <div className="flex flex-wrap gap-1 min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          {value.map((email) => (
            <span key={email} className="flex items-center gap-0.5 bg-muted text-foreground rounded px-1.5 py-0.5 text-xs">
              {email}
              <button type="button" onClick={() => onChange(value.filter(e => e !== email))} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setDropdownOpen(true); }}
            onKeyDown={onKeyDown}
            onBlur={() => { setTimeout(() => { commit(); setDropdownOpen(false); }, 150); }}
            placeholder={value.length === 0 ? (placeholder ?? "Add email…") : ""}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
            data-testid={testId}
            autoComplete="off"
          />
        </div>
        {showDropdown && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden" data-testid={`${testId}-dropdown`}>
            {contactResults.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${i === highlightIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                onMouseDown={(e) => { e.preventDefault(); if (c.primaryEmail) addEmail(c.primaryEmail); }}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{c.displayName}</span>
                {c.primaryEmail && <span className="text-xs text-muted-foreground truncate">{c.primaryEmail}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComposeEmailDialog({
  open, onClose, mailboxes, onSent,
}: {
  open: boolean;
  onClose: () => void;
  mailboxes: Mailbox[];
  onSent: () => void;
}) {
  const [mailboxId, setMailboxId] = useState<string>("");
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const { toast } = useToast();

  const effectiveMailboxId = mailboxId || (mailboxes[0] ? String(mailboxes[0].id) : "");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/send", {
        mailboxId: Number(effectiveMailboxId),
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        body,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to send");
      }
    },
    onSuccess: () => {
      setTo([]); setCc([]); setBcc([]); setSubject(""); setBody(""); setMailboxId("");
      onSent();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {mailboxes.length > 1 && (
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={effectiveMailboxId} onValueChange={setMailboxId}>
                <SelectTrigger data-testid="select-email-from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.microsoftMailboxId ?? m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <EmailTagInput label="To" value={to} onChange={setTo} testId="input-email-to" placeholder="recipient@example.com" />
          <div className="flex gap-2 text-xs text-muted-foreground">
            {!showCc && (
              <button type="button" className="hover:underline" onClick={() => setShowCc(true)}>+ Cc</button>
            )}
            {!showBcc && (
              <button type="button" className="hover:underline" onClick={() => setShowBcc(true)}>+ Bcc</button>
            )}
          </div>
          {showCc && (
            <EmailTagInput label="Cc" value={cc} onChange={setCc} testId="input-email-cc" />
          )}
          {showBcc && (
            <EmailTagInput label="Bcc" value={bcc} onChange={setBcc} testId="input-email-bcc" />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              data-testid="input-email-subject"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={6}
              data-testid="textarea-email-body"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={to.length === 0 || !subject.trim() || !effectiveMailboxId || mutation.isPending}
            data-testid="button-send-email"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateIssueDialog({
  open, onClose, associations, issueTypes, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  associations: Association[];
  issueTypes: { id: number; value: string; label: string }[];
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [associationId, setAssociationId] = useState<string>("");
  const [issueType, setIssueType] = useState<string>("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { title, description: description || undefined, priority };
      if (associationId && associationId !== "__none__") body.associationId = parseInt(associationId);
      if (issueType && issueType !== "__none__") body.issueType = issueType;
      const res = await apiRequest("POST", "/api/issues", body);
      return res.json();
    },
    onSuccess: (data) => {
      setTitle(""); setDescription(""); setPriority("Normal"); setAssociationId(""); setIssueType("");
      onCreated(data.id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="issue-title">Title *</Label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              data-testid="input-issue-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-issue-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {issueTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={issueType} onValueChange={setIssueType}>
                  <SelectTrigger data-testid="select-issue-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {issueTypes.map((t) => <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {associations.length > 0 && (
            <div className="space-y-1.5">
              <Label>Association</Label>
              <Select value={associationId} onValueChange={setAssociationId}>
                <SelectTrigger data-testid="select-issue-association">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {associations.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              data-testid="textarea-issue-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || mutation.isPending}
            data-testid="button-create-issue-submit"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open, onClose, users, taskTypes, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  users: { id: number; name: string }[];
  taskTypes: { id: number; value: string; label: string }[];
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [taskType, setTaskType] = useState<string>("");
  const [dueDate, setDueDate] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { title, description: description || undefined, priority };
      if (assignedUserId && assignedUserId !== "__none__") body.assignedUserId = parseInt(assignedUserId);
      if (taskType && taskType !== "__none__") body.taskType = taskType;
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      const res = await apiRequest("POST", "/api/tasks", body);
      return res.json();
    },
    onSuccess: (data) => {
      setTitle(""); setDescription(""); setPriority("Normal"); setAssignedUserId(""); setTaskType(""); setDueDate("");
      onCreated(data.id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              data-testid="input-task-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {users.length > 0 && (
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                  <SelectTrigger data-testid="select-task-assignee">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {taskTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger data-testid="select-task-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {taskTypes.map((t) => <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due date</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-task-due-date"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              data-testid="textarea-task-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || mutation.isPending}
            data-testid="button-create-task-submit"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateContactDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [contactType, setContactType] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { displayName, contactType: (contactType && contactType !== "__none__") ? contactType : undefined };
      const res = await apiRequest("POST", "/api/contacts", body);
      const contact = await res.json();
      const tasks: Promise<void>[] = [];
      if (email.trim()) {
        tasks.push(apiRequest("POST", `/api/contacts/${contact.id}/emails`, { email: email.trim() }).then(() => {}));
      }
      if (phone.trim()) {
        tasks.push(apiRequest("POST", `/api/contacts/${contact.id}/phones`, { phoneNumber: phone.trim() }).then(() => {}));
      }
      await Promise.all(tasks);
      return contact;
    },
    onSuccess: (data) => {
      setDisplayName(""); setContactType(""); setEmail(""); setPhone("");
      onCreated(data.id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Display name *</Label>
            <Input
              id="contact-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Full name"
              data-testid="input-contact-display-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger data-testid="select-contact-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {CONTACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              data-testid="input-contact-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              data-testid="input-contact-phone"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!displayName.trim() || mutation.isPending}
            data-testid="button-create-contact-submit"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
