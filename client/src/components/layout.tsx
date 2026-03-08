import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { APP_VERSION } from "@shared/version";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Inbox, CheckSquare, AlertCircle, Users, Building2, Phone, Settings, LogOut, Sun, Moon, Sparkles, Bell, Search, PenLine, X, Plus, Trash2 } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { GlobalCreateMenu } from "@/components/global-create-menu";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Notification, MailboxSignature, Mailbox } from "@shared/schema";

const navItems = [
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Issues", url: "/issues", icon: AlertCircle },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Associations", url: "/associations", icon: Building2 },
  { title: "Calls", url: "/calls", icon: Phone },
  { title: "Admin", url: "/admin", icon: Settings },
];

function AppSidebar() {
  const [location] = useLocation();
  const { data: user } = useUser();
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const visibleNavItems = navItems.filter(item => item.title !== "Admin" || isAdminOrManager);

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <div className="px-4 py-5 border-b border-sidebar-border">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">PropOps</span>
            <h1 className="text-base font-semibold text-sidebar-foreground mt-0.5">Operations</h1>
          </div>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith(item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground/50 font-mono" data-testid="sidebar-version">v{APP_VERSION}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NotificationsBell({ userId }: { userId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 60 * 1000,
    enabled: !!userId,
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center" data-testid="notifications-unread-badge">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notifications-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                  onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={!n.isRead ? "" : "pl-4"}>
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function Header() {
  const { data: user } = useUser();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [personalMailboxOpen, setPersonalMailboxOpen] = useState(false);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/whats-new/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/whats-new/unread-count", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const unreadCount = unreadData?.count ?? 0;

  if (!user) return null;

  function triggerSearch() {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: !isMac, metaKey: isMac, bubbles: true }));
  }

  return (
    <header
      className="h-14 border-b border-border flex items-center justify-between px-4 bg-background shrink-0"
      data-testid="app-header"
    >
      <div className="flex items-center flex-1 max-w-sm">
        <button
          type="button"
          onClick={triggerSearch}
          className="flex items-center gap-2 h-8 w-full max-w-xs rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
          data-testid="button-search-bar"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left text-xs">Search…</span>
          <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <GlobalCreateMenu />
        <NotificationsBell userId={user.id} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full border border-border relative"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" data-testid="unread-badge" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/whats-new")}
              className="cursor-pointer"
              data-testid="button-whats-new"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              <span className="flex-1">What's New</span>
              {unreadCount > 0 && (
                <Badge variant="default" className="h-4 px-1.5 text-xs ml-1" data-testid="unread-count-badge">{unreadCount}</Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSignatureOpen(true)}
              className="cursor-pointer"
              data-testid="button-signature-settings"
            >
              <PenLine className="mr-2 h-4 w-4" />
              Signature Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setPersonalMailboxOpen(true)}
              className="cursor-pointer"
              data-testid="button-personal-mailbox"
            >
              <Settings className="mr-2 h-4 w-4" />
              Personal Mailbox
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="cursor-pointer"
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 cursor-pointer"
              onClick={() => logout.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandPalette />
      <SignatureSettingsDialog open={signatureOpen} onClose={() => setSignatureOpen(false)} userId={user.id} userName={user.name} />
      <PersonalMailboxDialog open={personalMailboxOpen} onClose={() => setPersonalMailboxOpen(false)} userId={user.id} />
    </header>
  );
}

