  import { ImportWizardDialog, parseCSV, autoDetectMapping } from "@/components/contact-import-dialog";
  import { CombinedImportDialog } from "@/components/combined-import-dialog";
  import { Upload, Building2, MapPin, AlertTriangle, Briefcase, Layers } from "lucide-react";
  import { useState, useRef } from "react";
import { useMailboxes, useCreateMailbox, useUpdateMailbox, useDeleteMailbox } from "@/hooks/use-mailboxes";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Mail, CheckCircle2, XCircle, Server, User, Clock, Tag, Settings2, Users } from "lucide-react";
import { z } from "zod";
import { api } from "@shared/routes";
import { formatDistanceToNow } from "date-fns";
import type { TypeLabel, Solution } from "@shared/schema";

type Mailbox = z.infer<typeof api.mailboxes.list.responses[200]>[0] & {
  syncHistoryDays?: number;
  includeSentMail?: boolean;
  autoSyncEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
  lastSyncedAt?: string | null;
  syncMode?: string;
};


  const ASSOCIATION_FIELDS = [
    { key: "name", label: "Association Name *" },
    { key: "code", label: "Code" },
    { key: "addressLine1", label: "Address Line 1" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "postalCode", label: "Postal Code" },
    { key: "notes", label: "Notes" },
  ];

  const UNIT_FIELDS = [
    { key: "associationName", label: "Association Name *" },
    { key: "unitNumber", label: "Unit Number *" },
    { key: "building", label: "Building" },
    { key: "streetAddress", label: "Street Address" },
    { key: "notes", label: "Notes" },
  ];
  
