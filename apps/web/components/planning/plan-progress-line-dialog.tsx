"use client";

import { useState } from "react";
import { Loader2, TrendingUp, X } from "lucide-react";
import type {
  ProgressLineDateSource,
  ProgressLinePointShape,
  ProgressLineStyle,
} from "./gantt-progress-line";

interface Props {
  style: ProgressLineStyle;
  onClose: () => void;
  onSave: (next: ProgressLineStyle) => Promise<void>;
}

const SHAPES: { value: ProgressLinePointShape; label: string }[] = [
  { value: "diamond", label: "Diamond" },
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
];

export function PlanProgressLineDialog({ style, onClose, onSave }: Props) {
  const [dateSource, setDateSource] = useState<ProgressLineDateSource>(style.dateSource);
  const [customDate, setCustomDate] = useState(style.customDate ?? "");
  const [color, setColor] = useState(style.color);
  const [pointShape, setPointShape] = useState<ProgressLinePointShape>(style.pointShape);
  const [pointColor, setPointColor] = useState(style.pointColor);
  const [showDate, setShowDate] = useState(style.showDate);
  const [saving, setSaving] = useState(false);

  const invalid = dateSource === "custom" && !customDate;

  async function handleSave() {
    if (invalid) return;
    setSaving(true);
    await onSave({
      dateSource,
      customDate: dateSource === "custom" ? customDate : null,
      color,
      pointShape,
      pointColor,
      showDate,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Progress Line</h2>
            <p className="text-[11px] text-white/70">Where it&apos;s drawn and how it looks — like MS Project&apos;s Progress Lines dialog</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <div>
            <div className="mb-1 font-semibold">Display at</div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={dateSource === "data_date"} onChange={() => setDateSource("data_date")} /> Project data date
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={dateSource === "today"} onChange={() => setDateSource("today")} /> Today
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={dateSource === "custom"} onChange={() => setDateSource("custom")} /> Custom date
              </label>
            </div>
            {dateSource === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none"
              />
            )}
            {invalid && <p className="mt-1 text-[11px] text-red-600">Pick a custom date.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-semibold">Line color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background"
              />
            </label>
            <label className="block">
              <span className="font-semibold">Progress point color</span>
              <input
                type="color"
                value={pointColor}
                onChange={(e) => setPointColor(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background"
              />
            </label>
          </div>

          <label className="block">
            <span className="font-semibold">Progress point shape</span>
            <select
              value={pointShape}
              onChange={(e) => setPointShape(e.target.value as ProgressLinePointShape)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            >
              {SHAPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} /> Show the line&apos;s date at the top of the chart
          </label>
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
            disabled={saving || invalid}
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
