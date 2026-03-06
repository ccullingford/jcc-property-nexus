import { useState } from "react";
import { useMailboxes, useCreateMailbox, useUpdateMailbox, useDeleteMailbox } from "@/hooks/use-mailboxes";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Mail, CheckCircle2, XCircle, Server, User, Clock } from "lucide-react";
import { z } from "zod";
import { api } from "@shared/routes";
import { formatDistanceToNow } from "date-fns";

type Mailbox = z.infer<typeof api.mailboxes.list.responses[200]>[0] & {
  syncHistoryDays?: number;
  includeSentMail?: boolean;
  autoSyncEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
  lastSyncedAt?: string | null;
  syncMode?: string;
};

export function Admin() {
  const { data: mailboxes, isLoading } = useMailboxes();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Mailbox Management</h1>
          <p className="text-muted-foreground mt-1">Configure and manage shared and personal mailboxes.</p>
        </div>
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
              (mailboxes as Mailbox[])?.map((mailbox) => (
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
    </div>
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
                    <SelectItem value="personal">Personal Account</SelectItem>
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
