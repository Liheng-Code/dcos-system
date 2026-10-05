"use client";

// Setup › Rules: the checks run on every report, with this project's settings.
// A project administrator can switch an after-submit check off, change its
// thresholds, or return it to the default. Checks that block a report at
// intake are listed and cannot be changed per project.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  RULE_CATALOG,
  ruleFormResult,
  ruleFormValues,
  type RuleFormValues,
  type RuleSpec,
} from "@/lib/construction/daily-reporting/rule-catalog";
import { listRuleDefinitions, removeProjectRule, saveProjectRule, type RuleRow } from "@/lib/construction/daily-reporting/service";
import { Field, Flag, inputClass, SectionCard } from "./dr-ui";

function summary(spec: RuleSpec, def: RuleRow): string {
  const parts = (spec.fields ?? [])
    .filter((f) => def.params[f.key] !== null && def.params[f.key] !== undefined)
    .map((f) => `${f.label.replace(/ \(.*\)$/, "")}: ${def.params[f.key]}`);
  if (spec.uomRanges) {
    const ranges = Object.entries((def.params.by_uom ?? {}) as Record<string, { min?: number | null; max?: number | null }>);
    parts.push(ranges.length ? ranges.map(([uom, r]) => `${uom} ${r.min ?? "…"}–${r.max ?? "…"}`).join(", ") : "no quantity ranges");
  }
  if (spec.usesHistory) parts.push(`after ${def.min_history_days} approved days`);
  return parts.join(" · ");
}

function RuleEditor({
  spec,
  effective,
  onSave,
  onCancel,
}: {
  spec: RuleSpec;
  effective: RuleRow;
  onSave: (values: RuleFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<RuleFormValues>(() => ruleFormValues(spec, effective));
  const [saving, setSaving] = useState(false);
  const setRange = (i: number, patch: Partial<RuleFormValues["ranges"][number]>) =>
    setValues((v) => ({ ...v, ranges: v.ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.is_active} onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))} />
        Run this check on this project
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {spec.severityEditable ? (
          <Field label="When it fails">
            <select className={inputClass} value={values.severity} onChange={(e) => setValues((v) => ({ ...v, severity: e.target.value as RuleFormValues["severity"] }))}>
              <option value="WARNING">Warn the approver</option>
              <option value="ERROR">Block the report</option>
            </select>
          </Field>
        ) : null}
        {(spec.fields ?? []).map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              min={f.min}
              max={f.max}
              step={f.step ?? 1}
              value={values.fields[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, fields: { ...v.fields, [f.key]: e.target.value } }))}
            />
          </Field>
        ))}
        {spec.usesHistory ? (
          <Field label="Approved days needed before it runs" hint="Per reporting unit">
            <input type="number" inputMode="numeric" className={inputClass} min={0} max={365} value={values.min_history_days} onChange={(e) => setValues((v) => ({ ...v, min_history_days: e.target.value }))} />
          </Field>
        ) : null}
      </div>

      {spec.uomRanges ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Quantity allowed in one day, per unit of measure</p>
          {values.ranges.length === 0 ? <p className="text-xs text-muted-foreground">No ranges set.</p> : null}
          {values.ranges.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label="Unit of measure" placeholder="Unit, e.g. m2" className={`${inputClass} w-32`} value={r.uom} onChange={(e) => setRange(i, { uom: e.target.value })} />
              <input aria-label="Minimum" type="number" inputMode="decimal" placeholder="Min" className={`${inputClass} w-28`} min={0} value={r.min} onChange={(e) => setRange(i, { min: e.target.value })} />
              <input aria-label="Maximum" type="number" inputMode="decimal" placeholder="Max" className={`${inputClass} w-28`} min={0} value={r.max} onChange={(e) => setRange(i, { max: e.target.value })} />
              <Button variant="ghost" size="sm" aria-label="Remove range" onClick={() => setValues((v) => ({ ...v, ranges: v.ranges.filter((_, j) => j !== i) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setValues((v) => ({ ...v, ranges: [...v.ranges, { uom: "", min: "", max: "" }] }))}>
            <Plus className="mr-1 h-4 w-4" />
            Add a unit of measure
          </Button>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(values);
            } finally {
              setSaving(false);
            }
          }}
        >
          Save for this project
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function DrRules({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listRuleDefinitions(projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, [projectId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount / project change
    void load();
  }, [load]);

  if (!rows) return null;

  const rules = RULE_CATALOG.map((spec) => {
    const global = rows.find((r) => r.project_id === null && r.rule_code === spec.code) ?? null;
    const override = rows.find((r) => r.project_id === projectId && r.rule_code === spec.code) ?? null;
    return { spec, global, override, effective: override ?? global };
  }).filter((r) => r.effective !== null);

  return (
    <SectionCard title="Rules">
      <p className="text-sm text-muted-foreground">
        Every report is checked against these rules. Checks at intake block a report and are the same on every project. The others warn the
        approver; they can be switched off or tuned for this project. Every change is recorded in the audit trail and applies to reports
        sent from then on.
      </p>
      <ul className="mt-3 space-y-2">
        {rules.map(({ spec, global, override, effective }) => {
          const def = effective as RuleRow;
          return (
            <li key={spec.code} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {spec.label}
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {spec.intake ? <Flag tone="neutral">At intake</Flag> : null}
                      {!def.is_active ? <Flag tone="neutral">Off</Flag> : <Flag tone={def.severity === "ERROR" ? "bad" : "warn"}>{def.severity === "ERROR" ? "Blocks" : "Warns"}</Flag>}
                      {override ? <Flag tone="info">Project setting</Flag> : null}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{spec.description}</p>
                  {summary(spec, def) ? <p className="mt-0.5 text-xs">{summary(spec, def)}</p> : null}
                </div>
                {!spec.intake && editing !== spec.code ? (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(spec.code)}>
                      Change
                    </Button>
                    {override && global ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await removeProjectRule(override.id);
                            toast.success(`${spec.label}: back to the default.`);
                            await load();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Use default
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {editing === spec.code ? (
                <RuleEditor
                  spec={spec}
                  effective={def}
                  onCancel={() => setEditing(null)}
                  onSave={async (values) => {
                    const result = ruleFormResult(spec, values, def.params);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    try {
                      await saveProjectRule(projectId, def, result);
                      toast.success(`${spec.label} saved for this project.`);
                      setEditing(null);
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    }
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
