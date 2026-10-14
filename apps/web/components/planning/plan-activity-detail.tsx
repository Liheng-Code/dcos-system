"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import * as lib from "@/lib/planning/activity-library/library-service";
import { adjustedProductivity, baseOutputPerDay, calculateDuration } from "@/lib/planning/activity-library/productivity-engine";
import type {
  ActLogicRule, ActMaster, ActMethod, ActProductivityStandard, ActQuantityRule, ActRequirement,
  ActTemplate, ApplicabilityRule, FactorType, LibraryStatus,
} from "@/lib/planning/activity-library/types";
import { PlanActMasterForm } from "./plan-act-master-form";
import { PlanActSiteHistory } from "./plan-act-site-history";
import { ApplicabilityEditor, LogicEditor, NewStandardForm, QuantityRulesEditor, RequirementsEditor } from "./plan-act-master-editors";
import * as ed from "@/lib/planning/activity-library/library-editors";
import { ActStatusPill, CodeChip, EmptyNote, STATUS_LABEL, nextStatuses } from "./plan-act-shared";

interface Loaded {
  master: ActMaster;
  family: string;
  tree: lib.LibraryTree;
  methods: ActMethod[];
  standards: ActProductivityStandard[];
  qrules: ActQuantityRule[];
  logic: ActLogicRule[];
  logicNames: Record<string, string>;
  reqs: ActRequirement[];
  applicability: ApplicabilityRule[];
  history: lib.HistoryRow[];
  templates: (ActTemplate & { seq: number })[];
}

const REQ_TABS: { value: string; label: string; kinds: ActRequirement["kind"][] }[] = [
  { value: "qaqc", label: "QA/QC", kinds: ["qaqc", "hold_point"] },
  { value: "hse", label: "HSE", kinds: ["hse"] },
  { value: "documents", label: "Documents", kinds: ["document"] },
];