// ─── Signature Settings Dialog ────────────────────────────────────────────────
function SignatureSettingsDialog({ open, onClose, userId, userName }: { open: boolean; onClose: () => void; userId: number; userName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newMailboxId, setNewMailboxId] = useState<string>("__default__");
  const [creating, setCreating] = useState(false);

  const { data: signatures = [] } = useQuery<MailboxSignature[]>({
    queryKey: ["/api/signatures"],
    enabled: open,
  });

  const { data: mailboxes = [] } = useQuery<Mailbox[]>({
    queryKey: ["/api/mailboxes"],
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      apiRequest("PUT", `/api/signatures/${id}`, { body }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signatures"] });
      setEditingId(null);
      toast({ title: "Signature saved" });
    },
  });

  const createMutation = useMutation({
    mutationFn: ({ body, mailboxId }: { body: string; mailboxId?: number }) =>
      apiRequest("POST", "/api/signatures", { body, mailboxId }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signatures"] });
      setNewBody("");
      setNewMailboxId("__default__");
      setCreating(false);
      toast({ title: "Signature created" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/signatures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signatures"] });
      toast({ title: "Signature deleted" });
    },
  });

  const getMailboxLabel = (mailboxId: number | null) => {
    if (!mailboxId) return "Default (all mailboxes)";
    const mb = mailboxes.find(m => m.id === mailboxId);
    return mb ? (mb.microsoftMailboxId ?? mb.name) : `Mailbox #${mailboxId}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Signature Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">Configure your email signatures. You can have one default signature and additional signatures per mailbox.</p>

          {signatures.length === 0 && !creating && (
            <div className="text-center py-4 text-sm text-muted-foreground">No signatures configured yet.</div>
          )}

          {signatures.map((sig) => (
            <div key={sig.id} className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{getMailboxLabel(sig.mailboxId)}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditingId(sig.id); setEditBody(sig.body); }}>
                    <PenLine className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(sig.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {editingId === sig.id ? (
                <div className="space-y-2">
                  <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={4} className="text-sm resize-none" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveMutation.mutate({ id: sig.id, body: editBody })} disabled={saveMutation.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans bg-muted/30 rounded p-2">{sig.body}</pre>
              )}
            </div>
          ))}

          {creating ? (
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Mailbox</Label>
                <Select value={newMailboxId} onValueChange={setNewMailboxId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default (all mailboxes)</SelectItem>
                    {mailboxes.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.microsoftMailboxId ?? m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder={`Best,\n${userName}`} rows={4} className="text-sm resize-none" />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button size="sm" onClick={() => createMutation.mutate({ body: newBody, mailboxId: newMailboxId !== "__default__" ? Number(newMailboxId) : undefined })} disabled={createMutation.isPending || !newBody.trim()}>
                  Save Signature
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />Add Signature
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Personal Mailbox Dialog ───────────────────────────────────────────────────
function PersonalMailboxDialog({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const { data: allMailboxes = [] } = useQuery<Mailbox[]>({
    queryKey: ["/api/mailboxes"],
    enabled: open,
  });

  const personalMailboxes = allMailboxes.filter(m => m.syncMode === "delegated" && m.ownerUserId === userId);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailboxes", {
      name: name || email,
      type: "personal",
      syncMode: "delegated",
      microsoftMailboxId: email,
      ownerUserId: userId,
      isDefault: false,
      autoSyncEnabled: true,
      syncHistoryDays: 30,
      includeSentMail: true,
      autoSyncIntervalMinutes: 5,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      setName("");
      setEmail("");
      toast({ title: "Personal mailbox added" });
    },
    onError: (err: Error) => toast({ title: "Failed to add mailbox", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/mailboxes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      toast({ title: "Mailbox removed" });
    },
    onError: (err: Error) => toast({ title: "Failed to remove mailbox", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Personal Mailbox</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">Connect your personal email account to send and receive from Nexus. Note: the mailbox must be accessible through your Microsoft 365 account.</p>

          {personalMailboxes.length > 0 && (
            <div className="space-y-2">
              {personalMailboxes.map(m => (
                <div key={m.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.microsoftMailboxId}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(m.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-medium">Add personal mailbox</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Email address</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display name (optional)</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Email" className="h-8 text-sm" />
            </div>
            <Button size="sm" className="w-full" onClick={() => createMutation.mutate()} disabled={!email.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add Mailbox"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 3-panel workspace layout: Sidebar | Main | Context Panel
export function Layout({ children, contextPanel }: { children: ReactNode; contextPanel?: ReactNode }) {
  const style = { "--sidebar-width": "14rem" } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 overflow-auto" data-testid="main-content">
              {children}
            </main>
            {contextPanel && (
              <aside
                className="w-72 shrink-0 border-l border-border overflow-y-auto bg-background hidden lg:block"
                data-testid="context-panel"
              >
                {contextPanel}
              </aside>
            )}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Reusable empty state for placeholder pages
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
