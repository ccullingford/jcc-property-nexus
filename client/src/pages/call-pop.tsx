import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Phone, User, AlertCircle, ArrowLeft, Copy, CheckCheck, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function parsePhone(search: string): string {
  const params = new URLSearchParams(search);
  return params.get("phone") || "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="ml-1 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors shrink-0" title="Copy">
      {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SetupGuide() {
  const [openSection, setOpenSection] = useState<string | null>("url");
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "https://your-nexus-app.replit.app";
  const webhookUrl = `${appOrigin}/call-pop?phone={CALLER_NUMBER}`;
  const exampleUrl = `${appOrigin}/call-pop?phone=%2B17735551234`;

  function toggle(id: string) {
    setOpenSection(prev => prev === id ? null : id);
  }

  return (
    <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Phone className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Call Pop Setup</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure your RingEX phone system to open this URL when a call arrives. NEXUS looks up the caller and displays their contact record instantly.
        </p>
      </div>

      <div className="divide-y divide-border">
        <div>
          <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left" onClick={() => toggle("url")}>
            <span className="text-sm font-medium">1. Your Call Pop URL</span>
            {openSection === "url" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {openSection === "url" && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                This is your call pop URL. In RingEX, replace <code className="bg-muted px-1 rounded font-mono">{"{CALLER_NUMBER}"}</code> with the variable your phone system uses for the caller's number.
              </p>
              <div className="rounded-md bg-muted/60 border border-border p-3 flex items-start justify-between gap-2">
                <code className="font-mono text-xs break-all">{webhookUrl}</code>
                <CopyButton text={webhookUrl} />
              </div>
              <p className="text-xs text-muted-foreground font-medium">Example — caller +1 (773) 555-1234:</p>
              <div className="rounded-md bg-muted/60 border border-border p-3 flex items-start justify-between gap-2">
                <code className="font-mono text-xs break-all">{exampleUrl}</code>
                <CopyButton text={exampleUrl} />
              </div>
              <p className="text-xs text-muted-foreground">
                Phone numbers must be URL-encoded E.164 format. The <code className="bg-muted px-1 rounded font-mono">+</code> sign encodes as <code className="bg-muted px-1 rounded font-mono">%2B</code>. So +17735551234 becomes <code className="bg-muted px-1 rounded font-mono">%2B17735551234</code>.
              </p>
            </div>
          )}
        </div>

        <div>
          <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left" onClick={() => toggle("ringex")}>
            <span className="text-sm font-medium">2. RingEX Configuration</span>
            {openSection === "ringex" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {openSection === "ringex" && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-muted-foreground">In the RingEX Admin Portal, configure a screen pop (also called call pop or HTTP notification):</p>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Sign in to <strong>admin.ringcentral.com</strong></li>
                <li>Go to <strong>Phone System → Auto-Receptionist</strong> or <strong>Users → [User] → Screening, Greeting &amp; Hold Music</strong></li>
                <li>Find <strong>Screen Pop</strong> or <strong>Incoming Call Information</strong></li>
                <li>Set URL to your call pop URL (from step 1)</li>
                <li>Set the phone number variable — RingEX typically uses <code className="bg-muted px-1 rounded font-mono">%7BcallerIdNumber%7D</code> or a similar token</li>
                <li>Set trigger to <strong>All inbound calls</strong></li>
                <li>Save and test with a real call or the Test URL link below</li>
              </ol>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Note:</strong> Configuration paths vary by RingEX plan and version. Look for "Screen Pop", "Call Pop", or "Outbound URL" in your admin settings. Contact RingEX support if you can't find it.
                </p>
              </div>
            </div>
          )}
        </div>

        <div>
          <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left" onClick={() => toggle("test")}>
            <span className="text-sm font-medium">3. Test Your Setup</span>
            {openSection === "test" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {openSection === "test" && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-muted-foreground">Open the example URL to test the call pop display (this number likely won't match any contact, which is expected):</p>
              <div className="rounded-md bg-muted/60 border border-border p-3 flex items-start justify-between gap-2">
                <code className="font-mono text-xs break-all">{exampleUrl}</code>
                <a href={exampleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 shrink-0">
                  <ExternalLink className="h-3 w-3" />Open
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                To test with a real contact: go to <strong>Contacts</strong>, open a contact, and copy their primary phone number. Substitute it into the URL above (E.164 format) and open it.
              </p>
            </div>
          )}
        </div>

        <div>
          <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left" onClick={() => toggle("trouble")}>
            <span className="text-sm font-medium">Troubleshooting</span>
            {openSection === "trouble" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {openSection === "trouble" && (
            <div className="px-5 pb-4 space-y-2">
              {[
                {
                  q: "Shows \"Unknown Caller\" for a known contact",
                  a: "The phone number isn't saved on that contact record. Open the contact in Contacts and add their phone number. Numbers are normalized to E.164 — make sure to include the country code (+1 for US)."
                },
                {
                  q: "Phone number format doesn't match",
                  a: "NEXUS stores numbers in E.164 (+1XXXXXXXXXX). Make sure the number sent by RingEX includes the country code. If it arrives without a +1 prefix, the lookup will fail."
                },
                {
                  q: "Call pop doesn't open automatically",
                  a: "Check that your browser allows pop-ups from this site. Some soft phone apps open URLs in a dedicated window — check your RingEX desktop app settings for a \"Screen Pop\" or \"Browser pop-up\" option."
                },
                {
                  q: "Call pop shows a login page",
                  a: "Your NEXUS session expired (sessions last 8 hours). Sign back in. Keep a NEXUS tab open in your browser to maintain the session throughout the day."
                },
              ].map(({ q, a }) => (
                <div key={q} className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium mb-1">{q}</p>
                  <p className="text-xs text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <Link href="/calls">
          <Button variant="ghost" size="sm" className="gap-2 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Call Log
          </Button>
        </Link>
        <p className="text-xs text-muted-foreground">Navigate to /call-pop?phone=+1... to trigger a pop</p>
      </div>
    </div>
  );
}

export function CallPopPage() {
  const [location] = useLocation();
  const phone = parsePhone(window.location.search);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/calls/pop", phone],
    queryFn: async () => {
      if (!phone) return null;
      const res = await fetch(`/api/calls/pop?phone=${encodeURIComponent(phone)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch caller info");
      return res.json() as Promise<{
        contact: { id: number; displayName: string; contactType: string; primaryEmail: string | null; primaryPhone: string | null } | null;
        phoneNumber: string;
      }>;
    },
    enabled: !!phone,
    refetchOnWindowFocus: false,
  });

  if (!phone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" data-testid="call-pop-setup">
        <SetupGuide />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6" data-testid="call-pop-screen">
      <div className="w-full max-w-sm bg-card border border-card-border rounded-xl shadow-lg overflow-hidden">
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Phone className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs opacity-70 uppercase tracking-wide">Incoming Call</p>
            <p className="font-semibold font-mono text-sm" data-testid="text-phone-number">{phone}</p>
          </div>
        </div>

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
                  <p className="font-semibold text-foreground" data-testid="text-contact-name">{data.contact.displayName}</p>
                  <Badge variant="secondary" className="text-xs mt-0.5">{data.contact.contactType}</Badge>
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
              <Link href="/contacts">
                <Button variant="outline" size="sm" className="w-full" data-testid="button-view-contact">View Contact</Button>
              </Link>
            )}
            <Link href="/issues">
              <Button variant="outline" size="sm" className="w-full" data-testid="button-create-issue">Create Issue</Button>
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
