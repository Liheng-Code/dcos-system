"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import * as ed from "@/lib/planning/activity-library/library-editors";
import type {
  ActLogicRule, ActMaster, ActMethod, ActQuantityRule, ActRequirement, AllocationRule, ApplicabilityRow,
  QuantityProviderKey, Relation, RequirementKind, ResourceKind,
} from "@/lib/planning/activity-library/types";
import { EmptyNote } from "./plan-act-shared";
import { PROJECT_SECTORS, buildingTypeLabel, sectorLabel } from "@/lib/project-categories";
import { choiceLabel, choiceValueLabel, type PlanningChoice } from "@/lib/planning/activity-library/planning-choices";
import { usePlanningChoices } from "./plan-planning-choices";

const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3>{action}</div>
      {children}
    </div>
  );
}

async function run(fn: () => Promise<unknown>, done: () => void, ok?: string) {
  try { await fn(); if (ok) toast.success(ok); done(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
}

const FrozenNote = () => (
  <p className="mb-3 text-xs text-muted-foreground">This activity is not a draft, so it is read-only. Create a new version to change it.</p>
);

// ── Quantity rules ────────────────────────────────────────────────────────

const PROVIDERS: QuantityProviderKey[] = ["bim", "boq", "manual", "calculated", "module"];

export function QuantityRulesEditor({ master, rules, onChanged }: { master: ActMaster; rules: ActQuantityRule[]; onChanged: () => void }) {
  const db = useMemo(() => createClient(), []);
  const editable = master.status === "draft";
  const blank = { name: "", metric_code: "", unit: master.default_unit ?? "", providers: ["bim", "boq", "manual"] as QuantityProviderKey[], ded: "", add: "", note: "" };
  const [form, setForm] = useState<typeof blank | null>(null);

  return (
    <div className="space-y-4">
      {!editable && <FrozenNote />}
      {rules.map((r) => (
        <Card key={r.id} title={r.name} action={editable && (
          <Button size="icon" variant="ghost" aria-label="Delete rule" onClick={() => run(() => ed.deleteQuantityRule(db, r.id), onChanged, "Rule deleted")}><Trash2 className="h-4 w-4" /></Button>
        )}>
          <pre className="rounded bg-slate-900 p-3 font-mono text-xs text-slate-100">{`Quantity = ${r.metric_code}${r.deduction_metrics.map((m) => `\n         - ${m}`).join("")}${r.addition_metrics.map((m) => `\n         + ${m}`).join("")}`}</pre>
          <p className="mt-3 text-sm">Provider priority: <b>{r.provider_priority.map((p) => p.toUpperCase()).join(" → ")}</b></p>
          {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
        </Card>
      ))}
      {rules.length === 0 && !form && <EmptyNote>No quantity rule defined.</EmptyNote>}
      {editable && !form && <Button size="sm" onClick={() => setForm(blank)}>+ Add quantity rule</Button>}
      {form && (
        <Card title="New quantity rule">
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Rule name (e.g. Slab area)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Metric code (e.g. slab_area)" value={form.metric_code} onChange={(e) => setForm({ ...form, metric_code: e.target.value })} />
            <Input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input placeholder="Deduct metrics (comma separated)" value={form.ded} onChange={(e) => setForm({ ...form, ded: e.target.value })} />
            <Input placeholder="Add metrics (comma separated)" value={form.add} onChange={(e) => setForm({ ...form, add: e.target.value })} />
            <Input placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Priority (checked order):</span>
            {PROVIDERS.map((p) => (
              <label key={p} className="flex items-center gap-1 uppercase">
                <input type="checkbox" checked={form.providers.includes(p)}
                  onChange={(e) => setForm({ ...form, providers: e.target.checked ? [...form.providers, p] : form.providers.filter((x) => x !== p) })} />{p}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => {
              if (!form.name.trim() || !form.metric_code.trim() || form.providers.length === 0) { toast.error("Name, metric and at least one provider are required"); return; }
              void run(() => ed.saveQuantityRule(db, {
                master_id: master.id, name: form.name.trim(), metric_code: form.metric_code.trim(), unit: form.unit.trim() || null,
                provider_priority: form.providers, deduction_metrics: csv(form.ded), addition_metrics: csv(form.add), note: form.note.trim() || null,
              }), () => { setForm(null); onChanged(); }, "Rule added");
            }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Standard logic ────────────────────────────────────────────────────────

export function LogicEditor({ master, logic, names, onChanged }: { master: ActMaster; logic: ActLogicRule[]; names: Record<string, string>; onChanged: () => void }) {
  const db = useMemo(() => createClient(), []);
  const editable = master.status === "draft";
  const [others, setOthers] = useState<{ id: string; code: string; name: string }[]>([]);
  const [form, setForm] = useState({ direction: "pred" as "pred" | "succ", other: "", relation: "fs" as Relation, lag: "0", optional: false });

  useEffect(() => {
    if (!editable) return;
    let live = true;
    void db.from("plan_act_masters").select("id, code, name").eq("status", "active").neq("code", master.code).order("code").then(({ data }) => {
      if (live) setOthers((data ?? []) as { id: string; code: string; name: string }[]);
    });
    return () => { live = false; };
  }, [db, editable, master.code]);

  const preds = logic.filter((l) => l.successor_master_id === master.id);
  const succs = logic.filter((l) => l.predecessor_master_id === master.id);
  const line = (l: ActLogicRule, other: string) => (
    <li key={l.id} className="flex items-center gap-2 py-1 text-sm">
      <span className="rounded bg-muted px-1.5 text-[11px] font-semibold uppercase">{l.relation}{l.lag_days ? ` ${l.lag_days > 0 ? "+" : ""}${l.lag_days}d` : ""}</span>
      <span className="flex-1">{names[other]}</span>
      {l.is_optional && <span className="text-xs text-muted-foreground">optional</span>}
      {editable && <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => run(() => ed.deleteLogicRule(db, l.id), onChanged)}><Trash2 className="h-4 w-4" /></Button>}
    </li>
  );

  return (
    <div className="space-y-4">
      {!editable && <FrozenNote />}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Predecessors"><ul>{preds.length ? preds.map((l) => line(l, l.predecessor_master_id)) : <li className="text-sm text-muted-foreground">None</li>}</ul></Card>
        <Card title="Successors"><ul>{succs.length ? succs.map((l) => line(l, l.successor_master_id)) : <li className="text-sm text-muted-foreground">None</li>}</ul></Card>
      </div>
      {editable && (
        <Card title="Add standard link">
          <div className="flex flex-wrap items-center gap-2">
            <select className={sel} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "pred" | "succ" })}>
              <option value="pred">This activity follows…</option><option value="succ">This activity is followed by…</option>
            </select>
            <select className={`${sel} min-w-64 flex-1`} value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })}>
              <option value="">Choose activity…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
            </select>
            <select className={sel} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value as Relation })}>
              {(["fs", "ss", "ff", "sf"] as const).map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
            <Input className="w-20" type="number" value={form.lag} onChange={(e) => setForm({ ...form, lag: e.target.value })} aria-label="Lag days" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.optional} onChange={(e) => setForm({ ...form, optional: e.target.checked })} /> optional</label>
            <Button size="sm" disabled={!form.other} onClick={() => run(() => ed.addLogicRule(db, {
              predecessor_master_id: form.direction === "pred" ? form.other : master.id,
              successor_master_id: form.direction === "pred" ? master.id : form.other,
              relation: form.relation, lag_days: Number(form.lag) || 0, is_optional: form.optional, note: null,
            }), () => { setForm({ ...form, other: "" }); onChanged(); }, "Link added")}>Add</Button>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Standard logic is a recommendation only. Project logic is decided by the planner.</p>
    </div>
  );
}

// ── Requirements (QA/QC, HSE, documents, hold points) ─────────────────────

export function RequirementsEditor({ master, reqs, kinds, onChanged }: { master: ActMaster; reqs: ActRequirement[]; kinds: RequirementKind[]; onChanged: () => void }) {
  const db = useMemo(() => createClient(), []);
  const editable = master.status === "draft";
  const [kind, setKind] = useState<RequirementKind>(kinds[0]);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const shown = reqs.filter((r) => kinds.includes(r.kind));

  return (
    <div className="space-y-4">
      {!editable && <FrozenNote />}
      {shown.length === 0 ? <EmptyNote>Nothing defined.</EmptyNote> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1">{r.title}</span>
              {r.kind === "hold_point" && <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">HOLD POINT</span>}
              {r.doc_type && <span className="text-xs text-muted-foreground">{r.doc_type}</span>}
              {r.is_mandatory && <span className="text-[11px] text-muted-foreground">Mandatory</span>}
              {editable && <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => run(() => ed.deleteRequirement(db, r.id), onChanged)}><Trash2 className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
          {kinds.length > 1 && (
            <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as RequirementKind)}>
              {kinds.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
            </select>
          )}
          <Input className="min-w-64 flex-1" placeholder="Requirement" value={title} onChange={(e) => setTitle(e.target.value)} />
          {kinds.includes("document") && <Input className="w-28" placeholder="Doc type" value={docType} onChange={(e) => setDocType(e.target.value)} />}
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> mandatory</label>
          <Button size="sm" disabled={!title.trim()} onClick={() => run(() => ed.addRequirement(db, {
            master_id: master.id, kind, title: title.trim(), is_mandatory: mandatory, reference_code: null,
            doc_type: docType.trim() || null, sort_order: reqs.filter((r) => r.kind === kind).length + 1,
          }), () => { setTitle(""); setDocType(""); onChanged(); }, "Added")}>Add</Button>
        </div>
      )}
    </div>
  );
}

// ── Applicability (master or template) ────────────────────────────────────

/** sector / building_type come from the project (Project Categories); the rest are the planning choices asked on Generate (plan_act_attributes). */
export const APPLICABILITY_ATTRIBUTES = ["sector", "building_type"];

/** Values picked from the Project Categories instead of typed. */
const TAXONOMY_VALUES: Record<string, { value: string; label: string; group?: string }[]> = {
  sector: PROJECT_SECTORS.map((s) => ({ value: s.value, label: s.label })),
  building_type: PROJECT_SECTORS.flatMap((s) => s.buildingTypes.map((b) => ({ value: b.value, label: b.label, group: s.label }))),
};

/** Readable rule value: sector / building-type names, planning-choice option labels, else the slug in words. */
export const valueLabel = (attribute: string, v: string, catalogue: PlanningChoice[] = []) =>
  attribute === "sector" ? sectorLabel(v) : attribute === "building_type" ? buildingTypeLabel(v) : choiceValueLabel(catalogue, attribute, v);

export function ApplicabilityEditor({
  targetType, targetId, editable, onChanged,
}: { targetType: "master" | "template"; targetId: string; editable: boolean; onChanged?: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ApplicabilityRow[]>([]);
  const [attr, setAttr] = useState(APPLICABILITY_ATTRIBUTES[0]);
  const [op, setOp] = useState<"eq" | "neq" | "in" | "not_in">("in");
  const [values, setValues] = useState("");
  const catalogue = usePlanningChoices();
  const attributes = [...APPLICABILITY_ATTRIBUTES, ...catalogue.map((c) => c.key)];
  const choice = catalogue.find((c) => c.key === attr);
  const taxonomy = TAXONOMY_VALUES[attr] ?? choice?.options;
  const picked = csv(values);
  const togglePick = (v: string) => setValues((picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]).join(", "));

  const load = useMemo(() => async () => {
    try { setRows(await ed.listApplicabilityRows(db, targetType, targetId)); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }, [db, targetType, targetId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);
  const changed = () => { void load(); onChanged?.(); };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? <EmptyNote>No applicability rules: applies to any project.</EmptyNote> : (
        <div className="flex flex-wrap gap-2">
          {rows.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs">
              {choiceLabel(catalogue, a.attribute)} {a.operator === "in" || a.operator === "eq" ? "is" : "is not"} {a.values.map((v) => valueLabel(a.attribute, v, catalogue)).join(" or ")}
              {editable && <button aria-label="Remove rule" onClick={() => run(() => ed.deleteApplicability(db, a.id), changed)}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>}
            </span>
          ))}
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
          <select className={sel} value={attr} onChange={(e) => { setAttr(e.target.value); setValues(""); }}>
            {attributes.map((a) => <option key={a} value={a}>{choiceLabel(catalogue, a)}</option>)}
          </select>
          <select className={sel} value={op} onChange={(e) => setOp(e.target.value as typeof op)}>
            <option value="in">is one of</option><option value="eq">equals</option><option value="not_in">is not one of</option><option value="neq">not equal</option>
          </select>
          {taxonomy ? (
            <div className="flex w-full flex-wrap gap-1.5">
              {taxonomy.map((o) => (
                <button key={o.value} type="button" aria-pressed={picked.includes(o.value)} onClick={() => togglePick(o.value)} title={"group" in o ? o.group : undefined}
                  className={"rounded-full border px-2.5 py-1 text-xs " + (picked.includes(o.value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <Input className="min-w-56 flex-1" placeholder="values, comma separated (e.g. aluminum, conventional)" value={values} onChange={(e) => setValues(e.target.value)} />
          )}
          <Button size="sm" disabled={csv(values).length === 0} onClick={() => run(() => ed.addApplicability(db, targetType, targetId, { attribute: attr, operator: op, values: csv(values) }), () => { setValues(""); changed(); }, "Rule added")}>Add</Button>
        </div>
      )}
    </div>
  );
}

// ── New productivity standard ─────────────────────────────────────────────

export function NewStandardForm({ master, methods, onClose, onCreated }: { master: ActMaster; methods: ActMethod[]; onClose: () => void; onCreated: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [methodId, setMethodId] = useState(methods.find((m) => m.is_default)?.id ?? "");
  const [output, setOutput] = useState("");
  const [hours, setHours] = useState("10");
  const [note, setNote] = useState("");
  const [crew, setCrew] = useState<ed.CrewLineInput[]>([{ kind: "labor", role_label: "", workers_per_crew: 1, allocation_rule: "per_crew", is_optional: false }]);
  const method = methods.find((m) => m.id === methodId);
  const patch = (i: number, p: Partial<ed.CrewLineInput>) => setCrew(crew.map((c, k) => (k === i ? { ...c, ...p } : c)));

  return (
    <Card title={`New productivity standard (${master.default_unit ?? "no unit"}/day)`}>
      <div className="grid gap-3 md:grid-cols-4">
        <select className={sel} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          <option value="">No method</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Input type="number" placeholder={`Crew output per day (${master.default_unit ?? ""})`} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Input type="number" placeholder="Hours per day" value={hours} onChange={(e) => setHours(e.target.value)} />
        <Input placeholder="Basis (source of this figure)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">Resource standard</div>
        {crew.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className={sel} value={c.kind} onChange={(e) => patch(i, { kind: e.target.value as ResourceKind })}>
              {(["labor", "equipment", "material", "subcontract"] as const).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Input className="min-w-48 flex-1" placeholder="Role / item" value={c.role_label} onChange={(e) => patch(i, { role_label: e.target.value })} />
            <Input className="w-20" type="number" value={c.workers_per_crew} onChange={(e) => patch(i, { workers_per_crew: Number(e.target.value) || 0 })} aria-label="Quantity" />
            <select className={sel} value={c.allocation_rule} onChange={(e) => patch(i, { allocation_rule: e.target.value as AllocationRule })}>
              {(["per_crew", "per_activity", "per_pour", "quantity_driven", "fixed"] as const).map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={c.is_optional} onChange={(e) => patch(i, { is_optional: e.target.checked })} /> optional</label>
            <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => setCrew(crew.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setCrew([...crew, { kind: "labor", role_label: "", workers_per_crew: 1, allocation_rule: "per_crew", is_optional: false }])}>+ Add line</Button>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => run(() => ed.createProductivityStandard(db, {
          master, method_id: methodId || null, method_code: method?.code ?? null, name: `${master.name}${method ? " - " + method.name : ""}`,
          output_per_day: Number(output), hours_per_day: Number(hours) || 10, basis_note: note,
          crew: crew.filter((c) => c.role_label.trim()),
        }), onCreated, "Standard created as draft (approve it in the Norm Library)")}>Create draft standard</Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}
