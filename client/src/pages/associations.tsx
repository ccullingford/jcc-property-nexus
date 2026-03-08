import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Search, Pencil, MapPin, Users, AlertCircle, Hash, X, ChevronDown, ChevronRight, ClipboardList, CheckCircle2, User } from "lucide-react";
import type { Association, Unit, Mailbox, Issue, Task, Contact, ContactUnit } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Link } from "wouter";

type AssociationWithStats = Association & {
  unitCount: number;
  contactCount: number;
  openIssueCount: number;
};

type UnitWithAssociation = Unit & { associationName: string | null };

type ContactWithRole = Contact & { role: string };

// ─── People Section ──────────────────────────────────────────────────────────

function PeopleSection({ unitId }: { unitId: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: contacts = [], isLoading } = useQuery<ContactWithRole[]>({
    queryKey: ["/api/units", unitId, "contacts"],
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            People ({contacts.length})
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No people linked to this unit.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map(contact => (
              <Link key={contact.id} href={`/contacts?id=${contact.id}`}>
                <div className="p-3 border rounded-md hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`row-unit-contact-${contact.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none mb-1 truncate" data-testid={`text-unit-contact-name-${contact.id}`}>
                        {contact.displayName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="px-1 py-0 h-4 text-[10px]" data-testid={`badge-unit-contact-role-${contact.id}`}>
                          {contact.role}
                        </Badge>
                        <span data-testid={`text-unit-contact-type-${contact.id}`}>{contact.contactType}</span>
                      </div>
                    </div>
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Association Form Dialog ───────────────────────────────────────────────────

interface AssocFormProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Association>;
  onSaved: () => void;
}

function AssociationFormDialog({ open, onClose, initial, onSaved }: AssocFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [mailboxId, setMailboxId] = useState<string>(initial?.mailboxId?.toString() ?? "none");
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCode(initial?.code ?? "");
      setMailboxId(initial?.mailboxId?.toString() ?? "none");
      setAddressLine1(initial?.addressLine1 ?? "");
      setCity(initial?.city ?? "");
      setState(initial?.state ?? "");
      setPostalCode(initial?.postalCode ?? "");
      setNotes(initial?.notes ?? "");
      setIsActive(initial?.isActive ?? true);
    }
  }, [open, initial]);

  const { data: mailboxes = [] } = useQuery<Mailbox[]>({ queryKey: ["/api/mailboxes"] });

  const createMut = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/associations", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/associations"] }); onSaved(); onClose(); toast({ title: "Association created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: object) => apiRequest("PATCH", `/api/associations/${initial?.id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/associations"] }); queryClient.invalidateQueries({ queryKey: ["/api/associations", initial?.id] }); onSaved(); onClose(); toast({ title: "Association updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function handleSubmit() {
    if (!name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      mailboxId: mailboxId && mailboxId !== "none" ? Number(mailboxId) : null,
      addressLine1: addressLine1.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      postalCode: postalCode.trim() || null,
      notes: notes.trim() || null,
      isActive,
    };
    if (initial?.id) updateMut.mutate(payload);
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Association" : "New Association"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input data-testid="input-assoc-name" value={name} onChange={e => setName(e.target.value)} placeholder="Arlyn Circle Condominiums" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input data-testid="input-assoc-code" value={code} onChange={e => setCode(e.target.value)} placeholder="ARC" />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Mailbox</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger data-testid="select-assoc-mailbox">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {mailboxes.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Street Address</Label>
            <Input data-testid="input-assoc-address" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label>City</Label>
              <Input data-testid="input-assoc-city" value={city} onChange={e => setCity(e.target.value)} placeholder="Charlotte" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input data-testid="input-assoc-state" value={state} onChange={e => setState(e.target.value)} placeholder="NC" />
            </div>
            <div className="space-y-1.5">
              <Label>Zip</Label>
              <Input data-testid="input-assoc-zip" value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="28202" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea data-testid="input-assoc-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="assoc-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-assoc-active" />
            <Label htmlFor="assoc-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button data-testid="button-save-assoc" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : initial?.id ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unit Form Dialog ──────────────────────────────────────────────────────────

interface UnitFormProps {
  open: boolean;
  onClose: () => void;
  associationId: number;
  initial?: Partial<Unit>;
  onSaved: () => void;
}

function UnitFormDialog({ open, onClose, associationId, initial, onSaved }: UnitFormProps) {
  const { toast } = useToast();
  const [unitNumber, setUnitNumber] = useState(initial?.unitNumber ?? "");
  const [building, setBuilding] = useState(initial?.building ?? "");
  const [streetAddress, setStreetAddress] = useState(initial?.streetAddress ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  useEffect(() => {
    if (open) {
      setUnitNumber(initial?.unitNumber ?? "");
      setBuilding(initial?.building ?? "");
      setStreetAddress(initial?.streetAddress ?? "");
      setNotes(initial?.notes ?? "");
      setIsActive(initial?.isActive ?? true);
    }
  }, [open, initial]);

  const createMut = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/units", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/associations", associationId, "units"] }); queryClient.invalidateQueries({ queryKey: ["/api/associations"] }); onSaved(); onClose(); toast({ title: "Unit created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: object) => apiRequest("PATCH", `/api/units/${initial?.id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/associations", associationId, "units"] }); onSaved(); onClose(); toast({ title: "Unit updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function handleSubmit() {
    if (!unitNumber.trim()) return toast({ title: "Unit number is required", variant: "destructive" });
    const payload = {
      associationId,
      unitNumber: unitNumber.trim(),
      building: building.trim() || null,
      streetAddress: streetAddress.trim() || null,
      notes: notes.trim() || null,
      isActive,
    };
    if (initial?.id) updateMut.mutate(payload);
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Unit" : "Add Unit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Unit Number *</Label>
            <Input data-testid="input-unit-number" value={unitNumber} onChange={e => setUnitNumber(e.target.value)} placeholder="101" />
          </div>
          <div className="space-y-1.5">
            <Label>Building</Label>
            <Input data-testid="input-unit-building" value={building} onChange={e => setBuilding(e.target.value)} placeholder="Building A" />
          </div>
          <div className="space-y-1.5">
            <Label>Street Address</Label>
            <Input data-testid="input-unit-address" value={streetAddress} onChange={e => setStreetAddress(e.target.value)} placeholder="123 Main St, Unit 101" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea data-testid="input-unit-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="unit-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-unit-active" />
            <Label htmlFor="unit-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button data-testid="button-save-unit" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : initial?.id ? "Save" : "Add Unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issues & Tasks Sections ──────────────────────────────────────────────────

function IssuesSection({ associationId, unitId }: { associationId?: number, unitId?: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: issues = [], isLoading } = useQuery<Issue[]>({
    queryKey: ["/api/issues", { associationId, unitId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (associationId) params.set("associationId", associationId.toString());
      if (unitId) params.set("unitId", unitId.toString());
      return fetch(`/api/issues?${params}`).then(r => r.json());
    }
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Issues ({issues.length})
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : issues.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No issues found.</p>
        ) : (
          <div className="space-y-2">
            {issues.map(issue => (
              <div key={issue.id} className="p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-none mb-1 truncate">{issue.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="px-1 py-0 h-4 text-[10px]">{issue.status}</Badge>
                      <span>{format(new Date(issue.createdAt), "MMM d")}</span>
                    </div>
                  </div>
                  <AlertCircle className={`h-4 w-4 shrink-0 ${issue.priority === 'High' ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TasksSection({ associationId, unitId }: { associationId?: number, unitId?: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { associationId, unitId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (associationId) params.set("associationId", associationId.toString());
      if (unitId) params.set("unitId", unitId.toString());
      return fetch(`/api/tasks?${params}`).then(r => r.json());
    }
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Tasks ({tasks.length})
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No tasks found.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} className="p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-none mb-1 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className={`h-3 w-3 ${task.status === 'Completed' ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <span>{task.status}</span>
                      {task.dueDate && (
                        <>
                          <span>·</span>
                          <span className={new Date(task.dueDate) < new Date() && task.status !== 'Completed' ? 'text-destructive font-medium' : ''}>
                            Due {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Association Detail Panel ──────────────────────────────────────────────────

interface DetailPanelProps {
  associationId: number;
  onEdit: (a: Association) => void;
}

function AssociationDetailPanel({ associationId, onEdit }: DetailPanelProps) {
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const { data: assoc, isLoading } = useQuery<AssociationWithStats>({
    queryKey: ["/api/associations", associationId],
    queryFn: () => fetch(`/api/associations/${associationId}`).then(r => r.json()),
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: ["/api/associations", associationId, "units"],
    queryFn: () => fetch(`/api/associations/${associationId}/units`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (!assoc) return null;

  const addressParts = [assoc.addressLine1, assoc.city, assoc.state, assoc.postalCode].filter(Boolean);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold truncate" data-testid="text-assoc-name">{assoc.name}</h2>
              {assoc.code && <Badge variant="outline" className="text-xs font-mono shrink-0" data-testid="badge-assoc-code">{assoc.code}</Badge>}
              <Badge variant={assoc.isActive ? "default" : "secondary"} className="text-xs shrink-0" data-testid="badge-assoc-active">
                {assoc.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            {addressParts.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1" data-testid="text-assoc-address">
                <MapPin className="h-3 w-3 shrink-0" />
                {addressParts.join(", ")}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => onEdit(assoc)} data-testid="button-edit-assoc">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
          <span data-testid="stat-unit-count"><strong className="text-foreground">{assoc.unitCount}</strong> units</span>
          <span data-testid="stat-contact-count"><strong className="text-foreground">{assoc.contactCount}</strong> contacts</span>
          <span data-testid="stat-open-issues"><strong className="text-foreground">{assoc.openIssueCount}</strong> open issues</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4 space-y-6">
          {/* Notes */}
          {assoc.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="text-assoc-notes">{assoc.notes}</p>
            </div>
          )}

          {/* Units section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Units</p>
              <Button size="sm" variant="outline" onClick={() => setShowAddUnit(true)} data-testid="button-add-unit">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Unit
              </Button>
            </div>

            {unitsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : units.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-units">No units yet. Click "Add Unit" to create one.</p>
            ) : (
              <div className="space-y-1">
                {units.map(unit => (
                  <div key={unit.id} className="group">
                    <div
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50"
                      data-testid={`row-unit-${unit.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium" data-testid={`text-unit-number-${unit.id}`}>{unit.unitNumber}</span>
                        {unit.building && <span className="text-xs text-muted-foreground">· {unit.building}</span>}
                        {unit.streetAddress && <span className="text-xs text-muted-foreground truncate">· {unit.streetAddress}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!unit.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => setEditingUnit(unit)} data-testid={`button-edit-unit-${unit.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Unit-specific People, Issues and Tasks */}
                    <div className="pl-6 pr-3 pb-3 pt-1 space-y-4">
                      <PeopleSection unitId={unit.id} />
                      <IssuesSection associationId={associationId} unitId={unit.id} />
                      <TasksSection associationId={associationId} unitId={unit.id} />
                    </div>
                    <Separator className="my-2" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Issues Section */}
          <IssuesSection associationId={associationId} />

          <Separator />

          {/* Tasks Section */}
          <TasksSection associationId={associationId} />
        </div>
      </ScrollArea>

      {/* Add unit dialog */}
      {showAddUnit && (
        <UnitFormDialog
          open={showAddUnit}
          onClose={() => setShowAddUnit(false)}
          associationId={associationId}
          onSaved={() => {}}
        />
      )}

      {/* Edit unit dialog */}
      {editingUnit && (
        <UnitFormDialog
          open={!!editingUnit}
          onClose={() => setEditingUnit(null)}
          associationId={associationId}
          initial={editingUnit}
          onSaved={() => setEditingUnit(null)}
        />
      )}
    </div>
  );
}

// ─── Main Associations Page ────────────────────────────────────────────────────

export function AssociationsPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAssoc, setEditingAssoc] = useState<Association | null>(null);

  const { data: associations = [], isLoading } = useQuery<AssociationWithStats[]>({
    queryKey: ["/api/associations", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      return fetch(`/api/associations?${params}`).then(r => r.json());
    },
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col bg-background">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-sm">Associations</h2>
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-new-association">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              data-testid="input-assoc-search"
              className="pl-8 h-8 text-sm"
              placeholder="Search associations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Association list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : associations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Building2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No associations found.</p>
              {!search && <p className="text-xs text-muted-foreground/60 mt-1">Click "New" to create one.</p>}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {associations.map(assoc => (
                <button
                  key={assoc.id}
                  onClick={() => setSelectedId(assoc.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${selectedId === assoc.id ? "bg-accent" : "hover:bg-muted/50"}`}
                  data-testid={`row-assoc-${assoc.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate" data-testid={`text-assoclist-name-${assoc.id}`}>{assoc.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {assoc.code && <Badge variant="outline" className="text-xs font-mono py-0">{assoc.code}</Badge>}
                      {!assoc.isActive && <Badge variant="secondary" className="text-xs py-0">Inactive</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{assoc.unitCount} units</span>
                    <span>{assoc.contactCount} contacts</span>
                    {assoc.openIssueCount > 0 && (
                      <span className="text-amber-600 font-medium">{assoc.openIssueCount} open issues</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 overflow-hidden">
        {selectedId ? (
          <AssociationDetailPanel
            associationId={selectedId}
            onEdit={a => setEditingAssoc(a)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-center p-12">
            <div>
              <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select an association to view details.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Or click "New" to create one.</p>
            </div>
          </div>
        )}
      </div>

      {/* Create association dialog */}
      {showCreate && (
        <AssociationFormDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={() => {}}
        />
      )}

      {/* Edit association dialog */}
      {editingAssoc && (
        <AssociationFormDialog
          open={!!editingAssoc}
          onClose={() => setEditingAssoc(null)}
          initial={editingAssoc}
          onSaved={() => setEditingAssoc(null)}
        />
      )}
    </div>
  );
}
