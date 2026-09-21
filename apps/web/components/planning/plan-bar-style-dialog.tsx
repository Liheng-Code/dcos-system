"use client";

import { useState } from "react";
import { Loader2, Palette, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BAR_TEXT_FIELD_OPTIONS,
  barBorderRadius,
  type BarCategoryStyle,
  type BarShape,
  type BarTextField,
  type GanttBarStyleSettings,
} from "@/lib/planning/gantt-bar-style";

interface Props {
  style: GanttBarStyleSettings;
  onClose: () => void;
  onSave: (next: GanttBarStyleSettings) => Promise<void>;
}

const SHAPES: { value: BarShape; label: string }[] = [
  { value: "pill", label: "Pill (rounded ends)" },
  { value: "rounded", label: "Rounded corners" },
  { value: "square", label: "Square" },
];

const CATEGORIES: { key: keyof Pick<GanttBarStyleSettings, "normal" | "critical" | "nearCritical">; label: string }[] = [
  { key: "normal", label: "Normal task" },
  { key: "critical", label: "Critical task" },
  { key: "nearCritical", label: "Near-critical task" },
];

const TEXT_POSITIONS: { key: keyof GanttBarStyleSettings["text"]; label: string }[] = [
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "inside", label: "Inside" },
];

function CategoryRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BarCategoryStyle;
  onChange: (next: BarCategoryStyle) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-2.5">
      <div
        className="h-4 w-16 shrink-0"
        style={{ background: value.color, borderRadius: barBorderRadius(value.shape) }}
      />
      <span className="w-32 shrink-0 font-medium">{label}</span>
      <input
        type="color"
        value={value.color}
        onChange={(e) => onChange({ ...value, color: e.target.value })}
        className="h-8 w-12 shrink-0 rounded-md border border-border bg-background"
      />
      <select
        value={value.shape}
        onChange={(e) => onChange({ ...value, shape: e.target.value as BarShape })}
        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none"
      >
        {SHAPES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}

export function PlanBarStyleDialog({ style, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<GanttBarStyleSettings>(style);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Palette className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Format Bar</h2>
            <p className="text-[11px] text-white/70">Applies to every task bar of that kind on this chart — like MS Project&apos;s Bar Styles</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 text-xs">
          <Tabs defaultValue="shape">
            <TabsList>
              <TabsTrigger value="shape">Bar Shape</TabsTrigger>
              <TabsTrigger value="text">Bar Text</TabsTrigger>
            </TabsList>

            <TabsContent value="shape" className="mt-3 space-y-2">
              {CATEGORIES.map((c) => (
                <CategoryRow
                  key={c.key}
                  label={c.label}
                  value={draft[c.key]}
                  onChange={(next) => setDraft((d) => ({ ...d, [c.key]: next }))}
                />
              ))}
            </TabsContent>

            <TabsContent value="text" className="mt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Choose what shows at each position around every task bar.
              </p>
              {TEXT_POSITIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-medium">{p.label}</span>
                  <select
                    value={draft.text[p.key]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        text: { ...d.text, [p.key]: e.target.value as BarTextField },
                      }))
                    }
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none"
                  >
                    {BAR_TEXT_FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
