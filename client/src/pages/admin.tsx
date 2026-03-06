import { useState } from "react";
import { useMailboxes, useCreateMailbox, useUpdateMailbox, useDeleteMailbox } from "@/hooks/use-mailboxes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Mail, CheckCircle2, XCircle, Server, User } from "lucide-react";
import { z } from "zod";
import { api } from "@shared/routes";

type Mailbox = z.infer<typeof api.mailboxes.list.responses[200]>[0];

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
              <TableHead>Microsoft ID</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading mailboxes...
                </TableCell>
              </TableRow>
            ) : mailboxes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Mail className="h-8 w-8 mb-2 opacity-50" />
                    <p>No mailboxes configured</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              mailboxes?.map((mailbox) => (
                <TableRow key={mailbox.id} data-testid={`row-mailbox-${mailbox.id}`} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">{mailbox.name}</TableCell>
                  <TableCell>
                    <Badge variant={mailbox.type === "shared" ? "default" : "secondary"} className="capitalize">
                      {mailbox.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SyncModeBadge mode={(mailbox as any).syncMode ?? "application"} />
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {mailbox.microsoftMailboxId || "—"}
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

function MailboxDialog({ mode, defaultValues }: { mode: "create" | "edit", defaultValues?: Mailbox }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultValues?.name || "");
  const [type, setType] = useState(defaultValues?.type || "shared");
  const [syncMode, setSyncMode] = useState<string>((defaultValues as any)?.syncMode ?? "application");
  const [microsoftMailboxId, setMicrosoftMailboxId] = useState(defaultValues?.microsoftMailboxId || "");
  const [isDefault, setIsDefault] = useState(defaultValues?.isDefault || false);
  
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
    setName("");
    setType("shared");
    setSyncMode("application");
    setMicrosoftMailboxId("");
    setIsDefault(false);
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
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add New Mailbox" : "Edit Mailbox"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="name">Mailbox Name</Label>
              <Input
                id="name"
                data-testid="input-mailbox-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Support Team"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="type">Account Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-mailbox-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Shared Mailbox</SelectItem>
                  <SelectItem value="personal">Personal Account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sync-mode">Sync Mode</Label>
              <Select value={syncMode} onValueChange={setSyncMode}>
                <SelectTrigger data-testid="select-sync-mode">
                  <SelectValue placeholder="Select sync mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="application">App-only (shared mailboxes)</SelectItem>
                  <SelectItem value="delegated">Delegated (personal mailboxes)</SelectItem>
                </SelectContent>
              </Select>
              {syncMode === "delegated" && (
                <p className="text-xs text-muted-foreground">
                  Uses the owner's Microsoft login token. The owner must be signed in to sync.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ms-id">Microsoft Mailbox ID (Optional)</Label>
              <Input
                id="ms-id"
                data-testid="input-mailbox-ms-id"
                value={microsoftMailboxId}
                onChange={(e) => setMicrosoftMailboxId(e.target.value)}
                placeholder="support@company.com"
              />
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="default"
                data-testid="checkbox-mailbox-default"
                checked={isDefault}
                onCheckedChange={(c) => setIsDefault(!!c)}
              />
              <Label htmlFor="default" className="font-normal cursor-pointer">
                Set as default system mailbox
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
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
      onSuccess: () => {
        toast({ title: "Mailbox deleted" });
        setOpen(false);
      },
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
            Are you sure you want to delete the mailbox "{mailbox.name}"? This action cannot be undone and will revoke access for all assigned users.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Mailbox"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
