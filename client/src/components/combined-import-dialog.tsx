import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, CheckCircle2, AlertTriangle, XCircle, ChevronRight, Building2, MapPin, User, Link2 } from "lucide-react";
import { parseCSV } from "./contact-import-dialog";

const COMBINED_FIELDS: { key: string; label: string; group: string; hint?: string }[] = [
  { key: "assocName",       label: "Association Name",     group: "Association", hint: "Used to match or create the association" },
  { key: "assocCode",       label: "Association Code",     group: "Association" },
  { key: "assocAddress",    label: "Association Address",  group: "Association" },
  { key: "assocCity",       label: "Association City",     group: "Association" },
  { key: "assocState",      label: "Association State",    group: "Association" },
  { key: "assocPostalCode", label: "Association Zip",      group: "Association" },
  { key: "unitNumber",      label: "Unit Number",          group: "Unit",        hint: "Requires Association Name" },
  { key: "unitBuilding",    label: "Unit Building",        group: "Unit" },
  { key: "unitAddress",     label: "Unit Address",         group: "Unit" },
  { key: "contactDisplayName", label: "Contact Display Name", group: "Contact" },
  { key: "contactFirstName",   label: "Contact First Name",   group: "Contact" },
  { key: "contactLastName",    label: "Contact Last Name",    group: "Contact" },
  { key: "contactEmail",       label: "Contact Email",        group: "Contact", hint: "Used to match existing contacts" },
  { key: "contactPhone",       label: "Contact Phone",        group: "Contact", hint: "Used to match if no email" },
  { key: "contactType",        label: "Contact Type",         group: "Contact" },
  { key: "relationshipType",   label: "Relationship Type",    group: "Relationship", hint: "owner, tenant, vendor, board, property manager" },
];

const GROUPS = ["Association", "Unit", "Contact", "Relationship"];

const GROUP_ICONS: Record<string, any> = {
  Association: Building2,
  Unit: MapPin,
  Contact: User,
  Relationship: Link2,
};

function autoDetectCombinedMapping(headers: string[]): Record<string, string> {
  const lc = headers.map(h => h.toLowerCase().replace(/[\s_-]/g, ""));

  const byExact = (variant: string): string => {
    const v = variant.replace(/[\s_-]/g, "");
    const idx = lc.findIndex(h => h === v);
    return idx >= 0 ? headers[idx] : "";
  };
  const bySubstr = (variant: string): string => {
    const v = variant.replace(/[\s_-]/g, "");
    const idx = lc.findIndex(h => h.includes(v));
    return idx >= 0 ? headers[idx] : "";
  };
  const firstOf = (...candidates: Array<() => string>): string => {
    for (const c of candidates) { const r = c(); if (r) return r; }
    return "";
  };

  return {
    assocName:          firstOf(() => byExact("propertyname"), () => byExact("associationname"), () => byExact("assocname"), () => byExact("communityname"), () => byExact("property"), () => bySubstr("associationname"), () => bySubstr("assocname"), () => bySubstr("communityname")),
    assocCode:          firstOf(() => bySubstr("associationcode"), () => bySubstr("assoccode"), () => bySubstr("propertycode"), () => bySubstr("communitycode")),
    assocAddress:       firstOf(() => byExact("propertyaddress"), () => bySubstr("associationaddress"), () => bySubstr("assocaddress")),
    assocCity:          firstOf(() => byExact("propertycity"), () => bySubstr("associationcity"), () => bySubstr("assoccity")),
    assocState:         firstOf(() => byExact("propertystate"), () => bySubstr("associationstate"), () => bySubstr("assocstate")),
    assocPostalCode:    firstOf(() => byExact("propertyzip"), () => bySubstr("associationzip"), () => bySubstr("assoczip"), () => bySubstr("postalcode")),
    unitNumber:         firstOf(() => byExact("unit"), () => byExact("unitnumber"), () => byExact("apt"), () => bySubstr("unitnumber"), () => bySubstr("apartment")),
    unitBuilding:       firstOf(() => bySubstr("building"), () => bySubstr("bldg")),
    unitAddress:        firstOf(() => byExact("unitaddress"), () => bySubstr("unitstreet")),
    contactDisplayName: firstOf(() => byExact("homeowner"), () => byExact("owner"), () => byExact("displayname"), () => byExact("fullname"), () => bySubstr("displayname"), () => bySubstr("fullname"), () => bySubstr("contactname")),
    contactFirstName:   firstOf(() => byExact("firstname"), () => bySubstr("firstname")),
    contactLastName:    firstOf(() => byExact("lastname"), () => bySubstr("lastname")),
    contactEmail:       firstOf(() => byExact("emails"), () => byExact("email"), () => byExact("emailaddress"), () => bySubstr("emailaddress")),
    contactPhone:       firstOf(() => byExact("phonenumbers"), () => byExact("phones"), () => byExact("phone"), () => bySubstr("mobile"), () => bySubstr("cell")),
    contactType:        firstOf(() => byExact("homeownertype"), () => byExact("contacttype"), () => bySubstr("contacttype")),
    relationshipType:   firstOf(() => bySubstr("relationship"), () => bySubstr("relationshiptype"), () => bySubstr("role")),
  };
}

