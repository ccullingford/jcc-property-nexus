
  import { useState, useRef } from "react";
  import { useMutation } from "@tanstack/react-query";
  import { queryClient, apiRequest } from "@/lib/queryClient";
  import { Button } from "@/components/ui/button";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
  import { Label } from "@/components/ui/label";
  import { useToast } from "@/hooks/use-toast";
  import { Upload, AlertTriangle } from "lucide-react";

  
  export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map(line => {
      const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    }).filter(r => Object.values(r).some(v => v));
    return { headers, rows };
  }

  export function autoDetectMapping(headers: string[]): Record<string, string> {
    const lc = headers.map(h => h.toLowerCase());
    const find = (...variants: string[]) => {
      const h = lc.find(h => variants.some(v => h.includes(v)));
      return h ? headers[lc.indexOf(h)] : "";
    };
    return {
      displayName: find("display_name", "name", "full name", "fullname"),
      firstName: find("first_name", "firstname", "first"),
      lastName: find("last_name", "lastname", "last"),
      primaryEmail: find("email", "primary_email", "e-mail"),
      secondaryEmail: find("secondary_email", "email2", "alt_email"),
      primaryPhone: find("phone", "primary_phone", "mobile"),
      secondaryPhone: find("secondary_phone", "phone2", "alt_phone"),
      contactType: find("type", "contact_type", "category"),
      notes: find("notes", "note", "comments"),
    };
  }
  

  export const CONTACT_IMPORT_SYSTEM_FIELDS = [
    { key: "displayName", label: "Display Name *" },
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "primaryEmail", label: "Primary Email" },
    { key: "secondaryEmail", label: "Secondary Email" },
    { key: "primaryPhone", label: "Primary Phone" },
    { key: "secondaryPhone", label: "Secondary Phone" },
    { key: "contactType", label: "Contact Type" },
    { key: "notes", label: "Notes" },
  ];

  export function ImportWizardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState(1);
    const [filename, setFilename] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [mode, setMode] = useState<"create" | "upsert">("upsert");
    const [preview, setPreview] = useState<any>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFilename(file.name);
      const reader = new FileReader();
      reader.onload = evt => {
        const { headers, rows } = parseCSV(evt.target?.result as string);
        setHeaders(headers);
        setRows(rows);
        setMapping(autoDetectMapping(headers));
        setStep(2);
      };
      reader.readAsText(file);
    };

    const previewMutation = useMutation({
      mutationFn: () => apiRequest("POST", "/api/contacts/import/preview", { rows, mapping }).then(r => r.json()),
      onSuccess: (data) => { setPreview(data); setStep(3); },
      onError: (e: Error) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
    });

    const executeMutation = useMutation({
      mutationFn: () => apiRequest("POST", "/api/contacts/import/execute", { rows, mapping, mode, filename }).then(r => r.json()),
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        toast({ title: `Import complete: ${data.imported} created, ${data.updated} updated, ${data.skipped} skipped` });
        onClose();
        reset();
      },
      onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
    });

    const reset = () => { setStep(1); setFilename(""); setHeaders([]); setRows([]); setMapping({}); setPreview(null); if (fileRef.current) fileRef.current.value = ""; };

    return (
      <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import Contacts — Step {step} of 3
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="py-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                data-testid="csv-drop-zone"
              >
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">Click to select a CSV file</p>
                <p className="text-xs text-muted-foreground">Supports: display_name, email, phone, contact_type, notes and more</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} data-testid="input-csv-file" />
            </div>
          )}

          {step === 2 && (
            <div className="py-2 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{rows.length} rows detected in <span className="font-medium text-foreground">{filename}</span></span>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map CSV columns to fields</p>
                {CONTACT_IMPORT_SYSTEM_FIELDS.map(f => (
                  <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                    <label className="text-xs text-foreground">{f.label}</label>
                    <Select value={mapping[f.key] ?? ""} onValueChange={v => setMapping(prev => ({ ...prev, [f.key]: v }))}>
                      <SelectTrigger className="h-7 text-xs" data-testid={`mapping-${f.key}`}><SelectValue placeholder="— skip —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— skip —</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Import mode</Label>
                  <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                    <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create">Create new only</SelectItem>
                      <SelectItem value="upsert">Create or update by email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={reset}>Back</Button>
                <Button size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="button-preview-import">
                  {previewMutation.isPending ? "Previewing…" : "Preview →"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 3 && preview && (
            <div className="py-2 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.valid.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Valid rows</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-amber-500">{preview.existingMatches.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Will update</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{preview.invalid.length + preview.duplicatesInFile.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Skipped/Invalid</p>
                </div>
              </div>
              {(preview.invalid.length > 0 || preview.duplicatesInFile.length > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Issues found
                  </p>
                  {[...preview.invalid, ...preview.duplicatesInFile].slice(0, 5).map((row: any, i: number) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">Row {row.rowIndex + 1}: {row.error}</p>
                  ))}
                  {(preview.invalid.length + preview.duplicatesInFile.length) > 5 && (
                    <p className="text-xs text-amber-600">…and {preview.invalid.length + preview.duplicatesInFile.length - 5} more</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button>
                <Button size="sm" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending || preview.valid.length === 0} data-testid="button-execute-import">
                  {executeMutation.isPending ? "Importing…" : `Import ${preview.valid.length} contacts`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }
  