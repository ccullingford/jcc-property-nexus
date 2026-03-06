import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Phone, User, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function parsePhone(search: string): string {
  const params = new URLSearchParams(search);
  return params.get("phone") || "";
}

export function CallPopPage() {
  const [location] = useLocation();
  const phone = parsePhone(window.location.search);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/calls/pop", phone],
    queryFn: async () => {
      if (!phone) return null;
      const res = await fetch(`/api/calls/pop?phone=${encodeURIComponent(phone)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch caller info");
      return res.json() as Promise<{
        contact: {
          id: number;
          displayName: string;
          contactType: string;
          primaryEmail: string | null;
          primaryPhone: string | null;
        } | null;
        phoneNumber: string;
      }>;
    },
    enabled: !!phone,
    refetchOnWindowFocus: false,
  });

  if (!phone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Phone className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">No phone number</h2>
          <p className="text-sm text-muted-foreground">
            Provide a <code className="bg-muted px-1 rounded text-xs">?phone=+1...</code> query parameter.
          </p>
          <Link href="/calls">
            <Button variant="outline" size="sm" className="mt-4 gap-2">
              <ArrowLeft className="h-4 w-4" />
              Call Log
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-6"
      data-testid="call-pop-screen"
    >
      <div className="w-full max-w-sm bg-card border border-card-border rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Phone className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs opacity-70 uppercase tracking-wide">Incoming Call</p>
            <p className="font-semibold font-mono text-sm" data-testid="text-phone-number">{phone}</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : data?.contact ? (
            <div data-testid="contact-info">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p
                    className="font-semibold text-foreground"
                    data-testid="text-contact-name"
                  >
                    {data.contact.displayName}
                  </p>
                  <Badge variant="secondary" className="text-xs mt-0.5">
                    {data.contact.contactType}
                  </Badge>
                  {data.contact.primaryEmail && (
                    <p className="text-xs text-muted-foreground mt-1">{data.contact.primaryEmail}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground" data-testid="unknown-caller">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Unknown Caller</p>
                <p className="text-xs">No contact record found for this number.</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-2">
            {data?.contact && (
              <Link href={`/contacts`}>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-view-contact">
                  View Contact
                </Button>
              </Link>
            )}
            <Link href="/issues">
              <Button variant="outline" size="sm" className="w-full" data-testid="button-create-issue">
                Create Issue
              </Button>
            </Link>
            <Link href="/calls">
              <Button variant="ghost" size="sm" className="w-full gap-2" data-testid="button-call-log">
                <ArrowLeft className="h-4 w-4" />
                Call Log
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
