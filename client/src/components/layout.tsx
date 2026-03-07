import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
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
import { Loader2, Inbox, CheckSquare, AlertCircle, Users, Building2, Phone, Settings, LogOut, Sun, Moon, Sparkles, Bell } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { GlobalCreateMenu } from "@/components/global-create-menu";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

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
              {navItems.map((item) => (
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

  return (
    <header
      className="h-14 border-b border-border flex items-center justify-between px-4 bg-background shrink-0"
      data-testid="app-header"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:block">
          Press{" "}
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>{" "}
          to search
        </span>
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
    </header>
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
