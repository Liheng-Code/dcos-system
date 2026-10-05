"use client";

// Custom fields of a reporting unit (design §9.5): the inputs a reporter
// fills, the read-only view for the approver, and the editor in Setup.
// Example: a masonry subcontractor reports Wall Type, Wall Thickness and Area
// Completed; an MEP subcontractor reports something else.

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCustomFields, saveCustomFields } from "@/lib/construction/daily-reporting/service";
import type { CustomField, CustomFieldSet, DrPayload } from "@/lib/construction/daily-reporting/types";
import { Field, inputClass, SectionCard } from "./dr-ui";

type Values = NonNullable<DrPayload["custom_fields"]>;

/** Inputs for the unit's custom fields. Renders nothing when the unit has none. */
export function DrCustomFieldInputs({
  fields,
  values,
  onChange,
  disabled,
  className,
}: {
  fields: CustomField[];
  values: Values;
  onChange: (values: Values) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (fields.length === 0) return null;
  const set = (key: string, value: string | number | null) => onChange({ ...values, [key]: value });

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {fields.map((f) => {
        const value = values[f.key] ?? "";
        const label = `${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`;
        return (
          <Field key={f.key} label={label}>
            {f.type === "select" ? (
              <select className={inputClass} disabled={disabled} value={String(value)} onChange={(e) => set(f.key, e.target.value || null)}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "number" ? (
              <input
                type="number"
                inputMode="decimal"
                className={inputClass}
                disabled={disabled}
                value={value}
                onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
              />
            ) : (
              <input className={inputClass} disabled={disabled} value={String(value)} onChange={(e) => set(f.key, e.target.value || null)} />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Read-only custom fields of a submitted version, labelled from the definition version it was written with. */
export function DrCustomFieldsView({ unitId, version, values }: { unitId: string; version: number | null | undefined; values: Values | undefined }) {
  const [def, setDef] = useState<CustomFieldSet | null>(null);
  const hasValues = !!values && Object.values(values).some((v) => v !== null && v !== "");

  useEffect(() => {
    if (!hasValues) return;
    let cancelled = false;
    getCustomFields(unitId, version)
      .then((d) => !cancelled && setDef(d))
      .catch(() => !cancelled && setDef(null));
    return () => {
      cancelled = true;
    };
  }, [unitId, version, hasValues]);

  if (!hasValues || !values) return null;
  const byKey = new Map((def?.fields ?? []).map((f) => [f.key, f]));
  return (
    <SectionCard title="Custom fields">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {Object.entries(values)
          .filter(([, v]) => v !== null && v !== "")
          .map(([key, v]) => {
            const f = byKey.get(key);
            return (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{f?.label ?? key}</dt>
                <dd className="font-medium">
                  {String(v)}
                  {f?.unit ? ` ${f.unit}` : ""}
                </dd>
              </div>
            );
          })}
      </dl>
    </SectionCard>
  );
}

const keyFromLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "f_$1")
    .slice(0, 40);

interface Row extends CustomField {
  optionsText: string;
  /** Existing fields keep their key so earlier reports stay readable. */
  locked: boolean;
}

/** Setup: define the custom fields of one reporting unit. Saving creates a new version. */
export function DrCustomFieldsEditor({ unitId, canEdit }: { unitId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomFields(unitId)
      .then((d) => {
        if (cancelled) return;
        setVersion(d?.version ?? null);
        setRows((d?.fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join(", "), locked: true })));
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  if (rows === null) {
    return (
      <SectionCard title="Custom fields">
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </SectionCard>
    );
  }

  const patch = (i: number, changes: Partial<Row>) => setRows((list) => (list ?? []).map((r, j) => (j === i ? { ...r, ...changes } : r)));

  async function save() {
    const fields: CustomField[] = [];
    for (const r of rows ?? []) {
      const label = r.label.trim();
      if (!label) return void toast.error("Every custom field needs a label.");
      const key = r.locked ? r.key : keyFromLabel(label);
      if (!key) return void toast.error(`"${label}" needs at least one letter or digit.`);
      if (fields.some((f) => f.key === key)) return void toast.error(`Two fields are called "${label}".`);
      const options = r.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
      if (r.type === "select" && options.length === 0) return void toast.error(`"${label}" needs at least one option.`);
      fields.push({
        key,
        label,
        type: r.type,
        ...(r.type === "select" ? { options } : {}),
        unit: r.type === "number" ? r.unit?.trim() || null : null,
        required: !!r.required,
      });
    }
    setSaving(true);
    try {
      const v = await saveCustomFields(unitId, fields);
      setVersion(v);
      setRows((list) => (list ?? []).map((r, i) => ({ ...r, key: fields[i].key, locked: true })));
      toast.success("Custom fields saved. They apply to new reports.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title={`Custom fields${version ? ` (version ${version})` : ""}`}
      action={
        canEdit ? (
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save
          </Button>
        ) : null
      }
    >
      <p className="text-sm text-muted-foreground">
        Extra fields this unit fills in on every report, for example Wall Type and Area Completed for a masonry subcontractor. Reports
        already submitted keep the fields they were written with.
      </p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No custom fields.</p> : null}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[2fr_1fr_2fr_auto_auto]">
            <Field label="Label">
              <input className={inputClass} disabled={!canEdit} value={r.label} onChange={(e) => patch(i, { label: e.target.value })} />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                disabled={!canEdit || r.locked}
                value={r.type}
                onChange={(e) => patch(i, { type: e.target.value as CustomField["type"] })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Choice</option>
              </select>
            </Field>
            {r.type === "select" ? (
              <Field label="Options (comma separated)">
                <input className={inputClass} disabled={!canEdit} value={r.optionsText} onChange={(e) => patch(i, { optionsText: e.target.value })} />
              </Field>
            ) : r.type === "number" ? (
              <Field label="Unit (optional)">
                <input className={inputClass} disabled={!canEdit} placeholder="mm, m², nos" value={r.unit ?? ""} onChange={(e) => patch(i, { unit: e.target.value })} />
              </Field>
            ) : (
              <div />
            )}
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={!!r.required} onChange={(e) => patch(i, { required: e.target.checked })} />
              Required
            </label>
            {canEdit ? (
              <Button size="sm" variant="outline" aria-label={`Remove ${r.label || "field"}`} onClick={() => setRows((list) => (list ?? []).filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit && rows.length < 20 ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setRows((list) => [...(list ?? []), { key: "", label: "", type: "text", optionsText: "", required: false, locked: false }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add field
        </Button>
      ) : null}
    </SectionCard>
  );
}
