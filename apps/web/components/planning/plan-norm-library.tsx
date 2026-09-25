"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FlaskConical, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { deleteNorm, getProjectCalendarRow, listNorms, type Norm } from "@/lib/planning/productivity-service";
import { outputPerCrewDay, roundTo } from "@/lib/planning/work-engine";
import { cn } from "@/lib/utils";
import { PlanNormDialog } from "./plan-norm-dialog";
import { PlanNormDwlImportDialog } from "./plan-norm-dwl-import-dialog";
import { PlanCalibrateNormDialog } from "./plan-calibrate-norm-dialog";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  retired: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
};

function crewSummary(n: Norm): string {
  const labour = n.crew.filter((c) => c.kind === "labor");
  if (labour.length === 0) return "—";
  const total = labour.reduce((s, c) => s + c.workers_per_crew, 0);
  const parts = labour.map((c) => `${c.workers_per_crew}`).join(" + ");
  return labour.length > 1 ? `${parts} = ${roundTo(total, 2)}` : `${roundTo(total, 2)}`;
}

export function PlanNormLibrary() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { can, loaded: permsLoaded } = usePlanningPermissions();
  const [norms, setNorms] = useState<Norm[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("all");
  const [editing, setEditing] = useState<Norm | null | undefined>(undefined); // undefined = closed, null = new
  const [importing, setImporting] = useState(false);
  const [calibrating, setCalibrating] = useState<Norm | null>(null);

  const canView = can("norms", "view");
  const canCreate = can("norms", "can_create");
  const canEdit = can("norms", "edit");
  const canApprove = can("norms", "approve");
  const canDelete = can("norms", "delete");
  const canConfigureCompany = can("norms", "configure");

  const load = useCallback(async () => {
    if (!selectedProjectId) { setNorms([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [list, cal] = await Promise.all([listNorms(selectedProjectId), getProjectCalendarRow(selectedProjectId)]);
      setNorms(list);
      const h = Number(cal.calendar?.hours_per_day);
      setHoursPerDay(h > 0 ? h : 8);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  const existingCodes = useMemo(() => new Set(norms.map((n) => n.code.toLowerCase())), [norms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return norms.filter((n) =>
      (status === "all" || n.status === status) &&
      (scope === "all" || (scope === "company" ? n.project_id === null : n.project_id !== null)) &&
      (!q || `${n.code} ${n.name} ${n.trade ?? ""} ${n.discipline ?? ""}`.toLowerCase().includes(q)),
    );
  }, [norms, search, status, scope]);

  async function remove(n: Norm) {
    if (!window.confirm(`Delete norm ${n.code}? Tasks using it will lose their norm.`)) return;
    try {
      await deleteNorm(n.id);
      toast.success("Norm deleted");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (projectLoading || !permsLoaded || loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to manage productivity norms.</p>;
  if (!canView) return <p className="py-10 text-center text-sm text-muted-foreground">You do not have access to productivity norms.</p>;

  const counts = { draft: norms.filter((n) => n.status === "draft").length, approved: norms.filter((n) => n.status === "approved").length };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search code, name, trade…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="rounded-md border border-border bg-background px-2.5 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="retired">Retired</option>
        </select>
        <select className="rounded-md border border-border bg-background px-2.5 py-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Company + project</option><option value="company">Company library</option><option value="project">This project</option>
        </select>
        <span className="text-xs text-muted-foreground">{counts.approved} approved · {counts.draft} draft</span>
        <div className="ml-auto flex gap-2">
          {canCreate && (
            <button type="button" onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Import from DWL
            </button>
          )}
          {canCreate && (
            <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> New norm
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Library</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 text-right font-medium">Man-hrs / unit</th>
              <th className="px-3 py-2 text-right font-medium">Crew (workers)</th>
              <th className="px-3 py-2 text-right font-medium">Output / crew-day</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => {
              const workers = n.crew.filter((c) => c.kind === "labor").reduce((s, c) => s + c.workers_per_crew, 0);
              const out = outputPerCrewDay({ labourConstantHrPerUnit: n.labour_constant_hr_per_unit, crewWorkers: workers, hoursPerDay: n.hours_per_day_basis });
              return (
                <tr key={n.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40" onClick={() => setEditing(n)}>
                  <td className="px-3 py-2 font-medium">{n.code}</td>
                  <td className="px-3 py-2">
                    <span className="block">{n.name}</span>
                    {(n.trade || n.discipline) && <span className="text-xs text-muted-foreground">{[n.trade, n.discipline].filter(Boolean).join(" · ")}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{n.project_id ? (n.source_norm_id ? "Project override" : "Project") : "Company"}</td>
                  <td className="px-3 py-2">{n.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{roundTo(n.labour_constant_hr_per_unit, 4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{crewSummary(n)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{out !== null ? `${roundTo(out, 2)} ${n.unit}` : "—"}</td>
                  <td className="px-3 py-2"><span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_STYLE[n.status])}>{n.status}</span></td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {canCreate && n.status === "approved" && (
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Propose calibrated norm from site logs" onClick={() => setCalibrating(n)}><FlaskConical className="h-4 w-4" /></button>
                      )}
                      {canDelete && n.status !== "approved" && (
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400" title="Delete" onClick={() => remove(n)}><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {norms.length === 0 ? "No productivity norms yet. Create one, or import from the Direct Works Library." : "No norms match the filters."}
          </p>
        )}
      </div>

      {editing !== undefined && (
        <PlanNormDialog
          key={editing?.id ?? "new"}
          projectId={selectedProjectId}
          norm={editing}
          canEdit={canEdit}
          canCreate={canCreate}
          canApprove={canApprove}
          canConfigureCompany={canConfigureCompany}
          onClose={() => setEditing(undefined)}
          onSaved={() => void load()}
        />
      )}
      {importing && (
        <PlanNormDwlImportDialog
          projectId={selectedProjectId}
          existingCodes={existingCodes}
          canConfigureCompany={canConfigureCompany}
          hoursPerDay={hoursPerDay}
          onClose={() => setImporting(false)}
          onImported={() => void load()}
        />
      )}
      {calibrating && (
        <PlanCalibrateNormDialog
          norm={calibrating}
          projectId={selectedProjectId}
          onClose={() => setCalibrating(null)}
          onProposed={() => void load()}
        />
      )}
    </div>
  );
}
