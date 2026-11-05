"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHIP_KIND_LABEL, type ParsedImport } from "@/lib/work-library/activity-database-import";
import {
  commitImport, downloadTemplate, exportLibraryWorkbook, parseWorkbookFile, previewImport,
  type ActivityAction, type ChipAction, type ImportPreview, type ImportResult, type LinkAction,
} from "@/lib/work-library/activity-import-service";
import { errorMessage } from "./work-library-shared";

const ACTION_LABEL: Record<ActivityAction, string> = { create: "Create", update: "Update", update_catalogue: "Update catalogue fields only" };
const LINK_LABEL: Record<LinkAction, string> = {
  create: "Create", update: "Update", exists: "Already linked", skip_not_draft: "Skipped: not a draft", unknown_activity: "Unknown activity", unknown_work_item: "Unknown work item",
};
const LINK_BAD: LinkAction[] = ["skip_not_draft", "unknown_activity", "unknown_work_item"];
const CHIP_LABEL: Record<ChipAction, string> = { create: "Create", exists: "Already linked", unknown_activity: "Unknown activity", unknown_code: "Unknown code" };
const CHIP_BAD: ChipAction[] = ["unknown_activity", "unknown_code"];

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ImportActivitiesDialog({
  db, onClose, onDone,
}: { db: SupabaseClient; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"read" | "commit" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function saveTemplate() {
    saveBlob(downloadTemplate(), "construction-work-library-template.xlsx");
  }

  /** The current library in the import layout, to edit in Excel and import back. */
  async function exportLibrary() {
    setBusy("export");
    try {
      saveBlob(await exportLibraryWorkbook(db), "construction-work-library-" + new Date().toISOString().slice(0, 10) + ".xlsx");
    } catch (e) { toast.error(errorMessage(e, "Could not export the library")); } finally { setBusy(null); }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setParsed(null); setPreview(null); setResult(null); setError(null);
    setBusy("read");
    try {
      const p = await parseWorkbookFile(file, db);
      setParsed(p);
      if (p.activities.length || p.links.length || p.chips.length) setPreview(await previewImport(db, p));
    } catch (e) {
      setError(errorMessage(e, "Could not read the file. Use the template (.xlsx)."));
    } finally { setBusy(null); }
  }

  async function commit() {
    if (!parsed) return;
    setBusy("commit");
    try {
      const r = await commitImport(db, parsed);
      setResult(r);
      toast.success(`Import done: ${r.created} created, ${r.updated + r.cataloguedOnly} updated, ${r.linksWritten} BOQ links, ${r.chipsWritten} chip links`);
      onDone();
    } catch (e) { toast.error(errorMessage(e, "Import failed")); } finally { setBusy(null); }
  }

  const c = preview?.counts;
  const nothing = !preview || (preview.activities.length === 0 && preview.links.length === 0 && preview.chips.length === 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && busy !== "commit") onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import activities</DialogTitle>
          <DialogDescription>
            Upload an .xlsx with Activities, BOQ links and (optional) Chip links sheets. Existing activities are matched by visible code or code; locked (non-draft) activities only get their catalogue fields and chip links (packages, method statements, materials and so on) updated. Links are only added, never removed.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveTemplate}><Download className="mr-1 h-4 w-4" /> Download template</Button>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void exportLibrary()} title="The current library in this layout: edit it and import it back">
              {busy === "export" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Export library
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void choose(f); }} />
            <Button size="sm" disabled={busy !== null || result !== null} onClick={() => fileRef.current?.click()}>
              {busy === "read" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
              Choose .xlsx file
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {parsed && parsed.errors.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-destructive">{parsed.errors.length} row problem{parsed.errors.length === 1 ? "" : "s"} in the file</h3>
              <div className="max-h-44 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead className="w-16">Row</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsed.errors.map((e, i) => (
                      <TableRow key={i}><TableCell>{e.sheet}</TableCell><TableCell>{e.row}</TableCell><TableCell>{e.message}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Rows with problems are left out; the rest can still be imported.</p>
            </section>
          )}

          {parsed && nothing && !error && busy === null && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No valid rows found in this file. Check the sheet and column names against the template.</p>
          )}

          {preview && c && !result && !nothing && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Activities to create" value={c.create} />
                <Stat label="Activities to update" value={c.update} />
                <Stat label="Catalogue-only updates" value={c.updateCatalogue} />
                <Stat label="BOQ links to create" value={c.linksCreate} />
                <Stat label="BOQ links to update" value={c.linksUpdate} />
                <Stat label="BOQ links skipped" value={c.linksSkipped} />
                <Stat label="Chip links to create" value={c.chipsCreate} />
                <Stat label="Chip links already there" value={c.chipsExisting} />
                <Stat label="Chip links skipped" value={c.chipsSkipped} />
              </div>

              {preview.unknownWorkItemCodes.length > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  {preview.unknownWorkItemCodes.length} work item code{preview.unknownWorkItemCodes.length === 1 ? " is" : "s are"} not in the cost library and will be skipped:{" "}
                  <span className="font-mono text-xs">{preview.unknownWorkItemCodes.slice(0, 20).join(", ")}{preview.unknownWorkItemCodes.length > 20 ? ", ..." : ""}</span>
                </p>
              )}

              {preview.unknownChipCodes.length > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  {preview.unknownChipCodes.length} chip code{preview.unknownChipCodes.length === 1 ? " is" : "s are"} not in their library and will be skipped:{" "}
                  <span className="font-mono text-xs">{preview.unknownChipCodes.slice(0, 20).join(", ")}{preview.unknownChipCodes.length > 20 ? ", ..." : ""}</span>
                </p>
              )}

              {preview.activities.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Activities ({preview.activities.length})</h3>
                  <div className="max-h-56 overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader><TableRow><TableHead className="w-14">Row</TableHead><TableHead>Visible code / code</TableHead><TableHead>Name</TableHead><TableHead>Hierarchy (new)</TableHead><TableHead>Action</TableHead><TableHead>Not applied (locked)</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {preview.activities.map((a) => (
                          <TableRow key={a.row}>
                            <TableCell>{a.row}</TableCell>
                            <TableCell className="font-mono text-xs">{a.visibleCode ?? a.code ?? "auto"}</TableCell>
                            <TableCell>{a.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.action === "create" ? (a.hierarchy ?? "-") : "-"}</TableCell>
                            <TableCell><Badge variant={a.action === "create" ? "default" : "secondary"}>{ACTION_LABEL[a.action]}</Badge>{a.existingStatus && a.action !== "create" ? <span className="ml-1 text-xs text-muted-foreground">({a.existingStatus})</span> : null}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.skippedFields.length ? a.skippedFields.join(", ") : "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {preview.links.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold">BOQ links ({preview.links.length})</h3>
                  <div className="max-h-56 overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader><TableRow><TableHead className="w-14">Row</TableHead><TableHead>Activity</TableHead><TableHead>Work item</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {preview.links.map((l) => (
                          <TableRow key={`${l.row}-${l.workItemCode}`}>
                            <TableCell>{l.row}</TableCell>
                            <TableCell className="font-mono text-xs">{l.activityRef}</TableCell>
                            <TableCell className="font-mono text-xs">{l.workItemCode}</TableCell>
                            <TableCell>
                              <Badge variant={LINK_BAD.includes(l.action) ? "destructive" : l.action === "create" ? "default" : "secondary"}>{LINK_LABEL[l.action]}</Badge>
                              {l.note && <span className="ml-1 text-xs text-muted-foreground">{l.note}</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {preview.chips.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Chip links ({preview.chips.length})</h3>
                  <div className="max-h-56 overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader><TableRow><TableHead className="w-14">Row</TableHead><TableHead>Activity</TableHead><TableHead>Kind</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {preview.chips.map((ch, i) => (
                          <TableRow key={ch.row + "-" + ch.kind + "-" + ch.code + "-" + i}>
                            <TableCell>{ch.row}</TableCell>
                            <TableCell className="font-mono text-xs">{ch.activityRef}</TableCell>
                            <TableCell>{CHIP_KIND_LABEL[ch.kind]}</TableCell>
                            <TableCell className="font-mono text-xs">{ch.code}</TableCell>
                            <TableCell>
                              <Badge variant={CHIP_BAD.includes(ch.action) ? "destructive" : ch.action === "create" ? "default" : "secondary"}>{CHIP_LABEL[ch.action]}</Badge>
                              {ch.note && <span className="ml-1 text-xs text-muted-foreground">{ch.note}</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}
            </>
          )}

          {result && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Import complete</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <Stat label="Created" value={result.created} />
                <Stat label="Updated" value={result.updated} />
                <Stat label="Catalogue-only" value={result.cataloguedOnly} />
                <Stat label="BOQ links written" value={result.linksWritten} />
                <Stat label="BOQ links skipped" value={result.linksSkipped} />
                <Stat label="Chip links written" value={result.chipsWritten} />
                <Stat label="Chip links skipped" value={result.chipsSkipped} />
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-44 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead className="w-16">Row</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {result.errors.map((e, i) => (<TableRow key={i}><TableCell>{e.sheet}</TableCell><TableCell>{e.row}</TableCell><TableCell>{e.message}</TableCell></TableRow>))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy === "commit"}>Cancel</Button>
              <Button disabled={nothing || busy !== null} onClick={() => void commit()}>
                {busy === "commit" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Commit import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
