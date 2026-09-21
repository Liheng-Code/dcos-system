"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  copyNormAsDraft,
  createNorm,
  setNormStatus,
  updateNorm,
  type Norm,
  type NormCrewLine,
  type NormInput,
} from "@/lib/planning/productivity-service";
import { labourConstantFromOutput, outputPerCrewDay, roundTo, tradeShares } from "@/lib/planning/work-engine";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  /** null = new norm. */
  norm: Norm | null;
  canEdit: boolean;
  canCreate: boolean;
  canApprove: boolean;
  /** May write company-library norms (planning/norms/configure). */
  canConfigureCompany: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT = "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60";
const LABEL = "text-[11px] font-semibold text-muted-foreground";

const UNITS = ["m3", "m2", "m", "kg", "t", "no", "hr", "ls"];

function emptyCrew(kind: "labor" | "equipment" = "labor"): NormCrewLine {
  return { kind, role_label: "", trade_code: null, dwl_resource_id: null, workers_per_crew: 1, hours_per_day: null, sort_order: 0 };
}

export function PlanNormDialog({ projectId, norm, canEdit, canCreate, canApprove, canConfigureCompany, onClose, onSaved }: Props) {
  const isNew = norm === null;
  const locked = !!norm && norm.status === "approved";
  const readOnly = !isNew && (!canEdit || locked || norm.status === "retired");

  const [code, setCode] = useState(norm?.code ?? "");
  const [name, setName] = useState(norm?.name ?? "");
  const [unit, setUnit] = useState(norm?.unit ?? "m3");
  const [trade, setTrade] = useState(norm?.trade ?? "");
  const [discipline, setDiscipline] = useState(norm?.discipline ?? "");
  const [activityKey, setActivityKey] = useState(norm?.activity_key ?? "");
  const [scope, setScope] = useState<"project" | "company">(norm ? (norm.project_id ? "project" : "company") : "project");
  const [hoursBasis, setHoursBasis] = useState(String(norm?.hours_per_day_basis ?? 8));
  const [efficiency, setEfficiency] = useState(String(norm?.efficiency_pct ?? 100));
  const [validFrom, setValidFrom] = useState(norm?.valid_from ?? "");
  const [validTo, setValidTo] = useState(norm?.valid_to ?? "");
  const [basisNote, setBasisNote] = useState(norm?.basis_note ?? "");
  const [crew, setCrew] = useState<NormCrewLine[]>(norm?.crew.length ? norm.crew : isNew ? [emptyCrew()] : []);

  // labour constant and crew output are two views of one number; whichever was typed last is the driver
  const [driver, setDriver] = useState<"lc" | "output">("lc");
  const [lcText, setLcText] = useState(norm ? String(norm.labour_constant_hr_per_unit) : "");
  const [outputText, setOutputText] = useState("");
  const [busy, setBusy] = useState(false);

  const labourWorkers = useMemo(
    () => crew.filter((c) => c.kind === "labor").reduce((s, c) => s + (Number(c.workers_per_crew) || 0), 0),
    [crew],
  );
  const hours = Number(hoursBasis) > 0 ? Number(hoursBasis) : 8;

  // the number that will be saved
  const lc = useMemo(() => {
    if (driver === "output") {
      return labourConstantFromOutput({ crewWorkers: labourWorkers, outputPerDay: Number(outputText), hoursPerDay: hours });
    }
    const v = Number(lcText);
    return v > 0 ? v : null;
  }, [driver, lcText, outputText, labourWorkers, hours]);

  const shownLc = driver === "lc" ? lcText : lc !== null ? String(roundTo(lc, 4)) : "";
  const derivedOutput = lc !== null ? outputPerCrewDay({ labourConstantHrPerUnit: lc, crewWorkers: labourWorkers, hoursPerDay: hours }) : null;
  const shownOutput = driver === "output" ? outputText : derivedOutput !== null ? String(roundTo(derivedOutput, 2)) : "";
  const shares = lc !== null ? tradeShares(crew.filter((c) => c.kind === "labor").map((c) => ({ roleLabel: c.role_label, workersPerCrew: Number(c.workers_per_crew) || 0 })), lc) : [];

  function updateCrew(i: number, patch: Partial<NormCrewLine>) {
    setCrew((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function validate(): string | null {
    if (!code.trim()) return "Code is required.";
    if (!name.trim()) return "Name is required.";
    if (!unit.trim()) return "Unit is required.";
    if (!basisNote.trim()) return "The basis note is required: say where this norm comes from.";
    if (lc === null || !(lc > 0)) return driver === "output" ? "Enter a crew output per day and at least one labour line." : "Labour constant must be more than 0.";
    if (!(Number(hoursBasis) > 0 && Number(hoursBasis) <= 24)) return "Hours per day must be between 0 and 24.";
    const eff = Number(efficiency);
    if (!(eff > 0 && eff <= 200)) return "Efficiency must be between 0 and 200%.";
    for (const c of crew) {
      if (!c.role_label.trim()) return "Every crew line needs a name.";
      if (!(Number(c.workers_per_crew) > 0)) return `Crew line "${c.role_label}" needs a size above 0.`;
    }
    if (validFrom && validTo && validTo < validFrom) return "'Valid to' is before 'valid from'.";
    return null;
  }

  function buildInput(): NormInput {
    return {
      code: code.trim(),
      name: name.trim(),
      trade: trade.trim() || null,
      discipline: discipline.trim() || null,
      activity_key: activityKey.trim() || null,
      unit: unit.trim(),
      labour_constant_hr_per_unit: roundTo(lc as number, 4),
      hours_per_day_basis: Number(hoursBasis),
      efficiency_pct: Number(efficiency),
      source: norm?.source ?? "manual",
      dwl_work_item_id: norm?.dwl_work_item_id ?? null,
      dwl_assembly_id: norm?.dwl_assembly_id ?? null,
      basis_note: basisNote.trim(),
      valid_from: validFrom || null,
      valid_to: validTo || null,
      source_norm_id: norm?.source_norm_id ?? null,
    };
  }

  const cleanCrew = () => crew.map((c, i) => ({ ...c, sort_order: i, role_label: c.role_label.trim(), workers_per_crew: Number(c.workers_per_crew) }));

  async function run(action: "save" | "approve") {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      let id = norm?.id;
      if (isNew) {
        id = await createNorm(scope === "company" ? null : projectId, buildInput(), cleanCrew());
      } else {
        await updateNorm(norm!.id, buildInput(), cleanCrew());
      }
      if (action === "approve") await setNormStatus(id!, "approved");
      toast.success(action === "approve" ? "Norm approved" : isNew ? "Norm created as a draft" : "Norm saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: "draft" | "retired") {
    setBusy(true);
    try {
      await setNormStatus(norm!.id, status);
      toast.success(status === "retired" ? "Norm retired" : "Norm returned to draft");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveCopy() {
    if (!norm) return;
    setBusy(true);
    try {
      // a project override keeps the code (codes are unique per scope); a company copy gets a suffix
      const toProject = norm.project_id === null;
      await copyNormAsDraft(norm, toProject ? projectId : norm.project_id, toProject ? norm.code : `${norm.code}-COPY`);
      toast.success(toProject ? "Project copy created as a draft" : "Copy created as a draft");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const title = isNew ? "New productivity norm" : locked ? `${norm.code} (approved, locked)` : norm.code;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-bold leading-tight text-foreground">
              {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />} {title}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Man-hours of the whole crew per unit of output. Approved norms are locked — retire one or save a copy to change it.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-background"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className={LABEL}>Code *</span>
              <input className={INPUT} value={code} onChange={(e) => setCode(e.target.value)} disabled={readOnly} placeholder="e.g. STR-CONC-COL" /></label>
            <label className="col-span-2 block"><span className={LABEL}>Name *</span>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder="Vibrated concrete C30 in columns" /></label>
            <label className="block"><span className={LABEL}>Output unit *</span>
              <input className={INPUT} list="norm-units" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={readOnly} />
              <datalist id="norm-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist></label>
            <label className="block"><span className={LABEL}>Trade</span>
              <input className={INPUT} value={trade} onChange={(e) => setTrade(e.target.value)} disabled={readOnly} placeholder="Concrete" /></label>
            <label className="block"><span className={LABEL}>Discipline</span>
              <input className={INPUT} value={discipline} onChange={(e) => setDiscipline(e.target.value)} disabled={readOnly} placeholder="Structural" /></label>
            <label className="col-span-2 block"><span className={LABEL}>Matches task names containing (optional)</span>
              <input className={INPUT} value={activityKey} onChange={(e) => setActivityKey(e.target.value)} disabled={readOnly} placeholder="Column Concrete" /></label>
            {isNew && (
              <label className="block"><span className={LABEL}>Library</span>
                <select className={INPUT} value={scope} onChange={(e) => setScope(e.target.value as "project" | "company")}>
                  <option value="project">This project only</option>
                  <option value="company" disabled={!canConfigureCompany}>Company library{canConfigureCompany ? "" : " (needs configure right)"}</option>
                </select></label>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Crew</p>
            <div className="space-y-2">
              {crew.map((c, i) => (
                <div key={i} className="grid grid-cols-[100px_1fr_110px_28px] items-center gap-2">
                  <select className={cn(INPUT, "mt-0")} value={c.kind} disabled={readOnly}
                    onChange={(e) => updateCrew(i, { kind: e.target.value as "labor" | "equipment" })}>
                    <option value="labor">Labour</option>
                    <option value="equipment">Equipment</option>
                  </select>
                  <input className={cn(INPUT, "mt-0")} value={c.role_label} disabled={readOnly} placeholder={c.kind === "labor" ? "e.g. General laborer" : "e.g. Poker vibrator"}
                    onChange={(e) => updateCrew(i, { role_label: e.target.value })} />
                  <input className={cn(INPUT, "mt-0")} type="number" min="0" step="0.1" value={c.workers_per_crew} disabled={readOnly}
                    onChange={(e) => updateCrew(i, { workers_per_crew: e.target.value as unknown as number })} title={c.kind === "labor" ? "Workers per crew" : "Units per crew"} />
                  {!readOnly ? (
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400" onClick={() => setCrew((p) => p.filter((_, idx) => idx !== i))} title="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : <span />}
                </div>
              ))}
              {crew.length === 0 && <p className="text-muted-foreground">No crew lines. Duration for a planned crew cannot be derived without a labour crew.</p>}
            </div>
            {!readOnly && (
              <div className="mt-2 flex gap-3">
                <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setCrew((p) => [...p, emptyCrew("labor")])}><Plus className="h-3 w-3" /> Labour</button>
                <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setCrew((p) => [...p, emptyCrew("equipment")])}><Plus className="h-3 w-3" /> Equipment</button>
              </div>
            )}
            <p className="mt-2 text-muted-foreground">Labour crew total: <strong className="text-foreground">{roundTo(labourWorkers, 2)}</strong> workers. Equipment is listed for resource planning but does not count as labour.</p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <label className="block"><span className={LABEL}>Man-hours per {unit || "unit"} *</span>
              <input className={INPUT} type="number" min="0" step="any" value={shownLc} disabled={readOnly}
                onChange={(e) => { setDriver("lc"); setLcText(e.target.value); }} /></label>
            <label className="block"><span className={LABEL}>…or crew output per day ({unit || "unit"})</span>
              <input className={INPUT} type="number" min="0" step="any" value={shownOutput} disabled={readOnly || labourWorkers <= 0}
                onChange={(e) => { setDriver("output"); setOutputText(e.target.value); }} /></label>
            <label className="block"><span className={LABEL}>Hours per day basis</span>
              <input className={INPUT} type="number" min="1" max="24" step="0.5" value={hoursBasis} disabled={readOnly} onChange={(e) => setHoursBasis(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>Efficiency %</span>
              <input className={INPUT} type="number" min="1" max="200" step="1" value={efficiency} disabled={readOnly} onChange={(e) => setEfficiency(e.target.value)} /></label>
          </div>
          {shares.length > 1 && lc !== null && (
            <p className="text-muted-foreground">Man-hours per {unit} by trade: {shares.map((s) => `${s.roleLabel || "?"} ${roundTo(s.hrPerUnit, 3)}`).join(" · ")}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={LABEL}>Valid from</span><input className={INPUT} type="date" value={validFrom} disabled={readOnly} onChange={(e) => setValidFrom(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>Valid to</span><input className={INPUT} type="date" value={validTo} disabled={readOnly} onChange={(e) => setValidTo(e.target.value)} /></label>
          </div>

          <label className="block"><span className={LABEL}>Basis note * — where does this norm come from?</span>
            <textarea className={cn(INPUT, "h-24 resize-y")} value={basisNote} disabled={readOnly} onChange={(e) => setBasisNote(e.target.value)}
              placeholder="e.g. Site records, columns L1–L3, Jun 2026; gang of 6 laborers + 1 finisher placing 30 m³/day" /></label>
          {norm && (
            <p className="text-muted-foreground">Source: <strong className="text-foreground">{norm.source.replace("_", " ")}</strong>
              {norm.approved_at ? ` · approved ${new Date(norm.approved_at).toLocaleDateString()}` : ""}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
          {norm && (canCreate || canEdit) && (
            <button type="button" disabled={busy} onClick={saveCopy} className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
              <Copy className="h-3.5 w-3.5" /> {norm.project_id === null ? "Copy to this project (draft)" : "Save as copy (draft)"}
            </button>
          )}
          {locked && canEdit && (
            <button type="button" disabled={busy} onClick={() => changeStatus("retired")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Retire</button>
          )}
          {norm?.status === "retired" && canEdit && (
            <button type="button" disabled={busy} onClick={() => changeStatus("draft")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Return to draft</button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">{readOnly ? "Close" : "Cancel"}</button>
          {!readOnly && (isNew ? canCreate : canEdit) && (
            <>
              <button type="button" onClick={() => run("save")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save draft
              </button>
              {canApprove && (
                <button type="button" onClick={() => run("approve")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Save &amp; approve
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