export function PlanActivityDetail({ id }: { id: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const master = await lib.getMaster(supabase, id);
      if (!master) { toast.error("Activity master not found"); router.push("/dashboard/planning/activity-library"); return; }
      const [tree, methods, standards, qrules, logic, reqs, applicability, history, templates] = await Promise.all([
        lib.loadLibraryTree(supabase), lib.listMethods(supabase, id), lib.listProductivityStandards(supabase, id),
        lib.listQuantityRules(supabase, id), lib.listLogicRules(supabase, id), lib.listRequirements(supabase, id),
        lib.listApplicability(supabase, "master", id), lib.listHistory(supabase, "master", id), lib.listTemplatesUsingMaster(supabase, id),
      ]);
      const otherIds = [...new Set(logic.flatMap((l) => [l.predecessor_master_id, l.successor_master_id]))];
      const { data: others } = otherIds.length
        ? await supabase.from("plan_act_masters").select("id, code, name").in("id", otherIds)
        : { data: [] };
      const logicNames: Record<string, string> = {};
      for (const o of (others ?? []) as { id: string; code: string; name: string }[]) logicNames[o.id] = `${o.code} ${o.name}`;
      const f = tree.families.find((x) => x.id === master.family_id);
      const c = tree.categories.find((x) => x.id === master.category_id);
      const d = tree.domains.find((x) => x.id === master.domain_id);
      setData({
        master, tree, family: [d?.name, c?.name, f?.name].filter(Boolean).join(" → "), methods, standards, qrules, logic, logicNames,
        reqs, applicability, history, templates,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, [supabase, id, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); toast.success(label); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  if (!data) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  const { master } = data;

  function transition(next: LibraryStatus) {
    if (next === "active") return run("Activated", () => lib.activateMaster(supabase, master.id));
    return run(`Status: ${STATUS_LABEL[next]}`, () => lib.setMasterStatus(supabase, master.id, next));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/dashboard/planning/activity-library")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to library
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CodeChip code={master.code} />
            <h1 className="mt-1 text-xl font-bold">{master.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <ActStatusPill status={master.status} />
              <span>v{master.version}</span><span>Rev {master.revision}</span>
              {master.owner && <span>Owner: {master.owner}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {nextStatuses(master.status).filter((s) => s !== "archived" || master.status !== "draft").map((s) => (
              <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => transition(s)}>{STATUS_LABEL[s]}</Button>
            ))}
            {master.status === "draft" && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
            {(master.status === "active" || master.status === "approved") && (
              <Button size="sm" disabled={busy} onClick={() => run("New draft version created", async () => {
                const nm = await lib.createNewVersion(supabase, master.id);
                router.push(`/dashboard/planning/activity-library/${nm.id}`);
              })}>New version</Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-6 mt-3 h-auto w-fit flex-wrap justify-start">
          {["overview", "methods", "productivity", "resources", "quantity", "logic", "templates", "qaqc", "hse", "documents", "applicability", "history"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t === "qaqc" ? "QA/QC" : t === "hse" ? "HSE" : t === "history" ? "Version History" : t === "quantity" ? "Quantity Rules" : t}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <TabsContent value="overview"><Overview d={data} /></TabsContent>
          <TabsContent value="methods"><Methods d={data} onChanged={load} /></TabsContent>
          <TabsContent value="productivity"><Productivity d={data} onSaved={load} /></TabsContent>
          <TabsContent value="resources"><Resources d={data} /></TabsContent>
          <TabsContent value="quantity"><QuantityRulesEditor master={master} rules={data.qrules} onChanged={load} /></TabsContent>
          <TabsContent value="logic"><LogicEditor master={master} logic={data.logic} names={data.logicNames} onChanged={load} /></TabsContent>
          <TabsContent value="templates"><Templates d={data} /></TabsContent>
          {REQ_TABS.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <RequirementsEditor master={master} reqs={data.reqs} kinds={t.kinds} onChanged={load} />
            </TabsContent>
          ))}
          <TabsContent value="applicability">
            <ApplicabilityEditor targetType="master" targetId={master.id} editable={master.status === "draft"} onChanged={load} />
          </TabsContent>
          <TabsContent value="history"><History d={data} /></TabsContent>
        </div>
      </Tabs>
      {editing && <PlanActMasterForm tree={data.tree} master={master} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>;
}

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-sm">{rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v ?? "—"}</dd></div>))}</dl>;
}

function Overview({ d }: { d: Loaded }) {
  const m = d.master;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Description"><p className="text-sm">{m.description ?? "No description."}</p></Card>
      <Card title="Classification"><Dl rows={[["Hierarchy", d.family], ["Discipline", m.discipline], ["Work type", m.work_type], ["Default unit", m.default_unit]]} /></Card>
      <Card title="Governance"><Dl rows={[
        ["Source", m.source], ["Effective", m.effective_date], ["Superseded", m.superseded_date],
        ["Approved", m.approved_at ? new Date(m.approved_at).toLocaleDateString() : null],
        ["Project types", m.applicable_project_types.join(", ")],
      ]} /></Card>
    </div>
  );
}

function Methods({ d, onChanged }: { d: Loaded; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const editable = d.master.status === "draft";
  const [draft, setDraft] = useState<{ id?: string; code: string; name: string; description: string; constraints_note: string; is_default: boolean } | null>(null);

  async function save() {
    if (!draft || !draft.code.trim() || !draft.name.trim()) { toast.error("Code and name are required"); return; }
    try {
      await lib.saveMethod(supabase, {
        id: draft.id, master_id: d.master.id, code: draft.code.trim().toUpperCase(), name: draft.name.trim(),
        description: draft.description.trim() || null, constraints_note: draft.constraints_note.trim() || null, is_default: draft.is_default,
        sort_order: draft.id ? undefined : d.methods.length + 1,
      });
      setDraft(null); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function remove(id: string) {
    try { await lib.deleteMethod(supabase, id); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-4">
      {editable && !draft && (
        <Button size="sm" onClick={() => setDraft({ code: "", name: "", description: "", constraints_note: "", is_default: d.methods.length === 0 })}>+ Add method</Button>
      )}
      {draft && (
        <Card title={draft.id ? "Edit method" : "New method"}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Code (e.g. PUMP)" value={draft.code} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Input placeholder="Constraints" value={draft.constraints_note} onChange={(e) => setDraft({ ...draft, constraints_note: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} /> Default method</label>
          </div>
          <div className="mt-3 flex gap-2"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button></div>
        </Card>
      )}
      {!d.methods.length && !draft && <EmptyNote>No construction methods defined for this activity.</EmptyNote>}
      <div className="grid gap-4 md:grid-cols-3">
        {d.methods.map((m) => {
          const std = d.standards.find((s) => s.method_id === m.id);
          return (
            <div key={m.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between"><span className="font-semibold">{m.name}</span>{m.is_default && <span className="text-[11px] text-primary">DEFAULT</span>}</div>
              <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
              {m.constraints_note && <p className="mt-2 text-xs">Constraint: {m.constraints_note}</p>}
              {std?.output_per_day != null && <p className="mt-3 text-sm">Output: <b>{std.output_per_day} {std.unit}/day</b></p>}
              {editable && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft({ id: m.id, code: m.code, name: m.name, description: m.description ?? "", constraints_note: m.constraints_note ?? "", is_default: m.is_default })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>Delete</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Productivity({ d, onSaved }: { d: Loaded; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {d.standards.length === 0 && !creating && <EmptyNote>No productivity standard linked to this activity yet.</EmptyNote>}
      {d.standards.map((s) => <StandardCard key={s.id} s={s} supabase={supabase} methodName={d.methods.find((m) => m.id === s.method_id)?.name} onSaved={onSaved} />)}
      {creating
        ? <NewStandardForm master={d.master} methods={d.methods} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); onSaved(); }} />
        : d.master.status !== "archived" && <Button size="sm" onClick={() => setCreating(true)}>+ New productivity standard</Button>}
    </div>
  );
}

function StandardCard({ s, supabase, methodName, onSaved }: { s: ActProductivityStandard; supabase: ReturnType<typeof createClient>; methodName?: string; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(s.factors.map((f) => [f.id!, String(f.value)])));
  const [qty, setQty] = useState("180");
  const [newType, setNewType] = useState<FactorType>("height");
  const [newValue, setNewValue] = useState("1");
  const crew = s.resources.filter((r) => r.kind === "labor" && r.allocation_rule === "per_crew").reduce((a, r) => a + r.workers_per_crew, 0);
  const base = baseOutputPerDay({ output_per_day: s.output_per_day, labour_constant_hr_per_unit: s.labour_constant_hr_per_unit, crew_workers: crew, hours_per_day: s.hours_per_day_basis, efficiency_pct: s.efficiency_pct });
  const factors = s.factors.map((f) => ({ ...f, value: Number(values[f.id!]) || 1 }));
  const adj = base != null ? adjustedProductivity(base, factors) : null;
  const dur = adj ? calculateDuration(Number(qty) || 0, adj.adjusted) : null;
  const dirty = s.factors.some((f) => Number(values[f.id!]) !== f.value);

  async function save() {
    try {
      for (const f of s.factors) if (Number(values[f.id!]) !== f.value) await lib.saveFactorValue(supabase, f.id!, Number(values[f.id!]));
      toast.success("Factors saved"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <Card title={`${methodName ?? s.name} — ${s.status.toUpperCase()} · v${s.version}`}>
      <div className="mb-3 text-sm text-muted-foreground">{s.basis_note}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {s.factors.map((f) => (
          <label key={f.id} className="text-xs">
            <span className="mb-1 flex items-center justify-between capitalize text-muted-foreground">{f.factor_type.replace("_", " ")}{s.status === "draft" && <button type="button" aria-label="Remove factor" className="text-red-500" onClick={async () => { try { await ed.deleteFactor(supabase, f.id!); onSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>×</button>}</span>
            <Input type="number" step="0.01" value={values[f.id!]} onChange={(e) => setValues((v) => ({ ...v, [f.id!]: e.target.value }))} />
          </label>
        ))}
      </div>
      {s.status === "draft" && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <select className="h-8 rounded-md border border-input bg-background px-1.5" value={newType} onChange={(e) => setNewType(e.target.value as FactorType)}>
            {(["height", "access", "crew", "method", "weather", "working_hour", "site_condition", "other"] as const).map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
          <Input className="h-8 w-20" type="number" step="0.01" value={newValue} onChange={(e) => setNewValue(e.target.value)} aria-label="Factor value" />
          <Button size="sm" variant="outline" onClick={async () => {
            try { await ed.addFactor(supabase, s.id, { factor_type: newType, label: newType, value: Number(newValue) || 1, condition_note: null }); onSaved(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}>+ Add factor</Button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-primary/5 p-3 text-sm">
        <span>Base: <b>{base?.toFixed(1) ?? "—"} {s.unit}/day</b></span>
        <span>Factor: <b>{adj?.factor.toFixed(3) ?? "—"}</b></span>
        <span>Adjusted: <b className="text-primary">{adj?.adjusted.toFixed(1) ?? "—"} {s.unit}/day</b></span>
        <label className="flex items-center gap-2">Quantity <Input className="h-8 w-24" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /> {s.unit}</label>
        <span>Duration: <b>{dur ? `${dur.days} d (${dur.raw_days.toFixed(2)})` : "—"}</b></span>
        {dirty && <Button size="sm" onClick={save}>Save factors</Button>}
      </div>
      <PlanActSiteHistory std={s} onCreated={onSaved} />
    </Card>
  );
}

function Resources({ d }: { d: Loaded }) {
  if (!d.standards.length) return <EmptyNote>No resource standard yet.</EmptyNote>;
  return (
    <div className="space-y-4">
      {d.standards.map((s) => (
        <Card key={s.id} title={d.methods.find((m) => m.id === s.method_id)?.name ?? s.name}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-muted-foreground"><th className="py-1">Kind</th><th>Resource</th><th>Qty</th><th>Rule</th></tr></thead>
            <tbody>{s.resources.map((r) => (
              <tr key={r.id} className="border-t border-border"><td className="py-1.5 capitalize">{r.kind}</td><td>{r.role_label}{r.is_optional && <span className="ml-2 text-xs text-muted-foreground">(optional)</span>}</td><td>{r.workers_per_crew}</td><td>{r.allocation_rule.replace("_", " ")}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function Templates({ d }: { d: Loaded }) {
  if (!d.templates.length) return <EmptyNote>Not used in any template.</EmptyNote>;
  return <div className="space-y-2">{d.templates.map((t) => (
    <div key={t.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <CodeChip code={t.code} /><span className="flex-1 font-medium">{t.name}</span><span className="text-muted-foreground">Step {t.seq} · v{t.version}</span><ActStatusPill status={t.status} />
    </div>))}</div>;
}

function History({ d }: { d: Loaded }) {
  if (!d.history.length) return <EmptyNote>No history.</EmptyNote>;
  return <ol className="space-y-3 border-l border-border pl-4">{d.history.map((h) => (
    <li key={h.id} className="text-sm"><b>{h.action === "create" ? "Created" : `${h.from_status} → ${h.to_status}`}</b>
      <span className="ml-3 text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</span></li>))}</ol>;
}
