"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calculate, type CalcInput, type Deduction, type Factor } from "@/lib/qs/qto/calc-engine";
import { ITEM_UNITS } from "@/lib/qs/qto/units";
import { QUANTITY_STATUSES, QUANTITY_STATUS_INFO, type QuantityStatus } from "@/lib/qs/qto/workflow";
import type { QtoCalculationRunRow, QtoItemFactor, RulesetDefinition, TakeoffItem } from "@/lib/qs/qto/types";
import type { ItemFields, MeasurementRow, TenderBoqLine } from "@/lib/qs/qto/session-service";
import { VOLUME_LABEL, fmtQty, isAutoRun, validVolume, type VolumeSpec } from "@/lib/qs/qto/measured-quantity";

const fieldCls = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60";
const labelCls = "text-[11px] font-medium text-muted-foreground";

interface StoredInputs {
  values?: CalcInput[];
  deductions?: Deduction[];
  factors?: Factor[];
}

export interface ItemPanelProps {
  item: TakeoffItem;
  editable: boolean;
  ruleset: RulesetDefinition | null;
  latestRun: QtoCalculationRunRow | null;
  factors: QtoItemFactor[];
  measurements: MeasurementRow[];
  boqLines: TenderBoqLine[];
  boqLinkId: string | null;
  boqLinkLocked: boolean;
  wbsNodes: { id: string; wbs_code: string | null; wbs_name: string | null }[];
  budgetCodes: { id: string; code: string; description: string | null }[];
  onSave: (patch: ItemFields) => Promise<void>;
  onSaveCalculation: (args: { run: ReturnType<typeof calculate>; factors: Factor[]; ruleCode: string | null }) => Promise<void>;
  onSetBoqLink: (boqItemId: string | null) => Promise<void>;
  onDeleteMeasurement: (id: string) => Promise<void>;
  /** Volume dimensions when the item's quantity is a volume built from its measurements. */
  volume?: VolumeSpec | null;
  onSetVolume?: (v: VolumeSpec) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}

function measurementValue(m: MeasurementRow): { value: number; unit: string } | null {
  if (m.measure_type === "area" && m.area !== null) return { value: m.area, unit: "m2" };
  if (m.count !== null && m.measure_type === "count") return { value: m.count, unit: "No." };
  if (m.length !== null) return { value: m.length, unit: "m" };
  return null;
}

