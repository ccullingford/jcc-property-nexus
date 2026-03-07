import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ImportWizardDialog } from "@/components/contact-import-dialog";
import {
  Users, Search, Plus, Phone, Mail, Link2, MessageSquare,
  CheckCircle2, Clock, X, ChevronRight, Upload, Filter,
  GitMerge, AlertTriangle, ChevronDown, ChevronUp, Briefcase,
  ArrowRight, MapPin, Building2, Pencil,
} from "lucide-react";
import type { ContactWithDetails, ContactTimelineItem, IssueWithDetails, TaskWithMeta } from "@shared/routes";
import { CONTACT_TYPES } from "@shared/routes";
import type { Association, Unit } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DuplicatePair {
  contact: ContactWithDetails & { threadCount: number; emailList: string[] };
  duplicate: ContactWithDetails & { threadCount: number; emailList: string[] };
  signal: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function contactTypeColor(type: string): "default" | "secondary" | "outline" {
  if (type === "Owner") return "default";
  if (type === "Tenant") return "secondary";
  return "outline";
}

function effectiveName(contact: { displayName: string; companyName?: string | null; useCompanyName?: boolean | null }): string {
  return (contact.useCompanyName && contact.companyName) ? contact.companyName : contact.displayName;
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





// ─── Timeline item ────────────────────────────────────────────────────────────
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
function CreateContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactType, setContactType] = useState("Other");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [associationId, setAssociationId] = useState<string>("none");
  const [unitId, setUnitId] = useState<string>("none");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [showAddress, setShowAddress] = useState(false);

  const { data: associations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()) });
  const { data: assocUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/associations", associationId, "units"],
    queryFn: () => fetch(`/api/associations/${associationId}/units`).then(r => r.json()),
    enabled: associationId !== "none",
  });

  function handleAssocChange(val: string) { setAssociationId(val); setUnitId("none"); }

  // Auto-populate displayName from first+last if not manually edited
  const lastAutoDisplayName = useRef("");
  const handleNamesChange = useCallback((f: string, l: string) => {
    const auto = `${f} ${l}`.trim();
    if (displayName === lastAutoDisplayName.current) {
      setDisplayName(auto);
      lastAutoDisplayName.current = auto;
    }
  }, [displayName]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact created" });
      onClose();
      setFirstName(""); setLastName(""); setDisplayName(""); setContactType("Other"); setPrimaryEmail(""); setPrimaryPhone(""); setNotes(""); setAssociationId("none"); setUnitId("none");
      setAddress1(""); setAddress2(""); setCity(""); setState(""); setZip(""); setShowAddress(false);
      lastAutoDisplayName.current = "";
    },
    onError: (e: Error) => toast({ title: "Failed to create contact", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    mutation.mutate({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      displayName: displayName.trim(),
      contactType,
      primaryEmail: primaryEmail.trim() || null,
      primaryPhone: primaryPhone.trim() || null,
      notes: notes.trim() || null,
      associationId: associationId !== "none" ? Number(associationId) : null,
      unitId: unitId !== "none" ? Number(unitId) : null,
      mailingAddress1: address1.trim() || null,
      mailingAddress2: address2.trim() || null,
      mailingCity: city.trim() || null,
      mailingState: state.trim() || null,
      mailingPostalCode: zip.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name</label>
              <Input value={firstName} onChange={e => { setFirstName(e.target.value); handleNamesChange(e.target.value, lastName); }} placeholder="Jane" data-testid="input-contact-firstname" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name</label>
              <Input value={lastName} onChange={e => { setLastName(e.target.value); handleNamesChange(firstName, e.target.value); }} placeholder="Smith" data-testid="input-contact-lastname" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Display name *</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jane Smith" data-testid="input-contact-name" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger className="h-9" data-testid="select-contact-type"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="jane@example.com" data-testid="input-contact-email" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="+1 (555) 000-0000" data-testid="input-contact-phone" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Association</label>
              <Select value={associationId} onValueChange={handleAssocChange}>
                <SelectTrigger className="h-9" data-testid="select-contact-association"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {associations.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
              <Select value={unitId} onValueChange={setUnitId} disabled={associationId === "none"}>
                <SelectTrigger className="h-9" data-testid="select-contact-unit"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {assocUnits.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.unitNumber}{u.building ? ` (${u.building})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button variant="ghost" size="sm" className="h-7 px-0 text-muted-foreground hover:text-foreground text-xs" onClick={() => setShowAddress(!showAddress)}>
              {showAddress ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              Mailing Address
            </Button>
            {showAddress && (
              <div className="space-y-2 mt-2 p-3 rounded-md bg-muted/30 border border-border">
                <Input value={address1} onChange={e => setAddress1(e.target.value)} placeholder="Address line 1" className="h-8 text-xs" />
                <Input value={address2} onChange={e => setAddress2(e.target.value)} placeholder="Address line 2" className="h-8 text-xs" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" className="h-8 text-xs col-span-1" />
                  <Input value={state} onChange={e => setState(e.target.value)} placeholder="State" className="h-8 text-xs" />
                  <Input value={zip} onChange={e => setZip(e.target.value)} placeholder="ZIP" className="h-8 text-xs" />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm resize-none" data-testid="input-contact-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-contact">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!displayName.trim() || mutation.isPending} data-testid="button-submit-contact">
            {mutation.isPending ? "Creating…" : "Create Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Phone / Email Dialogs ────────────────────────────────────────────────
function AddPhoneDialog({ contactId, open, onClose }: { contactId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("Mobile");
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/contacts/${contactId}/phones`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] }); queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }); toast({ title: "Phone added" }); onClose(); setPhone(""); setLabel("Mobile"); },
    onError: (e: Error) => toast({ title: "Failed to add phone", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Phone Number</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Number</label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" data-testid="input-add-phone" autoFocus /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label><Select value={label} onValueChange={setLabel}><SelectTrigger data-testid="select-phone-label"><SelectValue /></SelectTrigger><SelectContent>{["Mobile", "Office", "Home", "Dispatch", "Other"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate({ phoneNumber: phone.trim(), label, isPrimary: false })} disabled={!phone.trim() || mutation.isPending} data-testid="button-add-phone-submit">{mutation.isPending ? "Adding…" : "Add Phone"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEmailDialog({ contactId, open, onClose }: { contactId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/contacts/${contactId}/emails`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] }); queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }); toast({ title: "Email added" }); onClose(); setEmail(""); },
    onError: (e: Error) => toast({ title: "Failed to add email", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Email Address</DialogTitle></DialogHeader>
        <div className="py-1"><label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" data-testid="input-add-email" autoFocus /></div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate({ email: email.trim(), isPrimary: false })} disabled={!email.trim() || mutation.isPending} data-testid="button-add-email-submit">{mutation.isPending ? "Adding…" : "Add Email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Wizard ────────────────────────────────────────────────────────────




// ─── Duplicates Dialog ────────────────────────────────────────────────────────
function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: pairs, isLoading, refetch } = useQuery<DuplicatePair[]>({
    queryKey: ["/api/contacts/duplicates"],
    queryFn: async () => {
      const res = await fetch("/api/contacts/duplicates", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    enabled: open,
  });

  const mergeMutation = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      apiRequest("POST", "/api/contacts/merge", { sourceId, targetId }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      refetch();
      toast({ title: "Contacts merged successfully" });
    },
    onError: (e: Error) => toast({ title: "Merge failed", description: e.message, variant: "destructive" }),
  });

  const visiblePairs = (pairs ?? []).filter(p => !dismissed.has(`${p.contact.id}-${p.duplicate.id}`));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4" />
            Duplicate Contacts
            {pairs && pairs.length > 0 && <Badge variant="secondary">{pairs.length} found</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : visiblePairs.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No duplicates found</p>
            <p className="text-xs text-muted-foreground mt-1">All contacts have unique email addresses.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {visiblePairs.map(pair => (
              <div key={`${pair.contact.id}-${pair.duplicate.id}`} className="rounded-lg border border-border p-4 space-y-3" data-testid={`duplicate-pair-${pair.contact.id}-${pair.duplicate.id}`}>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {pair.signal}
                </p>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                  <ContactCard contact={pair.contact} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-3 shrink-0" />
                  <ContactCard contact={pair.duplicate} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => mergeMutation.mutate({ sourceId: pair.duplicate.id, targetId: pair.contact.id })} disabled={mergeMutation.isPending} data-testid={`button-keep-left-${pair.contact.id}`}>
                    Keep left, delete right
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => mergeMutation.mutate({ sourceId: pair.contact.id, targetId: pair.duplicate.id })} disabled={mergeMutation.isPending} data-testid={`button-keep-right-${pair.contact.id}`}>
                    Keep right, delete left
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setDismissed(prev => new Set([...Array.from(prev), `${pair.contact.id}-${pair.duplicate.id}`]))} data-testid={`button-skip-${pair.contact.id}`}>
                    Skip
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactCard({ contact }: { contact: DuplicatePair["contact"] }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 min-w-0">
      <p className="text-sm font-medium text-foreground truncate">{effectiveName(contact)}</p>
      <Badge variant={contactTypeColor(contact.contactType)} className="text-xs h-4 px-1">{contact.contactType}</Badge>
      {contact.emailList.map((e, i) => <p key={i} className="text-xs text-muted-foreground truncate">{e}</p>)}
      {contact.primaryPhone && <p className="text-xs text-muted-foreground">{contact.primaryPhone}</p>}
      <p className="text-xs text-muted-foreground/70">{contact.threadCount} thread{contact.threadCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ─── Contact Association Section ──────────────────────────────────────────────
function ContactAssociationSection({
  associationId, unitId, onUpdate,
}: { associationId: number | null; unitId: number | null; onUpdate: (aid: number | null, uid: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [selAssocId, setSelAssocId] = useState<string>(associationId?.toString() ?? "none");
  const [selUnitId, setSelUnitId] = useState<string>(unitId?.toString() ?? "none");

  const { data: associations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()), enabled: editing });
  const { data: assocDetail } = useQuery<{ name: string }>({
    queryKey: ["/api/associations", associationId],
    queryFn: () => fetch(`/api/associations/${associationId}`).then(r => r.json()),
    enabled: !!associationId && !editing,
  });
  const { data: assocUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/associations", selAssocId, "units"],
    queryFn: () => fetch(`/api/associations/${selAssocId}/units`).then(r => r.json()),
    enabled: editing && selAssocId !== "none",
  });
  const { data: unitDetail } = useQuery<{ unitNumber: string; building: string | null }>({
    queryKey: ["/api/units", unitId],
    queryFn: () => fetch(`/api/units/${unitId}`).then(r => r.json()),
    enabled: !!unitId && !editing,
  });

  function handleAssocChange(val: string) { setSelAssocId(val); setSelUnitId("none"); }

  function handleSave() {
    onUpdate(selAssocId !== "none" ? Number(selAssocId) : null, selUnitId !== "none" ? Number(selUnitId) : null);
    setEditing(false);
  }

  function handleEdit() {
    setSelAssocId(associationId?.toString() ?? "none");
    setSelUnitId(unitId?.toString() ?? "none");
    setEditing(true);
  }

  return (
    <section data-testid="contact-association-section">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />Association
        </p>
        {!editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleEdit} data-testid="button-edit-association"><Pencil className="h-3 w-3 mr-0.5" />Edit</Button>}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Select value={selAssocId} onValueChange={handleAssocChange}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-detail-association"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {associations.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selUnitId} onValueChange={setSelUnitId} disabled={selAssocId === "none"}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-detail-unit"><SelectValue placeholder="No unit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No unit</SelectItem>
              {assocUnits.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.unitNumber}{u.building ? ` (${u.building})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} data-testid="button-save-association">Save</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="text-sm space-y-1" data-testid="association-display">
          {associationId && assocDetail ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span data-testid="text-assoc-display">{assocDetail.name}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="text-no-association">No association linked.</p>
          )}
          {unitId && unitDetail && (
            <div className="flex items-center gap-1.5 pl-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs" data-testid="text-unit-display">Unit {unitDetail.unitNumber}{unitDetail.building ? ` · ${unitDetail.building}` : ""}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Contact Detail Panel ─────────────────────────────────────────────────────
function ContactDetail({ contactId }: { contactId: number }) {
  const { toast } = useToast();
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editUseCompanyName, setEditUseCompanyName] = useState(false);
  const [editType, setEditType] = useState("");
  const [showIssues, setShowIssues] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [editingAddress, setEditingAddress] = useState(false);
  const [editAddr1, setEditAddr1] = useState("");
  const [editAddr2, setEditAddr2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editZip, setEditZip] = useState("");

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

  const { data: linkedIssues } = useQuery<IssueWithDetails[]>({
    queryKey: ["/api/issues", { contactId }],
    queryFn: async () => {
      const res = await fetch(`/api/issues?contactId=${contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    enabled: !!contactId,
  });

  const { data: linkedTasks } = useQuery<TaskWithMeta[]>({
    queryKey: ["/api/tasks", { contactId }],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?contactId=${contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    enabled: !!contactId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", `/api/contacts/${contactId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact updated" });
      setEditingName(false);
      setEditingAddress(false);
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

  const lastAutoDisplayName = { current: "" };
  const handleEditNamesChange = (f: string, l: string) => {
    const auto = `${f} ${l}`.trim();
    if (editDisplayName === lastAutoDisplayName.current) {
      setEditDisplayName(auto);
      lastAutoDisplayName.current = auto;
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
        {editingName ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input value={editFirstName} onChange={e => { setEditFirstName(e.target.value); handleEditNamesChange(e.target.value, editLastName); }} placeholder="First Name" className="h-8 text-sm" />
              <Input value={editLastName} onChange={e => { setEditLastName(e.target.value); handleEditNamesChange(editFirstName, e.target.value); }} placeholder="Last Name" className="h-8 text-sm" />
            </div>
            <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="text-lg font-semibold h-10" data-testid="input-edit-name" autoFocus />
            <div className="space-y-1.5">
              <Input value={editCompanyName} onChange={e => setEditCompanyName(e.target.value)} placeholder="Company name (optional)" className="h-8 text-sm" data-testid="input-edit-company-name" />
              {editCompanyName.trim() && (
                <div className="flex items-center gap-2 px-1">
                  <Switch id="use-company-name" checked={editUseCompanyName} onCheckedChange={setEditUseCompanyName} data-testid="switch-use-company-name" />
                  <Label htmlFor="use-company-name" className="text-xs text-muted-foreground cursor-pointer">Show company name as primary</Label>
                </div>
              )}
            </div>
            <Select value={editType} onValueChange={setEditType}>
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-edit-type"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => updateMutation.mutate({ firstName: editFirstName.trim() || null, lastName: editLastName.trim() || null, displayName: editDisplayName.trim(), companyName: editCompanyName.trim() || null, useCompanyName: editUseCompanyName && !!editCompanyName.trim(), contactType: editType })} disabled={!editDisplayName.trim() || updateMutation.isPending} data-testid="button-save-name">{updateMutation.isPending ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingName(false)} data-testid="button-cancel-edit">Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <button className="group flex items-start gap-2 hover:opacity-80 transition-opacity text-left" onClick={() => { setEditFirstName(contact.firstName || ""); setEditLastName(contact.lastName || ""); setEditDisplayName(contact.displayName); setEditCompanyName(contact.companyName || ""); setEditUseCompanyName(contact.useCompanyName ?? false); setEditType(contact.contactType); setEditingName(true); lastAutoDisplayName.current = contact.displayName; }} data-testid="button-edit-contact-name">
              <div>
                <h2 className="text-xl font-semibold text-foreground" data-testid="text-contact-name">{effectiveName(contact)}</h2>
                {contact.useCompanyName && contact.companyName
                  ? <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Building2 className="h-3 w-3" />{contact.displayName}</p>
                  : (contact.companyName && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Building2 className="h-3 w-3" />{contact.companyName}</p>)
                }
                {!contact.useCompanyName && (contact.firstName || contact.lastName) && <p className="text-xs text-muted-foreground mt-0.5">{contact.firstName} {contact.lastName}</p>}
              </div>
            </button>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant={contactTypeColor(contact.contactType)} className="text-xs" data-testid="badge-contact-type">{contact.contactType}</Badge>
              {contact.threadCount > 0 && <span className="text-xs text-muted-foreground" data-testid="text-thread-count">{contact.threadCount} thread{contact.threadCount !== 1 ? "s" : ""}</span>}
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4 space-y-6">

          {/* Email addresses */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email</p>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setAddEmailOpen(true)} data-testid="button-add-email"><Plus className="h-3 w-3 mr-0.5" />Add</Button>
            </div>
            <div className="space-y-1" data-testid="contact-emails-list">
              {contact.primaryEmail && !contact.emails.some(e => e.email === contact.primaryEmail) && (
                <div className="flex items-center gap-2 py-1" data-testid="primary-email-display">
                  <span className="text-sm text-foreground">{contact.primaryEmail}</span>
                  <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>
                </div>
              )}
              {contact.emails.length === 0 && !contact.primaryEmail && <p className="text-xs text-muted-foreground" data-testid="no-emails">No email addresses.</p>}
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</p>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setAddPhoneOpen(true)} data-testid="button-add-phone"><Plus className="h-3 w-3 mr-0.5" />Add</Button>
            </div>
            <div className="space-y-1" data-testid="contact-phones-list">
              {contact.primaryPhone && !contact.phones.some(p => p.phoneNumber === contact.primaryPhone) && (
                <div className="flex items-center gap-2 py-1" data-testid="primary-phone-display">
                  <span className="text-sm text-foreground">{contact.primaryPhone}</span>
                  <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>
                </div>
              )}
              {contact.phones.length === 0 && !contact.primaryPhone && <p className="text-xs text-muted-foreground" data-testid="no-phones">No phone numbers.</p>}
              {contact.phones.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1" data-testid={`phone-${p.id}`}>
                  <span className="text-sm text-foreground">{p.phoneNumber}</span>
                  {p.label && <span className="text-xs text-muted-foreground">{p.label}</span>}
                  {p.isPrimary && <Badge variant="secondary" className="text-xs h-4 px-1">Primary</Badge>}
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Mailing Address Section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Mailing Address</p>
              {!editingAddress && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
                  setEditAddr1(contact.mailingAddress1 || "");
                  setEditAddr2(contact.mailingAddress2 || "");
                  setEditCity(contact.mailingCity || "");
                  setEditState(contact.mailingState || "");
                  setEditZip(contact.mailingPostalCode || "");
                  setEditingAddress(true);
                }} data-testid="button-edit-address"><Pencil className="h-3 w-3 mr-0.5" />Edit</Button>
              )}
            </div>
            {editingAddress ? (
              <div className="space-y-2 mt-2 p-3 rounded-md bg-muted/30 border border-border">
                <Input value={editAddr1} onChange={e => setEditAddr1(e.target.value)} placeholder="Address line 1" className="h-8 text-xs" />
                <Input value={editAddr2} onChange={e => setEditAddr2(e.target.value)} placeholder="Address line 2" className="h-8 text-xs" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City" className="h-8 text-xs col-span-1" />
                  <Input value={editState} onChange={e => setEditState(e.target.value)} placeholder="State" className="h-8 text-xs" />
                  <Input value={editZip} onChange={e => setEditZip(e.target.value)} placeholder="ZIP" className="h-8 text-xs" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => updateMutation.mutate({ mailingAddress1: editAddr1.trim() || null, mailingAddress2: editAddr2.trim() || null, mailingCity: editCity.trim() || null, mailingState: editState.trim() || null, mailingPostalCode: editZip.trim() || null })}>Save</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingAddress(false)}>Cancel</Button>
                </div>
              </div>
            ) : contact.mailingAddress1 || contact.mailingCity ? (
              <div className="text-sm space-y-0.5 pl-5">
                {contact.mailingAddress1 && <p>{contact.mailingAddress1}</p>}
                {contact.mailingAddress2 && <p>{contact.mailingAddress2}</p>}
                <p>{[contact.mailingCity, contact.mailingState, contact.mailingPostalCode].filter(Boolean).join(", ")}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground pl-5">No mailing address.</p>
            )}
          </section>

          <Separator />

          {contact.notes && (
            <>
              <section>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="contact-notes">{contact.notes}</p>
              </section>
              <Separator />
            </>
          )}

          {/* Association & Unit */}
          <ContactAssociationSection
            associationId={contact.associationId ?? null}
            unitId={contact.unitId ?? null}
            onUpdate={(aid, uid) => updateMutation.mutate({ associationId: aid, unitId: uid })}
          />

          {/* Linked Issues */}
          {linkedIssues && linkedIssues.length > 0 && (
            <>
              <Separator />
              <section>
                <button className="flex items-center justify-between w-full mb-2 group" onClick={() => setShowIssues(v => !v)} data-testid="section-issues-toggle">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Issues
                    <Badge variant="secondary" className="h-4 px-1.5 text-xs">{linkedIssues.length}</Badge>
                  </p>
                  {showIssues ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {showIssues && (
                  <div className="space-y-1.5" data-testid="contact-issues-list">
                    {linkedIssues.map(issue => (
                      <div key={issue.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors" data-testid={`issue-row-${issue.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{issue.title}</p>
                        </div>
                        <Badge variant={issue.status === "Open" ? "default" : issue.status === "Closed" || issue.status === "Resolved" ? "secondary" : "outline"} className="text-xs h-4 px-1 shrink-0">{issue.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* Linked Tasks */}
          {linkedTasks && linkedTasks.length > 0 && (
            <>
              <Separator />
              <section>
                <button className="flex items-center justify-between w-full mb-2 group" onClick={() => setShowTasks(v => !v)} data-testid="section-tasks-toggle">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    Tasks
                    <Badge variant="secondary" className="h-4 px-1.5 text-xs">{linkedTasks.length}</Badge>
                  </p>
                  {showTasks ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {showTasks && (
                  <div className="space-y-1.5" data-testid="contact-tasks-list">
                    {linkedTasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors" data-testid={`task-row-${task.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                          {task.dueDate && <p className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</p>}
                        </div>
                        <Badge variant={task.status === "Completed" ? "secondary" : task.status === "Open" ? "default" : "outline"} className="text-xs h-4 px-1 shrink-0">{task.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <Separator />

          {/* Activity Timeline */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Activity Timeline
              {timeline && timeline.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-xs">{timeline.length}</Badge>}
            </p>
            {loadingTimeline ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded" />
                <Skeleton className="h-14 w-full rounded" />
              </div>
            ) : !timeline || timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4" data-testid="timeline-empty">No activity linked to this contact yet.</p>
            ) : (
              <div data-testid="contact-timeline">{timeline.map(item => <TimelineItemRow key={item.id} item={item} />)}</div>
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
  const [importOpen, setImportOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterHasThreads, setFilterHasThreads] = useState(false);
  const [filterHasOpenIssues, setFilterHasOpenIssues] = useState(false);
  const [filterAssocId, setFilterAssocId] = useState<string>("all");

  const { data: filterAssociations = [] } = useQuery<Association[]>({ queryKey: ["/api/associations"], queryFn: () => fetch("/api/associations").then(r => r.json()), enabled: filtersOpen });

  const activeFilterCount = [filterType !== "all", filterHasThreads, filterHasOpenIssues, filterAssocId !== "all"].filter(Boolean).length;

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (filterType !== "all") params.set("contactType", filterType);
    if (filterHasThreads) params.set("hasThreads", "true");
    if (filterHasOpenIssues) params.set("hasOpenIssues", "true");
    if (filterAssocId !== "all") params.set("associationId", filterAssocId);
    return `/api/contacts?${params.toString()}`;
  };

  const { data: contacts, isLoading } = useQuery<ContactWithDetails[]>({
    queryKey: ["/api/contacts", searchQuery, filterType, filterHasThreads, filterHasOpenIssues, filterAssocId],
    queryFn: async () => {
      const res = await fetch(buildUrl(), { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const { data: duplicates } = useQuery<any[]>({
    queryKey: ["/api/contacts/duplicates"],
    queryFn: async () => {
      const res = await fetch("/api/contacts/duplicates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Left panel ─── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-border bg-card">

        {/* Toolbar */}
        <div className="shrink-0 h-14 flex items-center gap-2 px-4 border-b border-border">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <h1 className="text-sm font-semibold flex-1">Contacts</h1>
          {contacts && <Badge variant="secondary" className="text-xs" data-testid="contacts-count">{contacts.length}</Badge>}
          {duplicates && duplicates.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setDuplicatesOpen(true)} data-testid="button-show-duplicates">
              <GitMerge className="h-3 w-3" />{duplicates.length}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setImportOpen(true)} data-testid="button-import-contacts">
            <Upload className="h-3 w-3" />Import
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setCreateOpen(true)} data-testid="button-new-contact">
            <Plus className="h-3 w-3 mr-0.5" />New
          </Button>
        </div>

        {/* Search + filter toggle */}
        <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search name, email, phone…" className="pl-8 h-8 text-sm" data-testid="input-contact-search" />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchQuery("")} data-testid="button-clear-search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" variant={filtersOpen || activeFilterCount > 0 ? "default" : "outline"} className="h-8 px-2 shrink-0 gap-1" onClick={() => setFiltersOpen(v => !v)} data-testid="button-toggle-contact-filters">
            <Filter className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
          </Button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="shrink-0 px-3 py-2.5 border-b border-border bg-muted/20 space-y-3" data-testid="contact-filter-panel">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contact type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-7 text-xs" data-testid="filter-contact-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-foreground cursor-pointer" htmlFor="filter-has-threads">Has linked threads</label>
              <Switch id="filter-has-threads" checked={filterHasThreads} onCheckedChange={setFilterHasThreads} data-testid="filter-has-threads" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-foreground cursor-pointer" htmlFor="filter-has-issues">Has open issues</label>
              <Switch id="filter-has-issues" checked={filterHasOpenIssues} onCheckedChange={setFilterHasOpenIssues} data-testid="filter-has-open-issues" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Association</label>
              <Select value={filterAssocId} onValueChange={setFilterAssocId}>
                <SelectTrigger className="h-7 text-xs" data-testid="filter-association"><SelectValue placeholder="All associations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All associations</SelectItem>
                  {filterAssociations.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => { setFilterType("all"); setFilterHasThreads(false); setFilterHasOpenIssues(false); setFilterAssocId("all"); }} data-testid="button-clear-contact-filters">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-44" /></div>
                </div>
              ))}
            </div>
          ) : !contacts || contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid="contacts-empty">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{searchQuery || activeFilterCount > 0 ? "No contacts match your filters." : "No contacts yet."}</p>
              {!searchQuery && activeFilterCount === 0 && (
                <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={() => setCreateOpen(true)} data-testid="button-create-first-contact">
                  <Plus className="h-3 w-3 mr-1" />Add Contact
                </Button>
              )}
            </div>
          ) : (
            <div className="py-1" data-testid="contacts-list">
              {contacts.map(c => (
                <button key={c.id} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/30 ${selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`} onClick={() => setSelectedId(c.id)} data-testid={`contact-row-${c.id}`}>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">{effectiveName(c)?.[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate" data-testid={`contact-name-${c.id}`}>{effectiveName(c)}</span>
                      <Badge variant={contactTypeColor(c.contactType)} className="text-xs h-4 px-1.5 shrink-0">{c.contactType}</Badge>
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

      {/* ─── Right panel: detail ─── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background" data-testid="contact-detail-panel">
        {selectedId ? (
          <ContactDetail contactId={selectedId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8" data-testid="contact-detail-empty">
            <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-sm text-muted-foreground">Select a contact to view details</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Emails, phones, issues, tasks, and activity timeline will appear here</p>
          </div>
        )}
      </div>

      <CreateContactDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportWizardDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <DuplicatesDialog open={duplicatesOpen} onClose={() => setDuplicatesOpen(false)} />
    </div>
  );
}
