"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createNormFromDwlDraft,
  listDwlAssemblyCandidates,
  listDwlWorkItemCandidates,
} from "@/lib/planning/productivity-service";
import {
  deriveNormFromAssembly,
  deriveNormFromWorkItem,
  type DraftNorm,
  type ImportResult,
} from "@/lib/planning/dwl-norm-import";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  /** Codes that already exist (this project + company), so an item is not imported twice. */
  existingCodes: Set<string>;
  canConfigureCompany: boolean;
  hoursPerDay: number;
  onClose: () => void;
  onImported: () => void;
}

interface Candidate {
  key: string;
  kind: "work item" | "assembly";
  code: string;
  description: string;
  unit: string;
  result: ImportResult;
  exists: boolean;
}

export function PlanNormDwlImportDialog({ projectId, existingCodes, canConfigureCompany, hoursPerDay, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"project" | "company">("project");
  const [showBlocked, setShowBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDwlWorkItemCandidates(), listDwlAssemblyCandidates()])
      .then(([items, assemblies]) => {
        if (cancelled) return;
        const list: Candidate[] = [
          ...items.map((i) => ({
            key: `wi:${i.id}`, kind: "work item" as const, code: i.code, description: i.description, unit: i.unit,
            result: deriveNormFromWorkItem(i, hoursPerDay), exists: existingCodes.has(i.code.toLowerCase()),
          })),
          ...assemblies.map((a) => ({
            key: `as:${a.id}`, kind: "assembly" as const, code: a.code, description: a.description, unit: a.unit,
            result: deriveNormFromAssembly(a, hoursPerDay), exists: existingCodes.has(a.code.toLowerCase()),
          })),
        ];
        setCandidates(list);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hoursPerDay, existingCodes]);

  const importable = useMemo(() => candidates.filter((c) => c.result.ok), [candidates]);
  const blocked = useMemo(() => candidates.filter((c) => !c.result.ok), [candidates]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function run() {
    const chosen = candidates.filter((c) => selected.has(c.key) && c.result.ok && !c.exists);
    if (chosen.length === 0) { toast.error("Select at least one item to import."); return; }
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const c of chosen) {
      try {
        await createNormFromDwlDraft(scope === "company" ? null : projectId, (c.result as { ok: true; norm: DraftNorm }).norm);
        done++;
      } catch (e) {
        failures.push(`${c.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(false);
    if (done > 0) toast.success(`${done} draft norm${done === 1 ? "" : "s"} created — review and approve them before use`);
    if (failures.length > 0) toast.error(failures.join("\n"));
    if (done > 0) { onImported(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Import norms from the Direct Works Library</h2>
            <p className="text-[11px] text-muted-foreground">
              Only recipes with real labour time (days or hours per unit) and assemblies with a crew and daily output can be imported.
              Placeholder rows are shown as blocked. Everything imported is a <strong>draft</strong> for you to review.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-background"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto p-4 text-xs">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the library…</div>
          ) : (
            <>
              <p className="mb-2 text-muted-foreground">
                <strong className="text-foreground">{importable.length}</strong> importable · <strong className="text-foreground">{blocked.length}</strong> blocked
                {" "}(hours per day used for recipes given in days: {hoursPerDay}).
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                {importable.map((c) => {
                  const r = c.result as { ok: true; norm: DraftNorm };
                  return (
                    <label key={c.key} className={cn("flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/40", c.exists && "opacity-50")}>
                      <input type="checkbox" className="mt-1" disabled={c.exists} checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-foreground">{c.code} <span className="font-normal text-muted-foreground">— {c.description}</span></span>
                        <span className="block text-muted-foreground">
                          {c.kind} · per {c.unit} · <strong className="text-foreground">{r.norm.labourConstantHrPerUnit} man-hours</strong>
                          {" "}· crew {r.norm.crew.map((x) => `${x.workersPerCrew} ${x.roleLabel}`).join(" + ")}
                        </span>
                        {r.norm.legacyUnvalidated && (
                          <span className="mt-0.5 flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" /> Legacy library value — provenance unknown, never validated</span>
                        )}
                        {c.exists && <span className="text-muted-foreground">Already in the library (same code)</span>}
                      </span>
                      {!c.exists && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
                    </label>
                  );
                })}
                {importable.length === 0 && <p className="px-3 py-6 text-center text-muted-foreground">Nothing in the library can be imported yet.</p>}
              </div>

              {blocked.length > 0 && (
                <div className="mt-3">
                  <button type="button" className="text-primary hover:underline" onClick={() => setShowBlocked((v) => !v)}>
                    {showBlocked ? "Hide" : "Show"} {blocked.length} blocked item{blocked.length === 1 ? "" : "s"} and why
                  </button>
                  {showBlocked && (
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
                      {blocked.map((c) => (
                        <div key={c.key} className="flex items-start gap-2 border-b border-border px-3 py-1.5 last:border-0">
                          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="font-medium text-foreground">{c.code}</span> <span className="text-muted-foreground">{c.description}</span>
                            <span className="block text-muted-foreground">{!c.result.ok ? c.result.reason : ""}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Import into</span>
            <select className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={scope} onChange={(e) => setScope(e.target.value as "project" | "company")}>
              <option value="project">This project</option>
              <option value="company" disabled={!canConfigureCompany}>Company library{canConfigureCompany ? "" : " (needs configure right)"}</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={run} disabled={busy || selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Import {selected.size || ""} as draft{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
