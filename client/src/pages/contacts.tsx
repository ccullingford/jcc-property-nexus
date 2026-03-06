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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, Plus, Phone, Mail, Link2, MessageSquare,
  CheckCircle2, Clock, X, ChevronRight,
} from "lucide-react";
import type { ContactWithDetails, ContactTimelineItem } from "@shared/routes";
import { CONTACT_TYPES } from "@shared/routes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contactTypeColor(type: string): "default" | "secondary" | "outline" {
  if (type === "Owner") return "default";
  if (type === "Tenant") return "secondary";
  return "outline";
}

function relativeTime(ts: string): string {
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

function TimelineItemRow({ item }: { item: ContactTimelineItem }) {
  const icon =
    item.type === "thread" ? <MessageSquare className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" /> :
    item.type === "task" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> :
    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  return (
    <div className="flex gap-2 py-2 border-b border-border/50 last:border-0" data-testid={`timeline-item-${item.id}`}>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{item.summary}</p>
        {item.detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>}
        <p className="text-xs text-muted-foreground/70 mt-0.5">{relativeTime(item.timestamp)}</p>
      </div>
    </div>
  );
}

// ─── Create Contact Dialog ────────────────────────────────────────────────────

interface CreateContactDialogProps {
  open: boolean;
  onClose: () => void;
}

function CreateContactDialog({ open, onClose }: CreateContactDialogProps) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [contactType, setContactType] = useState("Other");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact created" });
      onClose();
      setDisplayName(""); setContactType("Other"); setPrimaryEmail(""); setPrimaryPhone(""); setNotes("");
    },
    onError: (e: Error) => toast({ title: "Failed to create contact", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!displayName.trim()) return;
    mutation.mutate({
      displayName: displayName.trim(),
      contactType,
      primaryEmail: primaryEmail.trim() || null,
      primaryPhone: primaryPhone.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full name *</label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Jane Smith"
              data-testid="input-contact-name"
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger className="h-9" data-testid="select-contact-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                value={primaryEmail}
                onChange={e => setPrimaryEmail(e.target.value)}
                placeholder="jane@example.com"
                data-testid="input-contact-email"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input
                value={primaryPhone}
                onChange={e => setPrimaryPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                data-testid="input-contact-phone"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid="input-contact-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-contact">Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!displayName.trim() || mutation.isPending}
            data-testid="button-submit-contact"
          >
            {mutation.isPending ? "Creating…" : "Create Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Phone Dialog ─────────────────────────────────────────────────────────

function AddPhoneDialog({ contactId, open, onClose }: { contactId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("Mobile");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/contacts/${contactId}/phones`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Phone added" });
      onClose();
      setPhone(""); setLabel("Mobile");
    },
    onError: (e: Error) => toast({ title: "Failed to add phone", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Phone Number</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" data-testid="input-add-phone" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
            <Select value={label} onValueChange={setLabel}>
              <SelectTrigger data-testid="select-phone-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Mobile", "Office", "Home", "Dispatch", "Other"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate({ phoneNumber: phone.trim(), label, isPrimary: false })} disabled={!phone.trim() || mutation.isPending} data-testid="button-add-phone-submit">
            {mutation.isPending ? "Adding…" : "Add Phone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Email Dialog ─────────────────────────────────────────────────────────

function AddEmailDialog({ contactId, open, onClose }: { contactId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/contacts/${contactId}/emails`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Email added" });
      onClose();
      setEmail("");
    },
    onError: (e: Error) => toast({ title: "Failed to add email", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Email Address</DialogTitle></DialogHeader>
        <div className="py-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" data-testid="input-add-email" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate({ email: email.trim(), isPrimary: false })} disabled={!email.trim() || mutation.isPending} data-testid="button-add-email-submit">
            {mutation.isPending ? "Adding…" : "Add Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contact Detail Panel ─────────────────────────────────────────────────────

function ContactDetail({ contactId }: { contactId: number }) {
  const { toast } = useToast();
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");

  const { data: contact, isLoading } = useQuery<ContactWithDetails>({
    queryKey: ["/api/contacts", contactId],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery<ContactTimelineItem[]>({
    queryKey: ["/api/contacts", contactId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", `/api/contacts/${contactId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact updated" });
      setEditingName(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!contact) return null;

  function startEditName() {
    setEditName(contact!.displayName);
    setEditType(contact!.contactType);
    setEditingName(true);
  }

  function saveEdit() {
    updateMutation.mutate({ displayName: editName.trim(), contactType: editType });
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
        {editingName ? (
          <div className="space-y-2">
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="text-lg font-semibold"
              data-testid="input-edit-name"
              autoFocus
              onKeyDown={e => e.key === "Enter" && saveEdit()}
            />
            <Select value={editType} onValueChange={setEditType}>
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-edit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={!editName.trim() || updateMutation.isPending} data-testid="button-save-name">
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingName(false)} data-testid="button-cancel-edit">Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <button
              className="group flex items-start gap-2 hover:opacity-80 transition-opacity text-left"
              onClick={startEditName}
              data-testid="button-edit-contact-name"
            >
              <h2 className="text-xl font-semibold text-foreground" data-testid="text-contact-name">
                {contact.displayName}
              </h2>
            </button>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant={contactTypeColor(contact.contactType)} className="text-xs" data-testid="badge-contact-type">
                {contact.contactType}
              </Badge>
              {contact.threadCount > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="text-thread-count">
                  {contact.threadCount} thread{contact.threadCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4 space-y-6">

          {/* Email addresses */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setAddEmailOpen(true)}
                data-testid="button-add-email"
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1" data-testid="contact-emails-list">
              {contact.primaryEmail && !contact.emails.some(e => e.email === contact.primaryEmail) && (
                <div className="flex items-center gap-2 py-1" data-testid="primary-email-display">
                  <span className="text-sm text-foreground">{contact.primaryEmail}</span>
                  <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>
                </div>
              )}
              {contact.emails.length === 0 && !contact.primaryEmail && (
                <p className="text-xs text-muted-foreground" data-testid="no-emails">No email addresses.</p>
              )}
              {contact.emails.map(e => (
                <div key={e.id} className="flex items-center gap-2 py-1" data-testid={`email-${e.id}`}>
                  <span className="text-sm text-foreground">{e.email}</span>
                  {e.isPrimary && <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>}
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Phone numbers */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setAddPhoneOpen(true)}
                data-testid="button-add-phone"
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1" data-testid="contact-phones-list">
              {contact.primaryPhone && !contact.phones.some(p => p.phoneNumber === contact.primaryPhone) && (
                <div className="flex items-center gap-2 py-1" data-testid="primary-phone-display">
                  <span className="text-sm text-foreground">{contact.primaryPhone}</span>
                  <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>
                </div>
              )}
              {contact.phones.length === 0 && !contact.primaryPhone && (
                <p className="text-xs text-muted-foreground" data-testid="no-phones">No phone numbers.</p>
              )}
              {contact.phones.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1" data-testid={`phone-${p.id}`}>
                  <span className="text-sm text-foreground">{p.phoneNumber}</span>
                  {p.label && <span className="text-xs text-muted-foreground">{p.label}</span>}
                  {p.isPrimary && <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>}
                </div>
              ))}
            </div>
          </section>

          {contact.notes && (
            <>
              <Separator />
              <section>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="contact-notes">{contact.notes}</p>
              </section>
            </>
          )}

          <Separator />

          {/* Timeline */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Activity Timeline
              {timeline && timeline.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-xs">{timeline.length}</Badge>
              )}
            </p>
            {loadingTimeline ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded" />
                <Skeleton className="h-14 w-full rounded" />
                <Skeleton className="h-14 w-full rounded" />
              </div>
            ) : !timeline || timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4" data-testid="timeline-empty">
                No activity linked to this contact yet.
              </p>
            ) : (
              <div data-testid="contact-timeline">
                {timeline.map(item => <TimelineItemRow key={item.id} item={item} />)}
              </div>
            )}
          </section>

        </div>
      </ScrollArea>

      <AddPhoneDialog contactId={contactId} open={addPhoneOpen} onClose={() => setAddPhoneOpen(false)} />
      <AddEmailDialog contactId={contactId} open={addEmailOpen} onClose={() => setAddEmailOpen(false)} />
    </div>
  );
}

// ─── Contacts Page ─────────────────────────────────────────────────────────────

export function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: contacts, isLoading } = useQuery<ContactWithDetails[]>({
    queryKey: ["/api/contacts", { q: searchQuery }],
    queryFn: async () => {
      const url = searchQuery.trim()
        ? `/api/contacts?q=${encodeURIComponent(searchQuery.trim())}`
        : "/api/contacts";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Left panel: list ─────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-border bg-card">

        {/* Toolbar */}
        <div className="shrink-0 h-14 flex items-center gap-2 px-4 border-b border-border">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <h1 className="text-sm font-semibold flex-1">Contacts</h1>
          {contacts && (
            <Badge variant="secondary" className="text-xs" data-testid="contacts-count">
              {contacts.length}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-contact"
          >
            <Plus className="h-3 w-3 mr-0.5" />
            New
          </Button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, email, phone…"
              className="pl-8 h-8 text-sm"
              data-testid="input-contact-search"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : !contacts || contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid="contacts-empty">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No contacts match your search." : "No contacts yet."}
              </p>
              {!searchQuery && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 text-xs"
                  onClick={() => setCreateOpen(true)}
                  data-testid="button-create-first-contact"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Contact
                </Button>
              )}
            </div>
          ) : (
            <div className="py-1" data-testid="contacts-list">
              {contacts.map(c => (
                <button
                  key={c.id}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/30 ${selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                  data-testid={`contact-row-${c.id}`}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {c.displayName?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate" data-testid={`contact-name-${c.id}`}>
                        {c.displayName}
                      </span>
                      <Badge variant={contactTypeColor(c.contactType)} className="text-xs h-4 px-1.5 shrink-0">
                        {c.contactType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid={`contact-email-${c.id}`}>
                      {c.primaryEmail ?? c.emails[0]?.email ?? (c.primaryPhone ?? c.phones[0]?.phoneNumber ?? "No contact info")}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ─── Right panel: detail ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background" data-testid="contact-detail-panel">
        {selectedId ? (
          <ContactDetail contactId={selectedId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8" data-testid="contact-detail-empty">
            <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-sm text-muted-foreground">Select a contact to view details</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Emails, phones, and activity timeline will appear here</p>
          </div>
        )}
      </div>

      <CreateContactDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