export function QtoItemPanel(props: ItemPanelProps) {
  const { item, editable, ruleset, latestRun } = props;
  const [form, setForm] = useState<ItemFields>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({});
  }, [item.id]);

  const value = <K extends keyof ItemFields>(k: K) => (k in form ? form[k] : item[k as keyof TakeoffItem]) as ItemFields[K];
  const set = (patch: ItemFields) => setForm((f) => ({ ...f, ...patch }));
  const dirty = Object.keys(form).length > 0;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await props.onSave(form);
      setForm({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the item");
    } finally {
      setSaving(false);
    }
  }

  // Auto-save every 30 seconds while there are unsaved edits (06-UI-UX-Design).
  useEffect(() => {
    if (!dirty || !editable) return;
    const t = setTimeout(() => void save(), 30_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty, editable]);

  const status = value("quantity_status") as QuantityStatus;

  return (
    <div className="flex flex-col gap-4 text-sm" onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
    }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{item.qto_no}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {fmtQty(item.quantity)} <span className="text-base font-normal text-muted-foreground">{item.unit}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {!latestRun ? (["m2", "m", "No."].includes(item.unit) ? "Quantity will follow the drawing measurements." : "Record a calculation to set the quantity.")
              : isAutoRun(latestRun) && props.volume ? `Quantity = ${props.volume.mode === "area_depth" ? "Σ areas × depth" : "Σ lengths × width × depth"} (updates automatically).`
              : isAutoRun(latestRun) ? "Quantity = sum of the drawing measurements (updates automatically)."
              : "Custom calculation: new measurements do not change it."}
          </p>
          {item.carry_status && (
            <Badge variant="outline" className={cn("mt-1", item.carry_status === "UNVERIFIED" && "border-amber-500 text-amber-700 dark:text-amber-300")}>
              Carried forward · {item.carry_status.toLowerCase()}
            </Badge>
          )}
        </div>
        {editable && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate item" onClick={() => void props.onDuplicate()}><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Remove item" onClick={() => void props.onDelete()}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      {props.volume && isAutoRun(latestRun) && (
        <VolumeEditor key={JSON.stringify(props.volume)} volume={props.volume} editable={editable} onApply={props.onSetVolume} />
      )}

      {item.carry_status === "UNVERIFIED" && editable && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          This quantity was carried from the previous version and has not been checked against the new source.
          Remeasure it (recording a calculation does this), or confirm it is unchanged:
          <Button size="sm" variant="outline" className="ml-2 h-6 px-2 text-xs" onClick={() => void props.onSave({ carry_status: "REVALIDATED" })}>
            Confirm unchanged
          </Button>
        </div>
      )}

      <fieldset disabled={!editable} className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1">
          <span className={labelCls}>Description *</span>
          <textarea className="min-h-[56px] w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" value={value("description") ?? ""}
            onChange={(e) => set({ description: e.target.value })} onBlur={() => void save()} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Unit *</span>
          <select className={fieldCls} value={value("unit") ?? ""} onChange={(e) => set({ unit: e.target.value })} onBlur={() => void save()}>
            {ITEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Quantity status</span>
          <select className={fieldCls} value={status} title={QUANTITY_STATUS_INFO[status]?.meaning}
            onChange={(e) => set({ quantity_status: e.target.value as QuantityStatus })} onBlur={() => void save()}>
            {QUANTITY_STATUSES.map((s) => <option key={s} value={s}>{QUANTITY_STATUS_INFO[s].label}</option>)}
          </select>
        </label>
        {(status === "PROVISIONAL" || status === "PENDING_CLARIFICATION") && (
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelCls}>Assumption / missing information {status === "PROVISIONAL" && "*"}</span>
            <Input className="h-8" value={value("provisional_assumption") ?? ""} onChange={(e) => set({ provisional_assumption: e.target.value })} onBlur={() => void save()} />
          </label>
        )}
        {status === "EXCLUDED" && (
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelCls}>Exclusion reason *</span>
            <Input className="h-8" value={value("exclusion_reason") ?? ""} onChange={(e) => set({ exclusion_reason: e.target.value })} onBlur={() => void save()} />
          </label>
        )}
        <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">{QUANTITY_STATUS_INFO[status]?.meaning}</p>

        <p className="col-span-2 mt-1 text-xs font-semibold">Classification</p>
        {([
          ["work_section", "Work section *"], ["element", "Element"], ["item_code", "Item code"], ["discipline", "Discipline / trade"],
          ["building", "Building"], ["level", "Level"], ["zone", "Zone"], ["grid_location", "Grid"],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className={labelCls}>{label}</span>
            <Input className="h-8" value={(value(k) as string | null) ?? ""} onChange={(e) => set({ [k]: e.target.value || null })} onBlur={() => void save()} />
          </label>
        ))}
        <label className="col-span-2 flex flex-col gap-1">
          <span className={labelCls}>WBS</span>
          <select className={fieldCls} value={value("wbs_node_id") ?? ""} onChange={(e) => set({ wbs_node_id: e.target.value || null })} onBlur={() => void save()}>
            <option value="">— none —</option>
            {props.wbsNodes.map((n) => <option key={n.id} value={n.id}>{[n.wbs_code, n.wbs_name].filter(Boolean).join(" · ")}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className={labelCls}>Budget / cost code</span>
          <select className={fieldCls} value={value("budget_code_id") ?? ""} onChange={(e) => set({ budget_code_id: e.target.value || null })} onBlur={() => void save()}>
            <option value="">— none —</option>
            {props.budgetCodes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.description ? `· ${c.description}` : ""}</option>)}
          </select>
        </label>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Tender BOQ line (target for transfer)</span>
        <select className={fieldCls} disabled={!editable || props.boqLinkLocked} value={props.boqLinkId ?? ""}
          onChange={(e) => void props.onSetBoqLink(e.target.value || null)}>
          <option value="">New line on transfer</option>
          {props.boqLines.map((l) => <option key={l.id} value={l.id}>{l.item_code} · {l.description.slice(0, 60)} ({l.unit})</option>)}
        </select>
        {props.boqLinkLocked && <span className="text-[11px] text-muted-foreground">Set by an earlier transfer; kept for lineage.</span>}
      </label>

      {editable && dirty && (
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Save item (Ctrl+S)
        </Button>
      )}

      <CalculationBuilder
        key={`${item.id}:${latestRun?.id ?? "none"}`}
        item={item}
        editable={editable}
        ruleset={ruleset}
        latestRun={latestRun}
        savedFactors={props.factors}
        measurements={props.measurements}
        onSave={props.onSaveCalculation}
      />

      <div>
        <p className="mb-1 text-xs font-semibold">Measurements on the drawing ({props.measurements.length})</p>
        {props.measurements.length === 0 ? (
          <p className="text-xs text-muted-foreground">Select this item and measure on the drawing; each measurement is saved here as evidence.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {props.measurements.map((m) => {
              const v = measurementValue(m);
              return (
                <li key={m.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <Badge variant="outline" className="uppercase">{m.measure_type}</Badge>
                  <span className="tabular-nums">{v ? `${fmtQty(v.value, v.unit === "No." ? 0 : 2)} ${v.unit}` : "uncalibrated"}</span>
                  <span className="text-muted-foreground">p.{m.page_no ?? 1}</span>
                  {editable && (
                    <button className="ml-auto text-muted-foreground hover:text-destructive" title="Delete measurement" onClick={() => void props.onDeleteMeasurement(m.id)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Calculation builder ─────────────────────────────────────────────────────

function CalculationBuilder({
  item, editable, ruleset, latestRun, savedFactors, measurements, onSave,
}: {
  item: TakeoffItem;
  editable: boolean;
  ruleset: RulesetDefinition | null;
  latestRun: QtoCalculationRunRow | null;
  savedFactors: QtoItemFactor[];
  measurements: MeasurementRow[];
  onSave: ItemPanelProps["onSaveCalculation"];
}) {
  const stored = (latestRun?.inputs ?? {}) as StoredInputs;
  const [ruleCode, setRuleCode] = useState<string>(latestRun?.rule_code ?? item.rule_code ?? "");
  const [expression, setExpression] = useState<string>(latestRun?.expression ?? "");
  const [inputs, setInputs] = useState<CalcInput[]>(stored.values ?? []);
  const [deductions, setDeductions] = useState<Deduction[]>(stored.deductions ?? []);
  const [factors, setFactors] = useState<Factor[]>(
    stored.factors ?? savedFactors.map((f) => ({ name: f.factor_name, value: String(f.factor_value) })),
  );
  const [saving, setSaving] = useState(false);

  const rule = ruleset?.rules.find((r) => r.code === ruleCode) ?? null;
  const allowed = useMemo(() => {
    const all = ruleset?.factors ?? [];
    return rule?.allowed_factors ? all.filter((f) => rule.allowed_factors!.includes(f.name)) : all;
  }, [ruleset, rule]);

  function chooseRule(code: string) {
    setRuleCode(code);
    const r = ruleset?.rules.find((x) => x.code === code);
    if (!r) return;
    if (r.formula) setExpression(r.formula);
    if (r.inputs.length) {
      setInputs(r.inputs.map((i) => inputs.find((x) => x.name === i.name) ?? { name: i.name, value: "", unit: i.unit }));
    }
  }

  const run = useMemo(() => calculate({
    ruleCode: ruleCode || null,
    expression: expression.trim() || null,
    inputs: inputs.filter((i) => String(i.value).trim() !== ""),
    deductions: deductions.filter((d) => String(d.value).trim() !== ""),
    factors: factors.filter((f) => String(f.value).trim() !== ""),
    outputUnit: item.unit,
    rounding: ruleset?.rounding ?? { stage: "final", dp: 3, mode: "half_up" },
    allowedFactors: ruleset ? allowed : null,
  }), [ruleCode, expression, inputs, deductions, factors, item.unit, ruleset, allowed]);

  const unitMismatch = rule?.unit && rule.unit !== item.unit;

  async function save() {
    if (!run.valid) return;
    setSaving(true);
    try {
      await onSave({ run, factors: factors.filter((f) => String(f.value).trim() !== ""), ruleCode: ruleCode || null });
      toast.success(`Calculated ${run.result} ${run.unit}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the calculation");
    } finally {
      setSaving(false);
    }
  }

  const applyMeasurement = (m: MeasurementRow) => {
    const v = measurementValue(m);
    if (!v) { toast.error("Calibrate the drawing first: this measurement has no real units"); return; }
    const target = inputs.find((i) => String(i.value).trim() === "" && i.unit === v.unit) ?? inputs.find((i) => String(i.value).trim() === "");
    if (target) setInputs(inputs.map((i) => (i === target ? { ...i, value: v.value.toFixed(4), unit: v.unit } : i)));
    else setInputs([...inputs, { name: v.unit === "m2" ? "A" : v.unit === "No." ? "N" : `L${inputs.length + 1}`, value: v.value.toFixed(4), unit: v.unit }]);
  };

  return (
    <fieldset disabled={!editable} className="rounded-md border border-border p-3">
      <legend className="flex items-center gap-1 px-1 text-xs font-semibold"><Calculator className="h-3.5 w-3.5" /> Calculation</legend>
      <div className="grid gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Measurement rule</span>
          <select className={fieldCls} value={ruleCode} onChange={(e) => chooseRule(e.target.value)}>
            <option value="">— choose a rule —</option>
            {(ruleset?.rules ?? []).map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
          </select>
          {rule?.deduction_policy && <span className="text-[11px] text-muted-foreground">Deductions: {rule.deduction_policy}</span>}
          {unitMismatch && <span className="text-[11px] text-amber-700 dark:text-amber-300">This rule measures in {rule!.unit}; the item is in {item.unit}.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Formula (names, numbers, + − × ÷, min, max, abs, round)</span>
          <Input className="h-8 font-mono" value={expression} placeholder="e.g. L * W * D — empty uses the single input" onChange={(e) => setExpression(e.target.value)} />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelCls}>Inputs</span>
            {editable && <button className="text-[11px] text-primary hover:underline" onClick={() => setInputs([...inputs, { name: `X${inputs.length + 1}`, value: "", unit: "m" }])}>+ input</button>}
          </div>
          {inputs.map((inp, idx) => (
            <div key={idx} className="mb-1 grid grid-cols-[56px_1fr_72px_20px] items-center gap-1">
              <Input className="h-7 font-mono text-xs" value={inp.name} onChange={(e) => setInputs(inputs.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
              <Input className="h-7 text-xs tabular-nums" inputMode="decimal" value={String(inp.value)} onChange={(e) => setInputs(inputs.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} />
              <select className="h-7 rounded-md border border-input bg-transparent px-1 text-xs" value={inp.unit} onChange={(e) => setInputs(inputs.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}>
                {["mm", "cm", "m", "m2", "m3", "No.", "kg", "tonne"].map((u) => <option key={u}>{u}</option>)}
              </select>
              {editable && <button className="text-muted-foreground hover:text-destructive" onClick={() => setInputs(inputs.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {editable && measurements.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {measurements.map((m) => {
                const v = measurementValue(m);
                return v ? (
                  <button key={m.id} className="rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] hover:bg-muted" onClick={() => applyMeasurement(m)}>
                    use {v.value.toLocaleString(undefined, { maximumFractionDigits: 3 })} {v.unit}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelCls}>Deductions</span>
            {editable && <button className="text-[11px] text-primary hover:underline" onClick={() => setDeductions([...deductions, { description: "", value: "", unit: item.unit }])}>+ deduction</button>}
          </div>
          {deductions.map((d, idx) => (
            <div key={idx} className="mb-1 grid grid-cols-[1fr_80px_64px_20px] items-center gap-1">
              <Input className="h-7 text-xs" placeholder="e.g. opening D1" value={d.description} onChange={(e) => setDeductions(deductions.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} />
              <Input className="h-7 text-xs tabular-nums" inputMode="decimal" value={String(d.value)} onChange={(e) => setDeductions(deductions.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} />
              <select className="h-7 rounded-md border border-input bg-transparent px-1 text-xs" value={d.unit} onChange={(e) => setDeductions(deductions.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}>
                {["m", "m2", "m3", "No.", "kg", "tonne", "mm", "cm"].map((u) => <option key={u}>{u}</option>)}
              </select>
              {editable && <button className="text-muted-foreground hover:text-destructive" onClick={() => setDeductions(deductions.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelCls}>Factors (authorised by the ruleset)</span>
            {editable && allowed.length > 0 && (
              <select className="h-6 rounded border border-input bg-transparent px-1 text-[11px]" value=""
                onChange={(e) => { if (e.target.value) setFactors([...factors, { name: e.target.value, value: "1" }]); }}>
                <option value="">+ factor</option>
                {allowed.filter((f) => !factors.some((x) => x.name === f.name)).map((f) => <option key={f.name} value={f.name}>{f.name} ({f.min}–{f.max})</option>)}
              </select>
            )}
          </div>
          {factors.map((f, idx) => (
            <div key={idx} className="mb-1 grid grid-cols-[1fr_80px_20px] items-center gap-1">
              <span className="text-xs">{f.name}</span>
              <Input className="h-7 text-xs tabular-nums" inputMode="decimal" value={String(f.value)} onChange={(e) => setFactors(factors.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} />
              {editable && <button className="text-muted-foreground hover:text-destructive" onClick={() => setFactors(factors.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>

        <div className={cn("rounded-md p-2 text-xs", run.valid ? "bg-muted/50" : "bg-destructive/10 text-destructive")}>
          {run.valid ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 tabular-nums">
              <dt className="text-muted-foreground">Gross</dt><dd>{run.gross} {run.unit}</dd>
              <dt className="text-muted-foreground">Deductions</dt><dd>− {run.deductions} {run.unit}</dd>
              <dt className="text-muted-foreground">Net</dt><dd>{run.net} {run.unit}</dd>
              <dt className="text-muted-foreground">Factors</dt><dd>× {run.factor_product}</dd>
              <dt className="font-semibold">Result</dt><dd className="font-semibold">{run.result} {run.unit}</dd>
              <dt className="text-muted-foreground">Rounding</dt><dd>{run.rounding.stage} · {run.rounding.dp} dp · {run.rounding.mode.replace("_", " ")}</dd>
            </dl>
          ) : (
            <p>{run.errors[0] ?? "Enter the inputs"}</p>
          )}
        </div>
        {editable && (
          <Button size="sm" onClick={() => void save()} disabled={!run.valid || saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />} Record calculation
          </Button>
        )}
        {latestRun && (
          <p className="text-[11px] text-muted-foreground">
            Last recorded {new Date(latestRun.created_at).toLocaleString()} · {latestRun.engine_version} · result {Number(latestRun.result)} {latestRun.unit}
          </p>
        )}
      </div>
    </fieldset>
  );
}

// ── Volume dimensions ───────────────────────────────────────────────────────

function VolumeEditor({ volume, editable, onApply }: { volume: VolumeSpec; editable: boolean; onApply?: (v: VolumeSpec) => Promise<void> }) {
  const [width, setWidth] = useState(volume.mode === "length_width_depth" ? volume.width : "");
  const [depth, setDepth] = useState(volume.depth);
  const [busy, setBusy] = useState(false);
  const next: VolumeSpec = volume.mode === "area_depth" ? { mode: "area_depth", depth: depth.trim() } : { mode: "length_width_depth", width: width.trim(), depth: depth.trim() };
  const changed = JSON.stringify(next) !== JSON.stringify(volume);
  return (
    <fieldset disabled={!editable} className="rounded-md border border-border p-3">
      <legend className="px-1 text-xs font-semibold">{VOLUME_LABEL[volume.mode]}</legend>
      <div className="grid grid-cols-2 gap-2">
        {volume.mode === "length_width_depth" && (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Width (m)</span>
            <Input className="h-8" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{volume.mode === "area_depth" ? "Depth / thickness (m)" : "Depth (m)"}</span>
          <Input className="h-8" inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} />
        </label>
      </div>
      {editable && changed && (
        <Button size="sm" className="mt-2" disabled={busy || !validVolume(next)} onClick={async () => {
          setBusy(true);
          try { await onApply?.(next); } finally { setBusy(false); }
        }}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Apply dimensions
        </Button>
      )}
    </fieldset>
  );
}
