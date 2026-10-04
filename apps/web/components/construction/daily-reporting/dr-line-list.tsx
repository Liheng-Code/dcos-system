"use client";

// Generic editable list of report lines (manpower, equipment, delays …).
// Each line carries a stable line_id so rules, evidence, corrections and
// verified quantities can point at it across versions.

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RuleResult, SectionKey } from "@/lib/construction/daily-reporting/types";
import { inputClass, RuleList } from "./dr-ui";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "datetime";
  options?: { value: string; label: string }[];
  /** Tailwind grid span on wide screens, out of 12. */
  span?: number;
  placeholder?: string;
}

export const newLineId = () => `l_${crypto.randomUUID().slice(0, 8)}`;

export function LineList<T extends { line_id: string }>({
  section,
  lines,
  columns,
  onChange,
  makeLine,
  addLabel,
  results,
  canEditLine,
  canAdd,
  emptyText,
}: {
  section: SectionKey;
  lines: T[];
  columns: Column<T>[];
  onChange: (lines: T[]) => void;
  makeLine: () => T;
  addLabel: string;
  results: RuleResult[];
  /** Whether a given line may be edited (item-level correction locks the rest). */
  canEditLine: (lineId: string) => boolean;
  canAdd: boolean;
  emptyText: string;
}) {
  const update = (lineId: string, key: string, value: unknown) =>
    onChange(lines.map((l) => (l.line_id === lineId ? { ...l, [key]: value } : l)));

  return (
    <div className="space-y-3">
      {lines.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
      {lines.map((line) => {
        const editable = canEditLine(line.line_id);
        const record = line as unknown as Record<string, unknown>;
        return (
          <div key={line.line_id} className={cn("rounded-md border border-border p-3", !editable && "bg-muted/40")}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
              {columns.map((col) => {
                const value = record[col.key];
                return (
                  <label
                    key={col.key}
                    className={cn("flex flex-col gap-1 text-xs", col.type === "text" && !col.span ? "col-span-2" : "", spanClass(col.span))}
                  >
                    <span className="font-medium text-muted-foreground">{col.label}</span>
                    {col.type === "select" ? (
                      <select
                        className={inputClass}
                        disabled={!editable}
                        value={(value as string) ?? ""}
                        onChange={(e) => update(line.line_id, col.key, e.target.value || null)}
                      >
                        <option value="">Select…</option>
                        {col.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        className="h-6 w-6 rounded border-input"
                        disabled={!editable}
                        checked={value === true}
                        onChange={(e) => update(line.line_id, col.key, e.target.checked)}
                      />
                    ) : col.type === "number" ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputClass}
                        disabled={!editable}
                        value={value === null || value === undefined ? "" : String(value)}
                        onChange={(e) => update(line.line_id, col.key, e.target.value === "" ? null : Number(e.target.value))}
                      />
                    ) : (
                      <input
                        type={col.type === "datetime" ? "datetime-local" : "text"}
                        className={inputClass}
                        disabled={!editable}
                        placeholder={col.placeholder}
                        value={(value as string) ?? ""}
                        onChange={(e) => update(line.line_id, col.key, e.target.value || null)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="flex-1">
                <RuleList results={results} forSection={section} lineId={line.line_id} />
              </div>
              {editable && canAdd ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove line"
                  onClick={() => onChange(lines.filter((l) => l.line_id !== line.line_id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
      {canAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, makeLine()])}>
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

function spanClass(span?: number): string {
  // Explicit map so Tailwind can see every class name.
  switch (span) {
    case 2:
      return "md:col-span-2";
    case 3:
      return "md:col-span-3";
    case 4:
      return "md:col-span-4";
    case 5:
      return "md:col-span-5";
    case 6:
      return "md:col-span-6";
    case 8:
      return "md:col-span-8";
    case 12:
      return "md:col-span-12";
    default:
      return "md:col-span-3";
  }
}
