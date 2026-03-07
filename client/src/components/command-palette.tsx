import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Inbox, Users, AlertCircle, CheckSquare, Building2, Home } from "lucide-react";

interface SearchResults {
  contacts: { id: number; displayName: string; contactType: string | null }[];
  threads: { id: number; subject: string; status: string }[];
  issues: { id: number; title: string; status: string }[];
  tasks: { id: number; title: string; status: string }[];
  associations: { id: number; name: string }[];
  units: { id: number; unitNumber: string; associationName: string | null }[];
}

const EMPTY: SearchResults = { contacts: [], threads: [], issues: [], tasks: [], associations: [], units: [] };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: results = EMPTY } = useQuery<SearchResults>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      if (query.trim().length < 2) return EMPTY;
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`);
      if (!res.ok) return EMPTY;
      return res.json();
    },
    enabled: query.trim().length >= 2,
    staleTime: 10000,
  });

  const go = useCallback((path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  }, [navigate]);

  const hasResults =
    results.contacts.length > 0 ||
    results.threads.length > 0 ||
    results.issues.length > 0 ||
    results.tasks.length > 0 ||
    results.associations.length > 0 ||
    results.units.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <CommandInput
        placeholder="Search threads, contacts, issues, tasks…"
        value={query}
        onValueChange={setQuery}
        data-testid="input-command-search"
      />
      <CommandList>
        {query.trim().length >= 2 && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {query.trim().length < 2 && (
          <CommandEmpty className="text-muted-foreground text-sm py-6">
            Type at least 2 characters to search…
          </CommandEmpty>
        )}

        {results.threads.length > 0 && (
          <CommandGroup heading="Threads">
            {results.threads.map((t) => (
              <CommandItem
                key={`thread-${t.id}`}
                value={`thread-${t.id}-${t.subject}`}
                onSelect={() => go(`/inbox?thread=${t.id}`)}
                data-testid={`search-thread-${t.id}`}
              >
                <Inbox className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{t.subject || "(No subject)"}</span>
                <Badge variant="outline" className="ml-2 text-xs shrink-0">{t.status}</Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.contacts.length > 0 && (
          <>
            {results.threads.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Contacts">
              {results.contacts.map((c) => (
                <CommandItem
                  key={`contact-${c.id}`}
                  value={`contact-${c.id}-${c.displayName}`}
                  onSelect={() => go(`/contacts?id=${c.id}`)}
                  data-testid={`search-contact-${c.id}`}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{c.displayName}</span>
                  {c.contactType && (
                    <Badge variant="secondary" className="ml-2 text-xs shrink-0">{c.contactType}</Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.issues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {results.issues.map((i) => (
                <CommandItem
                  key={`issue-${i.id}`}
                  value={`issue-${i.id}-${i.title}`}
                  onSelect={() => go(`/issues?id=${i.id}`)}
                  data-testid={`search-issue-${i.id}`}
                >
                  <AlertCircle className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{i.title}</span>
                  <Badge variant="outline" className="ml-2 text-xs shrink-0">{i.status}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {results.tasks.map((t) => (
                <CommandItem
                  key={`task-${t.id}`}
                  value={`task-${t.id}-${t.title}`}
                  onSelect={() => go(`/tasks?id=${t.id}`)}
                  data-testid={`search-task-${t.id}`}
                >
                  <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <Badge variant="outline" className="ml-2 text-xs shrink-0">{t.status}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.associations.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Associations">
              {results.associations.map((a) => (
                <CommandItem
                  key={`assoc-${a.id}`}
                  value={`assoc-${a.id}-${a.name}`}
                  onSelect={() => go(`/associations?id=${a.id}`)}
                  data-testid={`search-assoc-${a.id}`}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.units.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Units">
              {results.units.map((u) => (
                <CommandItem
                  key={`unit-${u.id}`}
                  value={`unit-${u.id}-${u.unitNumber}`}
                  onSelect={() => go(`/associations?unit=${u.id}`)}
                  data-testid={`search-unit-${u.id}`}
                >
                  <Home className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">Unit {u.unitNumber}</span>
                  {u.associationName && (
                    <span className="ml-2 text-xs text-muted-foreground shrink-0 truncate max-w-[120px]">{u.associationName}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
