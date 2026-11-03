"use client";

// Doc 35 I1: contract milestones — the agreed dates, extensions, the activity that achieves each one, and where the
// programme forecasts it against the date, with liquidated damages exposure. Changing an agreed date (or an extension)
// and deleting need Baseline approve; every change is kept in the milestone's history.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MILESTONE_KINDS, MILESTONE_KIND_LABEL, MILESTONE_STATE_LABEL, exposureTotals, milestoneStatus,
  type ContractMilestone, type MilestoneKind, type MilestoneState, type MilestoneTask,
} from "@/lib/planning/milestones/contract-milestones";
import {
  deleteContractMilestone, listContractMilestones, milestoneHistory, milestoneTasks, saveContractMilestone, searchMilestoneTasks,
  type MilestoneHistoryRow, type MilestoneInput, type TaskOption,
} from "@/lib/planning/milestones/contract-milestone-service";

const STATE_CLS: Record<MilestoneState, string> = {
  achieved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  achieved_late: "border-red-200 bg-red-50 text-red-700",
  on_track: "border-emerald-200 bg-emerald-50 text-emerald-700",
  at_risk: "border-amber-200 bg-amber-50 text-amber-700",
  late: "border-red-200 bg-red-50 text-red-700",
  no_activity: "border-border bg-muted text-muted-foreground",
};
const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const money = (n: number, c: string | null) => `${c ? c + " " : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const EMPTY: MilestoneInput = {
  code: "", name: "", kind: "key_date", contract_date: "", revised_date: null, revision_ref: null, task_id: null,
  ld_rate: null, ld_currency: null, ld_cap: null, clause_ref: null, notes: null, sort_order: 0,
};

export function PlanContractMilestones() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const { can } = usePlanningPermissions();
  const canEdit = can("baseline", "edit");
  const canApprove = can("baseline", "approve");
  const [data, setData] = useState<{ projectId: string; rows: ContractMilestone[]; tasks: Map<string, MilestoneTask> } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: MilestoneInput; original: ContractMilestone | null } | null>(null);
  const [history, setHistory] = useState<{ m: ContractMilestone; rows: MilestoneHistoryRow[] | null } | null>(null);

  const load = useCallback(() => {
    if (!projectId) return;
    listContractMilestones(db, projectId)
      .then(async (rows) => {
        const tasks = await milestoneTasks(db, [...new Set(rows.map((r) => r.task_id).filter((x): x is string => !!x))]);
        setData({ projectId, rows, tasks });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [db, projectId]);
  useEffect(load, [load]);

  const current = data?.projectId === projectId ? data : null;
  const rows = useMemo(
    () => (current?.rows ?? []).map((m) => ({ m, s: milestoneStatus(m, m.task_id ? current?.tasks.get(m.task_id) : null) })),
    [current],
  );
  const totals = useMemo(() => exposureTotals(rows), [rows]);

  async function remove(m: ContractMilestone) {
    if (!window.confirm(`Delete contract milestone ${m.code} ${m.name}?`)) return;
    try { await deleteContractMilestone(db, m.id); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  function openHistory(m: ContractMilestone) {
    setHistory({ m, rows: null });
    milestoneHistory(db, m.id).then((r) => setHistory({ m, rows: r })).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }

  if (!projectId) return <p className="text-sm text-muted-foreground">Select a project.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Milestones" value={String(rows.length)} />
          <Card label="Forecast late" value={String(rows.filter((r) => r.s.state === "late").length)} tone={rows.some((r) => r.s.state === "late") ? "bad" : undefined} />
          <Card label="At risk (within 7 days)" value={String(rows.filter((r) => r.s.state === "at_risk").length)} />
          <Card label="Damages exposure"
            value={totals.length ? totals.map((t) => money(t.forecast + t.incurred, t.currency)).join(" · ") : "—"}
            hint={totals.some((t) => t.incurred) ? `incurred ${totals.map((t) => money(t.incurred, t.currency)).join(" · ")}` : undefined} />
        </div>
        {canEdit && <Button onClick={() => setEditing({ id: null, form: { ...EMPTY, sort_order: rows.length + 1 }, original: null })}><Plus className="mr-1 h-4 w-4" />Add milestone</Button>}
      </div>

      {!current ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No contract milestones yet. Add the dates the contract fixes (commencement, access, sectional and practical completion) and link each to the activity that achieves it.
        </p>
      ) : (
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Milestone</th><th className="px-3 py-2">Contract date</th><th className="px-3 py-2">Extended to</th>
                <th className="px-3 py-2">Activity</th><th className="px-3 py-2">Forecast / achieved</th><th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Damages</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, s }) => {
                const t = m.task_id ? current.tasks.get(m.task_id) : null;
                return (
                  <tr key={m.id} className="border-t border-border align-top">
                    <td className="px-3 py-2"><span className="font-mono text-xs">{m.code}</span> <b>{m.name}</b>
                      <div className="text-xs text-muted-foreground">{MILESTONE_KIND_LABEL[m.kind]}{m.clause_ref ? ` · ${m.clause_ref}` : ""}</div></td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(m.contract_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{m.revised_date ? <>{fmt(m.revised_date)}<div className="text-xs text-muted-foreground">{m.revision_ref}</div></> : "—"}</td>
                    <td className="px-3 py-2">{t ? <><span className="font-mono text-xs">{t.task_code}</span> {t.task_name}<div className="text-xs text-muted-foreground">{s.byStart ? "start" : "finish"}{s.baseline ? ` · baseline ${fmt(s.baseline)}` : ""}</div></> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.achieved ? <>{fmt(s.achieved)} <span className="text-xs text-muted-foreground">achieved</span></> : fmt(s.forecast)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", (s.variance ?? 0) > 0 && "font-medium text-red-600")}>{s.variance == null ? "—" : s.variance > 0 ? `+${s.variance}` : s.variance}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.exposure ? money(s.exposure, m.ld_currency) : m.ld_rate != null ? "0" : "—"}
                      {m.ld_rate != null && <div className="text-xs text-muted-foreground">{money(Number(m.ld_rate), null)}/day{m.ld_cap != null ? `, cap ${money(Number(m.ld_cap), null)}` : ""}</div>}</td>
                    <td className="px-3 py-2"><span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs", STATE_CLS[s.state])}>{MILESTONE_STATE_LABEL[s.state]}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" title="History" onClick={() => openHistory(m)}><History className="h-4 w-4" /></Button>
                      {canEdit && <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing({ id: m.id, form: { ...m }, original: m })}><Pencil className="h-4 w-4" /></Button>}
                      {canApprove && <Button variant="ghost" size="sm" title="Delete" onClick={() => void remove(m)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MilestoneDialog
          projectId={projectId} editing={editing} canApprove={canApprove}
          linked={editing.form.task_id ? current?.tasks.get(editing.form.task_id) ?? null : null}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <Dialog open={!!history} onOpenChange={(o) => { if (!o) setHistory(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>History: {history?.m.code} {history?.m.name}</DialogTitle></DialogHeader>
          {!history?.rows ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <ul className="max-h-80 space-y-1 overflow-auto text-xs">
              {history.rows.map((h) => (
                <li key={h.id} className="border-b border-border py-1">
                  <span className="text-muted-foreground">{h.changed_at.slice(0, 16).replace("T", " ")}</span>{" "}
                  <b>{h.field.replace(/_/g, " ")}</b>{h.field === "created" ? `: ${h.new_value}` : `: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MilestoneDialog({
  projectId, editing, canApprove, linked, onClose, onSaved,
}: {
  projectId: string;
  editing: { id: string | null; form: MilestoneInput; original: ContractMilestone | null };
  canApprove: boolean;
  linked: MilestoneTask | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [f, setF] = useState<MilestoneInput>(editing.form);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<TaskOption[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof MilestoneInput>(k: K, v: MilestoneInput[K]) => setF((p) => ({ ...p, [k]: v }));
  // an agreed date is fixed once saved, unless the user can approve baselines
  const datesLocked = !!editing.original && !canApprove;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchMilestoneTasks(db, projectId, q).then((r) => { if (live) setOptions(r); }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [db, projectId, q]);

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  async function save() {
    if (!f.code.trim() || !f.name.trim() || !f.contract_date) { toast.error("Code, name and contract date are needed"); return; }
    if (f.revised_date && !f.revision_ref?.trim()) { toast.error("Give the extension's reference (e.g. the EOT number)"); return; }
    setSaving(true);
    try { await saveContractMilestone(db, projectId, editing.id, f); toast.success("Saved"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const picked = f.task_id ? options.find((o) => o.id === f.task_id) ?? (linked ? { id: linked.id, task_code: linked.task_code, task_name: linked.task_name, end_date: linked.end_date, is_milestone: null } : null) : null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing.id ? `Edit ${editing.original?.code}` : "Add contract milestone"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Code *"><Input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. PC, SC-1" /></Field>
          <Field label="Type"><select className={sel} value={f.kind} onChange={(e) => set("kind", e.target.value as MilestoneKind)}>
            {MILESTONE_KINDS.map((k) => <option key={k} value={k}>{MILESTONE_KIND_LABEL[k]}</option>)}</select></Field>
          <Field label="Name *" wide><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Contract date *"><Input type="date" value={f.contract_date} disabled={datesLocked} onChange={(e) => set("contract_date", e.target.value)} /></Field>
          <Field label="Clause"><Input value={f.clause_ref ?? ""} onChange={(e) => set("clause_ref", e.target.value || null)} placeholder="e.g. Appendix to Tender, 8.2" /></Field>
          <Field label="Extended to (approved EOT)"><Input type="date" value={f.revised_date ?? ""} disabled={datesLocked} onChange={(e) => set("revised_date", e.target.value || null)} /></Field>
          <Field label="Extension reference"><Input value={f.revision_ref ?? ""} disabled={datesLocked} onChange={(e) => set("revision_ref", e.target.value || null)} placeholder="e.g. EOT-02" /></Field>
          {datesLocked && <p className="col-span-2 text-xs text-muted-foreground">Changing an agreed date or an extension needs Baseline approve permission.</p>}
          <Field label="Activity that achieves it" wide>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity code or name (programme milestones first)" />
            <select className={cn(sel, "mt-1")} value={f.task_id ?? ""} onChange={(e) => set("task_id", e.target.value || null)}>
              <option value="">— none —</option>
              {picked && !options.some((o) => o.id === picked.id) && <option value={picked.id}>{picked.task_code} {picked.task_name}</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.is_milestone ? "◆ " : ""}{o.task_code} {o.task_name}{o.end_date ? ` (${o.end_date})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Damages per day"><Input type="number" min="0" value={f.ld_rate ?? ""} onChange={(e) => set("ld_rate", num(e.target.value))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Currency"><Input value={f.ld_currency ?? ""} onChange={(e) => set("ld_currency", e.target.value.toUpperCase() || null)} placeholder="USD" /></Field>
            <Field label="Cap"><Input type="number" min="0" value={f.ld_cap ?? ""} onChange={(e) => set("ld_cap", num(e.target.value))} /></Field>
          </div>
          <Field label="Notes" wide><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={cn("space-y-1", wide && "col-span-2")}><Label className="text-xs">{label}</Label>{children}</div>;
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold", tone === "bad" && "text-red-600")}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
