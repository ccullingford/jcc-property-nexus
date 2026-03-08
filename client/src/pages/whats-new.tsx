import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Wrench, Zap, CheckCheck } from "lucide-react";
import { APP_VERSION } from "@shared/version";

interface WhatsNewEntry {
  id: number;
  title: string;
  type: string;
  description: string;
  howToUse: string | null;
  releaseVersion: string | null;
  isActive: boolean;
  createdAt: string;
  isRead: boolean;
}

function typeConfig(type: string): { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" } {
  if (type === "improvement") return { label: "Improvement", icon: Zap, variant: "secondary" };
  if (type === "fix") return { label: "Fix", icon: Wrench, variant: "outline" };
  return { label: "Feature", icon: Sparkles, variant: "default" };
}

function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function WhatsNewPage() {
  const { data: entries = [], isLoading } = useQuery<WhatsNewEntry[]>({
    queryKey: ["/api/whats-new"],
    queryFn: async () => {
      const res = await fetch("/api/whats-new", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whats-new/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unread-count"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/whats-new/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unread-count"] });
    },
  });

  const unreadCount = entries.filter(e => !e.isRead).length;

  const grouped: Map<string, WhatsNewEntry[]> = new Map();
  for (const entry of entries) {
    const key = entry.releaseVersion ?? "Unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }
  const sortedVersions = Array.from(grouped.keys()).sort(semverCompare);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground" data-testid="whats-new-title">What's New</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Latest features, improvements, and fixes &mdash; current version{" "}
              <span className="font-mono" data-testid="current-version">v{APP_VERSION}</span>
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="whats-new-empty">
            <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">Nothing here yet</h2>
            <p className="text-sm text-muted-foreground">Check back soon for the latest updates.</p>
          </div>
        ) : (
          <div className="space-y-10" data-testid="whats-new-list">
            {sortedVersions.map((version, vIdx) => {
              const versionEntries = grouped.get(version)!;
              const isCurrentVersion = version === APP_VERSION;
              return (
                <div key={version} data-testid={`release-group-${version}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground" data-testid={`release-version-${version}`}>
                        Version {version}
                      </h2>
                      {isCurrentVersion && (
                        <Badge variant="default" className="text-xs h-4 px-1.5" data-testid="badge-current-version">
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="space-y-0">
                    {versionEntries.map((entry, idx) => {
                      const { label, icon: Icon, variant } = typeConfig(entry.type);
                      return (
                        <div key={entry.id}>
                          <div
                            className="py-5 group"
                            data-testid={`whats-new-entry-${entry.id}`}
                            onMouseEnter={() => { if (!entry.isRead) markRead.mutate(entry.id); }}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`relative mt-0.5 shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${entry.isRead ? "bg-muted" : "bg-primary/10"}`}>
                                <Icon className={`h-4 w-4 ${entry.isRead ? "text-muted-foreground" : "text-primary"}`} />
                                {!entry.isRead && (
                                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" data-testid={`unread-dot-${entry.id}`} />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <span className="text-sm font-semibold text-foreground" data-testid={`entry-title-${entry.id}`}>{entry.title}</span>
                                  <Badge variant={variant} className="text-xs h-4 px-1.5" data-testid={`entry-type-${entry.id}`}>{label}</Badge>
                                </div>

                                <p className="text-sm text-foreground/80 leading-relaxed" data-testid={`entry-description-${entry.id}`}>{entry.description}</p>

                                {entry.howToUse && (
                                  <div className="mt-3 pl-3 border-l-2 border-border">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">How to use</p>
                                    <p className="text-sm text-foreground/70 leading-relaxed" data-testid={`entry-how-to-use-${entry.id}`}>{entry.howToUse}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {idx < versionEntries.length - 1 && <Separator />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
