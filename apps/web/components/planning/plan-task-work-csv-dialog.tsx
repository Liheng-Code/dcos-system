"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { parseTaskWorkImportCsv, type TaskWorkImportError, type TaskWorkImportRow } from "@/lib/planning/task-work-csv";
import { writeTaskQuantities, type QuantityWrite } from "@/lib/planning/boq-mapping-service";
import { cn } from "@/lib/utils";

interface Props {
  taskIdByCode: Map<string, string>;
  onClose: () => void;
  onImported: () => void;
}

const TEMPLATE = "task_code,quantity,unit,reason\n03.01.02.01.01,100,m2,\n";

export function PlanTaskWorkCsvDialog({ taskIdByCode, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<TaskWorkImportRow[]>([]);
  const [errors, setErrors] = useState<TaskWorkImportError[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    setFileName(file.name);
    setReason(`Imported from ${file.name} on ${new Date().toISOString().slice(0, 10)}.`);
    file.text().then((text) => {
      const result = parseTaskWorkImportCsv(text, taskIdByCode);
      setRows(result.rows);
      setErrors(result.errors);
    }).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }

  async function commit() {
    if (rows.length === 0) { toast.error("Nothing to import."); return; }
    if (!reason.trim()) { toast.error("A reason is required for the import."); return; }
    setBusy(true);
    try {
      const writes: QuantityWrite[] = rows.map((r) => ({
        taskId: r.taskId,
        quantity: r.quantity,
        quantityUnit: r.unit,
        quantitySource: "import",
        tenderBoqItemId: null,
        qsBoqItemId: null,
        reason: r.reason ? `${reason.trim()} (${r.reason})` : reason.trim(),
      }));
      const { applied, failed } = await writeTaskQuantities(writes);
      if (applied > 0) toast.success(`${applied} task${applied === 1 ? "" : "s"} imported`);
      if (failed.length > 0) toast.error(`${failed.length} row${failed.length === 1 ? "" : "s"} failed:\n${failed.slice(0, 5).map((f) => f.message).join("\n")}`);
      if (applied > 0) { onImported(); onClose(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Import quantities from CSV</h2>
            <p className="text-[11px] text-muted-foreground">
              Columns: <code className="rounded bg-background px-1">task_code</code>, <code className="rounded bg-background px-1">quantity</code>, <code className="rounded bg-background px-1">unit</code>, optional <code className="rounded bg-background px-1">reason</code>.
              Every row is previewed before anything is written.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-background"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto p-4 text-xs">
          {!fileName ? (
            <div className="space-y-3">
              <button type="button" onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-muted-foreground hover:border-primary hover:text-primary">
                <Upload className="h-6 w-6" /> Click to choose a CSV file
              </button>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              <p className="text-muted-foreground">Template: <code className="rounded bg-background px-1 py-0.5">{TEMPLATE.split("\n")[0]}</code></p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                <strong className="text-foreground">{fileName}</strong> · <strong className="text-emerald-400">{rows.length}</strong> row{rows.length === 1 ? "" : "s"} ready
                {errors.length > 0 && <> · <strong className="text-amber-400">{errors.length}</strong> skipped</>}
              </p>
              {rows.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                  {rows.map((r) => (
                    <div key={r.line} className="flex items-center gap-2 border-b border-border px-2 py-1 last:border-0">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="w-32 shrink-0 font-medium">{r.taskCode}</span>
                      <span className="text-muted-foreground">{r.quantity.toLocaleString()} {r.unit}</span>
                    </div>
                  ))}
                </div>
              )}
              {errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/5">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 border-b border-amber-500/20 px-2 py-1 last:border-0">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span className="text-amber-300">Line {e.line}{e.taskCode ? ` (${e.taskCode})` : ""}: {e.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Reason (required — applied to every row; a row&apos;s own reason column, if any, is appended)
                </label>
                <textarea className={cn("w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary")} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button type="button" onClick={() => { setFileName(null); setRows([]); setErrors([]); if (inputRef.current) inputRef.current.value = ""; }} className="text-primary hover:underline">Choose a different file</button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
          <button type="button" onClick={commit} disabled={busy || rows.length === 0 || !reason.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Import {rows.length || ""} row{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