function downloadErrorCSV(rows: any[], headers: string[], results: any[]) {
  const errorResults = results.filter((r: any) => r.status === "error");
  if (errorResults.length === 0) return;

  const csvLines = [
    ["row_number", "error", ...headers].join(","),
    ...errorResults.map((r: any) => {
      const row = rows[r.rowIndex] ?? {};
      return [r.rowIndex + 1, `"${r.error ?? ""}"`, ...headers.map(h => `"${(row[h] ?? "").replace(/"/g, '""')}"`)]
        .join(",");
    }),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import_errors.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CombinedImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [executeResult, setExecuteResult] = useState<any>(null);

  const reset = () => {
    setStep(1); setFilename(""); setHeaders([]); setRows([]);
    setMapping({}); setPreview(null); setExecuteResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      const { headers, rows } = parseCSV(evt.target?.result as string);
      setHeaders(headers);
      setRows(rows);
      setMapping(autoDetectCombinedMapping(headers));
      setStep(2);
    };
    reader.readAsText(file);
  };

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/import/combined/preview", { rows, mapping }).then(r => r.json()),
    onSuccess: (data: any) => { setPreview(data); setStep(3); },
    onError: (e: Error) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/import/combined/execute", { rows: preview?.valid.map((r: any) => rows[r.rowIndex]), mapping, filename }).then(r => r.json()),
    onSuccess: (data: any) => {
      setExecuteResult(data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/associations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const updateMapping = (key: string, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (value === "__skip__") {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const totalSteps = 4;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Combined Import
            <Badge variant="secondary" className="ml-1 text-xs font-normal">Step {step} of {totalSteps}</Badge>
          </DialogTitle>
          <DialogDescription>
            Import associations, units, and contacts from a single CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Upload ──────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="py-4 space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                data-testid="combined-csv-drop-zone"
              >
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Click to select a CSV file</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  One row per contact. Include association and unit columns to link them automatically.
                </p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} data-testid="input-combined-csv" />
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supported columns</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {COMBINED_FIELDS.map(f => (
                    <p key={f.key} className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{f.label}</span>
                      {f.hint && <span className="ml-1 opacity-60">({f.hint})</span>}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Mapping ─────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="py-2 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{rows.length} rows</span> detected in {filename}. Map your CSV columns to the fields below.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setMapping(autoDetectCombinedMapping(headers))}
                  data-testid="button-reset-mapping"
                >
                  Reset to auto-detect
                </Button>
              </div>
              <div className="space-y-5">
                {GROUPS.map(group => {
                  const Icon = GROUP_ICONS[group];
                  const fields = COMBINED_FIELDS.filter(f => f.group === group);
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
                      </div>
                      <div className="space-y-1.5">
                        {fields.map(f => {
                          const mappedCol = mapping[f.key];
                          const sampleVal = mappedCol
                            ? rows.slice(0, 10).map(r => r[mappedCol]).find(v => v && v.trim())
                            : undefined;
                          return (
                          <div key={f.key} className="grid grid-cols-[1fr_160px_1fr] gap-2 items-center">
                            <div>
                              <label className="text-xs text-foreground">{f.label}</label>
                              {f.hint && <p className="text-xs text-muted-foreground/70">{f.hint}</p>}
                            </div>
                            <Select
                              value={mapping[f.key] ?? "__skip__"}
                              onValueChange={v => updateMapping(f.key, v)}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`mapping-${f.key}`}>
                                <SelectValue placeholder="— skip —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">— skip —</SelectItem>
                                {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground truncate" title={sampleVal}>
                              {sampleVal ? <span className="italic">{sampleVal}</span> : <span className="opacity-40">—</span>}
                            </p>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter className="pt-2 border-t">
                <Button variant="outline" size="sm" onClick={reset}>Start over</Button>
                <Button size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="button-combined-preview">
                  {previewMutation.isPending ? "Previewing…" : <>Preview <ChevronRight className="h-3.5 w-3.5 ml-1" /></>}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── STEP 3: Preview ─────────────────────────────────────────────── */}
          {step === 3 && preview && (
            <div className="py-2 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{preview.valid.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Valid rows</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-blue-500">{preview.uniqueAssocs}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Associations</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-violet-500">{preview.uniqueUnits}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Units</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{preview.contactRows}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Contacts</p>
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {preview.errors.length} row{preview.errors.length !== 1 ? "s" : ""} will be skipped
                  </p>
                  {preview.errors.slice(0, 8).map((r: any) => (
                    <p key={r.rowIndex} className="text-xs text-amber-700 dark:text-amber-400">
                      Row {r.rowIndex + 1}: {r.error}
                    </p>
                  ))}
                  {preview.errors.length > 8 && (
                    <p className="text-xs text-amber-600">…and {preview.errors.length - 8} more</p>
                  )}
                </div>
              )}

              {preview.valid.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview (first 8 rows)</p>
                  <ScrollArea className="h-52 rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Association</th>
                          <th className="text-left px-3 py-2 font-medium">Unit</th>
                          <th className="text-left px-3 py-2 font-medium">Contact</th>
                          <th className="text-left px-3 py-2 font-medium">Email</th>
                          <th className="text-left px-3 py-2 font-medium">Relationship</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.valid.slice(0, 8).map((r: any) => (
                          <tr key={r.rowIndex} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">{r.rowIndex + 1}</td>
                            <td className="px-3 py-1.5 truncate max-w-[120px]">{r.assocName || <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-3 py-1.5">{r.unitNumber || <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-3 py-1.5 truncate max-w-[120px]">{r.contactName || <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-3 py-1.5 truncate max-w-[140px]">{r.contactEmail || <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-3 py-1.5">{r.relationshipType || <span className="text-muted-foreground/50">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                  {preview.valid.length > 8 && (
                    <p className="text-xs text-muted-foreground">…and {preview.valid.length - 8} more valid rows</p>
                  )}
                </div>
              )}

              <DialogFooter className="pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => { setMapping(autoDetectCombinedMapping(headers)); setStep(2); }}>Back</Button>
                <Button
                  size="sm"
                  onClick={() => executeMutation.mutate()}
                  disabled={executeMutation.isPending || preview.valid.length === 0}
                  data-testid="button-combined-execute"
                >
                  {executeMutation.isPending ? "Importing…" : `Import ${preview.valid.length} rows`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── STEP 4: Results ─────────────────────────────────────────────── */}
          {step === 4 && executeResult && (
            <div className="py-2 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{executeResult.summary.created}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Created</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-blue-500">{executeResult.summary.updated}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Updated</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-muted-foreground">{executeResult.summary.skipped}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold text-red-500">{executeResult.summary.errors}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
                </div>
              </div>

              {executeResult.summary.errors > 0 && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 space-y-1">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      {executeResult.summary.errors} rows failed
                    </p>
                    {executeResult.results
                      .filter((r: any) => r.status === "error")
                      .slice(0, 5)
                      .map((r: any) => (
                        <p key={r.rowIndex} className="text-xs text-red-700 dark:text-red-400">
                          Row {r.rowIndex + 1}: {r.error}
                        </p>
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => downloadErrorCSV(rows, headers, executeResult.results)}
                    data-testid="button-download-errors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download error report
                  </Button>
                </div>
              )}

              {executeResult.summary.errors === 0 && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  All rows imported successfully.
                </div>
              )}

              <ScrollArea className="h-48 rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Contact</th>
                      <th className="text-left px-3 py-2 font-medium">Assoc</th>
                      <th className="text-left px-3 py-2 font-medium">Unit</th>
                      <th className="text-left px-3 py-2 font-medium">Contact</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {executeResult.results.map((r: any) => (
                      <tr key={r.rowIndex} className={`hover:bg-muted/30 ${r.status === "error" ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.rowIndex + 1}</td>
                        <td className="px-3 py-1.5 truncate max-w-[120px]">{r.contactName || "—"}</td>
                        <td className="px-3 py-1.5">
                          {r.assocAction ? <ActionBadge action={r.assocAction} /> : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.unitAction ? <ActionBadge action={r.unitAction} /> : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.contactAction ? <ActionBadge action={r.contactAction} /> : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={r.status} error={r.error} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>

              <DialogFooter className="pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => { onClose(); reset(); }}>Close</Button>
                <Button size="sm" onClick={reset} data-testid="button-import-another">
                  Import another file
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    matched: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors[action] ?? "bg-muted text-muted-foreground"}`}>
      {action}
    </span>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string }) {
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600" title={error}>
      <XCircle className="h-3 w-3" /> error
    </span>
  );
  if (status === "created") return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600">
      <CheckCircle2 className="h-3 w-3" /> created
    </span>
  );
  if (status === "updated") return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
      <CheckCircle2 className="h-3 w-3" /> updated
    </span>
  );
  return <span className="text-xs text-muted-foreground">skipped</span>;
}