export function Admin() {
  const { data: mailboxes, isLoading } = useMailboxes();
  const [contactImportOpen, setContactImportOpen] = useState(false);
  const [combinedImportOpen, setCombinedImportOpen] = useState(false);
  const { data: currentUser } = useUser();
  const [, navigate] = useLocation();

  if (currentUser && currentUser.role !== "admin" && currentUser.role !== "manager") {
    navigate("/inbox");
    return null;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <Tabs defaultValue="mailboxes" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Administration</h1>
            <p className="text-muted-foreground mt-1">System-wide configuration and management.</p>
          </div>
          <TabsList>
            <TabsTrigger value="mailboxes" className="gap-2">
              <Mail className="h-4 w-4" />
              Mailboxes
            </TabsTrigger>
            <TabsTrigger value="types" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Issue/Task Types
            </TabsTrigger>
            <TabsTrigger value="imports" className="gap-2">
              <Upload className="h-4 w-4" />
              Imports
            </TabsTrigger>
            <TabsTrigger value="solutions" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Solution Library
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="mailboxes" className="space-y-6">
          <div className="flex justify-end">
            <MailboxDialog mode="create" />
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Mailbox Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sync Mode</TableHead>
                  <TableHead>Auto-Sync</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Loading mailboxes...
                    </TableCell>
                  </TableRow>
                ) : mailboxes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Mail className="h-8 w-8 mb-2 opacity-50" />
                        <p>No mailboxes configured</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (mailboxes as Mailbox[])
                    ?.filter(m => !(m.syncMode === "delegated" && m.ownerUserId))
                    .map((mailbox) => (
                    <TableRow key={mailbox.id} data-testid={`row-mailbox-${mailbox.id}`} className="group hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div>
                          <p className="font-medium">{mailbox.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{mailbox.microsoftMailboxId || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={mailbox.type === "shared" ? "default" : "secondary"} className="capitalize">
                          {mailbox.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SyncModeBadge mode={mailbox.syncMode ?? "application"} />
                      </TableCell>
                      <TableCell>
                        {mailbox.autoSyncEnabled !== false ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Every {mailbox.autoSyncIntervalMinutes ?? 5}m
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Off</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mailbox.lastSyncedAt ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(mailbox.lastSyncedAt), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mailbox.isDefault ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted/50" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MailboxDialog mode="edit" defaultValues={mailbox} />
                          <DeleteMailboxAlert mailbox={mailbox} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="types" className="space-y-8">
          <TypeLabelsSection category="issue_type" title="Issue Types" description="Categories for organizing and filtering issues." />
          <TypeLabelsSection category="task_type" title="Task Types" description="Categories for organizing and filtering tasks." />
        </TabsContent>
      
          <TabsContent value="imports" className="space-y-8">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Combined</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImportCard 
                  title="Combined Import"
                  description="Import associations, units, and contacts from one CSV file. Resolves relationships automatically."
                  icon={Layers}
                  onClick={() => setCombinedImportOpen(true)}
                  dataTestId="button-import-combined"
                  highlight
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Single-entity imports</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ImportCard 
                  title="Contacts" 
                  description="Import contacts only. Supports display name, email, phone, and more."
                  icon={Users}
                  onClick={() => setContactImportOpen(true)}
                  dataTestId="button-import-contacts"
                />
                <GenericImportWizardDialog 
                  title="Associations"
                  fields={ASSOCIATION_FIELDS}
                  endpoint="/api/associations/import"
                  icon={Building2}
                  trigger={(open) => (
                    <ImportCard 
                      title="Associations" 
                      description="Import associations only. Fields: name, code, address, city, etc."
                      icon={Building2}
                      onClick={open}
                      dataTestId="button-import-associations"
                    />
                  )}
                />
                <GenericImportWizardDialog 
                  title="Units"
                  fields={UNIT_FIELDS}
                  endpoint="/api/units/import"
                  icon={MapPin}
                  trigger={(open) => (
                    <ImportCard 
                      title="Units" 
                      description="Import units only. Links to associations by name."
                      icon={MapPin}
                      onClick={open}
                      dataTestId="button-import-units"
                    />
                  )}
                />
              </div>
            </div>
            <ImportWizardDialog open={contactImportOpen} onClose={() => setContactImportOpen(false)} />
            <CombinedImportDialog open={combinedImportOpen} onClose={() => setCombinedImportOpen(false)} />
          </TabsContent>

          <TabsContent value="solutions" className="space-y-4">
            <SolutionLibraryTab />
          </TabsContent>
        </Tabs>
    </div>
  );
}

// ─── Solution Library ─────────────────────────────────────────────────────────

function SolutionLibraryTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Solution | null>(null);

  const { data: solutions = [], isLoading } = useQuery<Solution[]>({
    queryKey: ["/api/solutions", search],
    queryFn: async () => {
      const url = search ? `/api/solutions?q=${encodeURIComponent(search)}` : "/api/solutions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/solutions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/solutions"] });
      toast({ title: "Solution deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(s: Solution) { setEditing(s); setDialogOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search solutions…"
            className="pl-8"
            data-testid="input-solution-search"
          />
        </div>
        <Button onClick={openCreate} className="gap-2" data-testid="button-create-solution">
          <Plus className="h-4 w-4" />
          New Solution
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Issue Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Reviewed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : solutions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center text-muted-foreground gap-1">
                    <Briefcase className="h-8 w-8 mb-1 opacity-40" />
                    <p>{search ? "No solutions match your search." : "No solutions yet. Create one to get started."}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              solutions.map(sol => (
                <TableRow key={sol.id} data-testid={`solution-row-${sol.id}`}>
                  <TableCell>
                    <p className="font-medium text-sm">{sol.title}</p>
                    {sol.summary && <p className="text-xs text-muted-foreground line-clamp-1">{sol.summary}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sol.issueType ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={sol.status === "approved" ? "default" : "secondary"} className="text-xs">
                      {sol.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sol.lastReviewedAt ? new Date(sol.lastReviewedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(sol)} data-testid={`button-edit-solution-${sol.id}`}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" data-testid={`button-delete-solution-${sol.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete solution?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove "{sol.title}" from the library.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(sol.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SolutionDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/solutions"] });
          setDialogOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function SolutionDialog({
  open, onClose, editing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Solution | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [summary, setSummary] = useState(editing?.summary ?? "");
  const [issueType, setIssueType] = useState(editing?.issueType ?? "");
  const [symptoms, setSymptoms] = useState(editing?.symptoms ?? "");
  const [recommendedSteps, setRecommendedSteps] = useState(editing?.recommendedSteps ?? "");
  const [internalNotes, setInternalNotes] = useState(editing?.internalNotes ?? "");
  const [responseTemplate, setResponseTemplate] = useState(editing?.responseTemplate ?? "");
  const [status, setStatus] = useState(editing?.status ?? "draft");

  const reset = (s: Solution | null) => {
    setTitle(s?.title ?? "");
    setSummary(s?.summary ?? "");
    setIssueType(s?.issueType ?? "");
    setSymptoms(s?.symptoms ?? "");
    setRecommendedSteps(s?.recommendedSteps ?? "");
    setInternalNotes(s?.internalNotes ?? "");
    setResponseTemplate(s?.responseTemplate ?? "");
    setStatus(s?.status ?? "draft");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        summary: summary.trim() || null,
        issueType: issueType.trim() || null,
        symptoms: symptoms.trim() || null,
        recommendedSteps: recommendedSteps.trim() || null,
        internalNotes: internalNotes.trim() || null,
        responseTemplate: responseTemplate.trim() || null,
        status,
      };
      if (editing) {
        const res = await apiRequest("PATCH", `/api/solutions/${editing.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/solutions", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: editing ? "Solution updated" : "Solution created" });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(null); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Solution" : "New Solution"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Solution title" data-testid="input-solution-title" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Summary</Label>
              <Input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Brief one-line summary" data-testid="input-solution-summary" />
            </div>
            <div className="space-y-1.5">
              <Label>Issue Type</Label>
              <Input value={issueType} onChange={e => setIssueType(e.target.value)} placeholder="e.g. plumbing, billing" data-testid="input-solution-issue-type" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-solution-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Symptoms / When to use</Label>
            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              placeholder="Describe the symptoms or situations where this solution applies…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="textarea-solution-symptoms"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Recommended Steps</Label>
            <textarea
              value={recommendedSteps}
              onChange={e => setRecommendedSteps(e.target.value)}
              placeholder="Step-by-step resolution guide…"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="textarea-solution-steps"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Response Template</Label>
            <textarea
              value={responseTemplate}
              onChange={e => setResponseTemplate(e.target.value)}
              placeholder="Email/message template to send to residents…"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="textarea-solution-template"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <textarea
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="Internal team notes (not shown to residents)…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="textarea-solution-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending} data-testid="button-save-solution">
            {mutation.isPending ? "Saving…" : editing ? "Save Changes" : "Create Solution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SyncModeBadge({ mode }: { mode: string }) {
  if (mode === "delegated") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400">
        <User className="h-3 w-3" />
        Delegated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs border-muted-foreground/30 text-muted-foreground">
      <Server className="h-3 w-3" />
      App-only
    </Badge>
  );
}

function MailboxDialog({ mode, defaultValues }: { mode: "create" | "edit"; defaultValues?: Mailbox }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultValues?.name || "");
  const [type, setType] = useState(defaultValues?.type || "shared");
  const [syncMode, setSyncMode] = useState<string>(defaultValues?.syncMode ?? "application");
  const [microsoftMailboxId, setMicrosoftMailboxId] = useState(defaultValues?.microsoftMailboxId || "");
  const [isDefault, setIsDefault] = useState(defaultValues?.isDefault || false);
  const [syncHistoryDays, setSyncHistoryDays] = useState(String(defaultValues?.syncHistoryDays ?? 30));
  const [includeSentMail, setIncludeSentMail] = useState(defaultValues?.includeSentMail !== false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(defaultValues?.autoSyncEnabled !== false);
  const [autoSyncIntervalMinutes, setAutoSyncIntervalMinutes] = useState(String(defaultValues?.autoSyncIntervalMinutes ?? 5));

  const createMutation = useCreateMailbox();
  const updateMutation = useUpdateMailbox();
  const { toast } = useToast();

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      type,
      syncMode: syncMode as "application" | "delegated",
      microsoftMailboxId: microsoftMailboxId || null,
      isDefault,
      syncHistoryDays: Number(syncHistoryDays) || 30,
      includeSentMail,
      autoSyncEnabled,
      autoSyncIntervalMinutes: Number(autoSyncIntervalMinutes) || 5,
    };

    if (mode === "create") {
      createMutation.mutate(data as any, {
        onSuccess: () => {
          toast({ title: "Mailbox created successfully" });
          setOpen(false);
          reset();
        },
        onError: (err) => toast({ title: "Error creating mailbox", description: err.message, variant: "destructive" })
      });
    } else if (defaultValues) {
      updateMutation.mutate({ id: defaultValues.id, data }, {
        onSuccess: () => {
          toast({ title: "Mailbox updated successfully" });
          setOpen(false);
        },
        onError: (err) => toast({ title: "Error updating mailbox", description: err.message, variant: "destructive" })
      });
    }
  };

  const reset = () => {
    setName(""); setType("shared"); setSyncMode("application");
    setMicrosoftMailboxId(""); setIsDefault(false);
    setSyncHistoryDays("30"); setIncludeSentMail(true);
    setAutoSyncEnabled(true); setAutoSyncIntervalMinutes("5");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button data-testid="button-add-mailbox" className="hover-elevate gap-2">
            <Plus className="h-4 w-4" />
            Add Mailbox
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid={`button-edit-mailbox-${defaultValues?.id}`}>
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add New Mailbox" : "Edit Mailbox"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Mailbox Name</Label>
              <Input id="name" data-testid="input-mailbox-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support Team" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Account Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger data-testid="select-mailbox-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Shared Mailbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Sync Mode</Label>
                <Select value={syncMode} onValueChange={setSyncMode}>
                  <SelectTrigger data-testid="select-sync-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">App-only</SelectItem>
                    <SelectItem value="delegated">Delegated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ms-id">Microsoft Mailbox Address</Label>
              <Input id="ms-id" data-testid="input-mailbox-ms-id" value={microsoftMailboxId} onChange={(e) => setMicrosoftMailboxId(e.target.value)} placeholder="support@company.com" />
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <p className="text-sm font-medium text-foreground">Sync Settings</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="history-days">Sync history (days)</Label>
                  <Input id="history-days" type="number" min="1" max="365" value={syncHistoryDays} onChange={(e) => setSyncHistoryDays(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sync-interval">Auto-sync interval (min)</Label>
                  <Input id="sync-interval" type="number" min="1" max="60" value={autoSyncIntervalMinutes} onChange={(e) => setAutoSyncIntervalMinutes(e.target.value)} disabled={!autoSyncEnabled} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="include-sent" className="font-normal cursor-pointer">Include sent mail</Label>
                <Switch id="include-sent" checked={includeSentMail} onCheckedChange={setIncludeSentMail} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-sync" className="font-normal cursor-pointer">Enable auto-sync</Label>
                <Switch id="auto-sync" checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1 border-t">
              <Checkbox id="default" data-testid="checkbox-mailbox-default" checked={isDefault} onCheckedChange={(c) => setIsDefault(!!c)} />
              <Label htmlFor="default" className="font-normal cursor-pointer">Set as default system mailbox</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" data-testid="button-save-mailbox" disabled={isPending}>
              {isPending ? "Saving..." : "Save Mailbox"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMailboxAlert({ mailbox }: { mailbox: Mailbox }) {
  const [open, setOpen] = useState(false);
  const deleteMutation = useDeleteMailbox();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteMutation.mutate(mailbox.id, {
      onSuccess: () => { toast({ title: "Mailbox deleted" }); setOpen(false); },
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" })
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:border-destructive hover:bg-destructive/5" data-testid={`button-delete-mailbox-${mailbox.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Mailbox</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the mailbox "{mailbox.name}"? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleteMutation.isPending ? "Deleting..." : "Delete Mailbox"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TypeLabelsSection({ category, title, description }: { category: string; title: string; description: string }) {
  const { data: labels, isLoading } = useQuery<TypeLabel[]>({
    queryKey: ["/api/type-labels", { category }],
    queryFn: () => fetch(`/api/type-labels?category=${category}`).then(r => r.json()),
  });
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const createMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/type-labels", { category, name, isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/type-labels", { category }] });
      setIsAdding(false);
      setNewName("");
      toast({ title: "Type added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<TypeLabel> }) =>
      apiRequest("PATCH", `/api/type-labels/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/type-labels", { category }] });
      setEditingId(null);
      toast({ title: "Type updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/type-labels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/type-labels", { category }] });
      toast({ title: "Type deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Type
          </Button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[300px]">Type Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow className="bg-muted/30">
                <TableCell>
                  <Input
                    size={1}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Enter type name..."
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && createMutation.mutate(newName)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline">New</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" onClick={() => createMutation.mutate(newName)} disabled={!newName.trim() || createMutation.isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading types...</TableCell></TableRow>
            ) : labels?.length === 0 && !isAdding ? (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No types configured.</TableCell></TableRow>
            ) : (
              labels?.map(label => (
                <TableRow key={label.id} className="group">
                  <TableCell>
                    {editingId === label.id ? (
                      <Input
                        size={1}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === "Enter" && updateMutation.mutate({ id: label.id, updates: { name: editName } })}
                      />
                    ) : (
                      <span className={label.isActive ? "" : "text-muted-foreground line-through"}>{label.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={label.isActive}
                        onCheckedChange={checked => updateMutation.mutate({ id: label.id, updates: { isActive: checked } })}
                      />
                      <span className="text-xs">{label.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId === label.id ? (
                        <>
                          <Button size="sm" onClick={() => updateMutation.mutate({ id: label.id, updates: { name: editName } })} disabled={!editName.trim() || updateMutation.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(label.id); setEditName(label.name); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Type</AlertDialogTitle>
                                <AlertDialogDescription>Are you sure you want to delete "{label.name}"? This may affect existing records referencing this type.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(label.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

  function ImportCard({ title, description, icon: Icon, onClick, dataTestId, highlight }: { title: string; description: string; icon: any; onClick: () => void; dataTestId: string; highlight?: boolean }) {
    return (
      <div 
        className={`hover:bg-muted/50 border rounded-xl p-6 transition-colors cursor-pointer group flex flex-col items-center text-center space-y-4 shadow-sm ${highlight ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}
        onClick={onClick}
        data-testid={dataTestId}
      >
        <div className={`h-12 w-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${highlight ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Button variant={highlight ? "default" : "outline"} size="sm" className="w-full mt-auto">Select File</Button>
      </div>
    );
  }

  function GenericImportWizardDialog({ title, fields, endpoint, icon: Icon, trigger }: { title: string; fields: any[]; endpoint: string; icon: any; trigger: (open: () => void) => React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState(1);
    const [filename, setFilename] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [result, setResult] = useState<any>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFilename(file.name);
      const reader = new FileReader();
      reader.onload = evt => {
        const { headers, rows } = parseCSV(evt.target?.result as string);
        setHeaders(headers);
        setRows(rows);
        // Auto-mapping for generic fields
        const newMapping: Record<string, string> = {};
        fields.forEach(f => {
          const found = headers.find(h => h.toLowerCase().includes(f.key.toLowerCase()) || f.label.toLowerCase().includes(h.toLowerCase()));
          if (found) newMapping[f.key] = found;
        });
        setMapping(newMapping);
        setStep(2);
      };
      reader.readAsText(file);
    };

    const executeMutation = useMutation({
      mutationFn: () => apiRequest("POST", endpoint, { rows, mapping }).then(r => r.json()),
      onSuccess: (data: any) => {
        setResult(data);
        setStep(3);
        toast({ title: `Import complete` });
      },
      onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
    });

    const reset = () => { 
      setStep(1); setFilename(""); setHeaders([]); setRows([]); setMapping({}); setResult(null); 
      if (fileRef.current) fileRef.current.value = ""; 
    };

    return (
      <>
        {trigger(() => setOpen(true))}
        <Dialog open={open} onOpenChange={v => { if (!v) { setOpen(false); reset(); } }}>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                Import {title} — Step {step} of 3
              </DialogTitle>
            </DialogHeader>

            {step === 1 && (
              <div className="py-4">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                  data-testid={`csv-drop-zone-${title.toLowerCase()}`}
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">Click to select a CSV file</p>
                  <p className="text-xs text-muted-foreground">Select a file to import {title.toLowerCase()}</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              </div>
            )}

            {step === 2 && (
              <div className="py-2 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{rows.length} rows detected</span>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map columns</p>
                  {fields.map(f => (
                    <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                      <label className="text-xs text-foreground">{f.label}</label>
                      <Select value={mapping[f.key] ?? "__skip__"} onValueChange={v => setMapping(prev => { const next = { ...prev }; if (v === "__skip__") { delete next[f.key]; } else { next[f.key] = v; } return next; })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="— skip —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— skip —</SelectItem>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={reset}>Back</Button>
                  <Button size="sm" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending} data-testid="button-execute-import">
                    {executeMutation.isPending ? "Importing…" : "Execute Import"}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 3 && result && (
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Created</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-amber-500">{result.updated}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Updated</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-red-500">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={() => { setOpen(false); reset(); }}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }
  