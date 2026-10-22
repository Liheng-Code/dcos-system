"use client";

import { ArrowUpToLine, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { alternateAmount, alternateDelta, type TenderBoqItemAlternate } from "@/lib/qs/boq-alternates";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "+$1,000.00" (Add) / "−$1,000.00" (Omit) */
export function formatDelta(delta: number): string {
  if (delta === 0) return "$0.00";
  return `${delta > 0 ? "+" : "−"}$${fmt(Math.abs(delta))}`;
}

export function deltaClass(delta: number): string {
  return delta > 0 ? "text-amber-700" : delta < 0 ? "text-green-700" : "text-muted-foreground";
}

interface LineLike {
  id: string;
  quantity: number;
  total_amount: number | null;
}

/** "Alt n" badge + chevron toggle, rendered inside the description cell of a base line. */
export function AlternateToggle({
  count, expanded, onToggle,
}: { count: number; expanded: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-0.5 align-middle text-muted-foreground hover:text-foreground"
      title={expanded ? "Hide alternates" : "Show alternates"}
    >
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700 text-[9px]">Alt {count}</Badge>
    </button>
  );
}

interface AlternateSubRowsProps {
  item: LineLike;
  alternates: TenderBoqItemAlternate[];
  mode: "flat" | "detail";
  /** Visible column ids, in order (flat mode only). */
  flatColumnIds?: string[];
  canEdit: boolean;
  onEdit: (alt: TenderBoqItemAlternate) => void;
  onDelete: (alt: TenderBoqItemAlternate) => void;
  onPromote: (alt: TenderBoqItemAlternate) => void;
}

function altCells(alt: TenderBoqItemAlternate, qty: number) {
  const laborRate = alt.labor_net_cost * (1 + alt.labor_margin_pct / 100);
  const materialRate = alt.material_net_cost * (1 + alt.material_margin_pct / 100);
  return {
    qty: fmt(qty),
    labor_net: `$${fmt(alt.labor_net_cost)}`,
    labor_margin: `${fmt(alt.labor_margin_pct)}%`,
    labor_rate: `$${fmt(laborRate)}`,
    material_net: `$${fmt(alt.material_net_cost)}`,
    material_margin: `${fmt(alt.material_margin_pct)}%`,
    material_rate: `$${fmt(materialRate)}`,
    total_rate: `$${fmt(alt.unit_rate)}`,
    amount: `$${fmt(alternateAmount(qty, alt.unit_rate))}`,
  } as Record<string, string>;
}

export function AlternateSubRows({
  item, alternates, mode, flatColumnIds, canEdit, onEdit, onDelete, onPromote,
}: AlternateSubRowsProps) {
  const baseAmount = item.total_amount ?? 0;

  function descriptionCell(alt: TenderBoqItemAlternate, delta: number, cls: string) {
    return (
      <td key="description" className={cn("px-3 py-1 text-xs", cls)}>
        <div className="flex items-baseline gap-1.5 pl-5">
          <span className="font-medium not-italic text-violet-700 whitespace-nowrap">Alt {alt.alt_no}</span>
          <span className="truncate">{alt.description}</span>
        </div>
        <div className="pl-5 text-[10px]">
          <span className="text-muted-foreground">Δ vs base </span>
          <span className={cn("font-medium not-italic", deltaClass(delta))}>{formatDelta(delta)}</span>
          <span className="text-muted-foreground"> · memo only</span>
        </div>
      </td>
    );
  }

  function actionsCell(alt: TenderBoqItemAlternate) {
    return (
      <td className="px-2 py-1">
        {canEdit && (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => onPromote(alt)} className="text-muted-foreground hover:text-violet-700" title="Make base rate">
              <ArrowUpToLine className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onEdit(alt)} className="text-muted-foreground hover:text-blue-600" title="Edit alternate">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onDelete(alt)} className="text-muted-foreground hover:text-red-600" title="Delete alternate">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </td>
    );
  }

  return (
    <>
      {alternates.map((alt) => {
        const delta = alternateDelta(item.quantity, alt.unit_rate, baseAmount);
        const cells = altCells(alt, item.quantity);
        const rowCls = "bg-muted/20 italic text-muted-foreground";
        if (mode === "flat") {
          const ids = flatColumnIds ?? [];
          // With Description hidden, the "Alt n" label and Δ take the first visible column.
          const labelId = ids.includes("description") ? "description" : ids[0];
          return (
            <tr key={`alt-${alt.id}`} className={rowCls}>
              {ids.map((id) => {
                if (id === labelId) return descriptionCell(alt, delta, "max-w-[250px]");
                const text = cells[id] ?? "";
                return (
                  <td key={id} className={cn("px-3 py-1 text-xs whitespace-nowrap", id in cells && id !== "unit" && "text-right")}>
                    {id === "unit" ? "" : text}
                  </td>
                );
              })}
              {actionsCell(alt)}
            </tr>
          );
        }
        return (
          <tr key={`alt-${alt.id}`} className={rowCls}>
            {descriptionCell(alt, delta, "pl-10")}
            <td className="px-3 py-1" />
            <td className="px-3 py-1 text-right text-xs">{cells.qty}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.labor_net}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.labor_margin}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.labor_rate}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.material_net}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.material_margin}</td>
            <td className="px-3 py-1 text-right text-xs">{cells.material_rate}</td>
            <td className="px-3 py-1 text-right text-xs font-medium">{cells.total_rate}</td>
            <td className="px-3 py-1 text-right text-xs font-medium">{cells.amount}</td>
            {actionsCell(alt)}
          </tr>
        );
      })}
    </>
  );
}
