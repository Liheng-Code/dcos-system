"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, Save, Undo2, Copy, Sparkles, Filter, Search, Check, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  bulkUpdateBoqQuantities,
  type TenderBoqItem,
} from "@/lib/qs/tender-cost-service";
import { inferLevelType } from "@/lib/level-library";

interface Props {
  items: TenderBoqItem[];
  isLocked?: boolean;
  onSaved: () => void;
}

interface MatrixCell {
  id: string;
  level: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
}

interface MatrixRow {
  rowKey: string;
  discipline: string;
  section: string;
  sub_section: string;
  sub_element: string;
  unit: string;
  avgUnitRate: number;
  cellsByLevel: Map<string, MatrixCell>;
  totalQty: number;
  totalAmount: number;
}

const TYPE_ORDER: Record<string, number> = {
  basement: 0,
  ground: 1,
  mezzanine: 2,
  podium: 3,
  typical: 4,
  penthouse: 5,
  roof: 6,
  other: 7,
};

function sortLevelsNatural(levels: string[]): string[] {
  return [...levels].sort((a, b) => {
    if (a === "All") return 1;
    if (b === "All") return -1;
    const typeA = inferLevelType(a);
    const typeB = inferLevelType(b);
    const orderDiff = (TYPE_ORDER[typeA] ?? 7) - (TYPE_ORDER[typeB] ?? 7);
    if (orderDiff !== 0) return orderDiff;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BoqQuantityMatrix({ items, isLocked = false, onSaved }: Props) {
  const [dirtyQuantities, setDirtyQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Spread Modal State
  const [spreadModal, setSpreadModal] = useState<{
    open: boolean;
    rowTitle: string;
    sourceLevel: string;
    sourceQty: number;
    cells: MatrixCell[];
    selectedTargetLevels: Set<string>;
  }>({
    open: false,
    rowTitle: "",
    sourceLevel: "",
    sourceQty: 0,
    cells: [],
    selectedTargetLevels: new Set(),
  });

  // 1. Extract and sort unique levels (Columns)
  const distinctLevels = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.level) set.add(item.level);
    }
    return sortLevelsNatural(Array.from(set));
  }, [items]);

  // 2. Extract unique disciplines for filtering
  const distinctDisciplines = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.discipline) set.add(item.discipline);
    }
    return Array.from(set);
  }, [items]);

  // 3. Group items into Matrix Rows (CBS Elements)
  const rows = useMemo(() => {
    const rowMap = new Map<string, MatrixRow>();

    for (const item of items) {
      const disc = item.discipline || "General";
      const sec = item.section || "General";
      const subSec = item.sub_section || "";
      const subEl = item.sub_element || item.description;
      const unit = item.unit || "m";
      const key = `${disc}:::${sec}:::${subSec}:::${subEl}:::${unit}`;

      let row = rowMap.get(key);
      if (!row) {
        row = {
          rowKey: key,
          discipline: disc,
          section: sec,
          sub_section: subSec,
          sub_element: subEl,
          unit,
          avgUnitRate: item.unit_rate || 0,
          cellsByLevel: new Map(),
          totalQty: 0,
          totalAmount: 0,
        };
        rowMap.set(key, row);
      }

      const activeQty = dirtyQuantities[item.id] !== undefined ? dirtyQuantities[item.id] : item.quantity;
      const totalAmt = activeQty * (item.unit_rate || 0);

      row.cellsByLevel.set(item.level || "All", {
        id: item.id,
        level: item.level || "All",
        quantity: activeQty,
        unit_rate: item.unit_rate || 0,
        total_amount: totalAmt,
      });

      row.totalQty += activeQty;
      row.totalAmount += totalAmt;
    }

    return Array.from(rowMap.values());
  }, [items, dirtyQuantities]);

  // 4. Filter Rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedDiscipline !== "All" && r.discipline !== selectedDiscipline) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${r.section} ${r.sub_section} ${r.sub_element}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rows, selectedDiscipline, searchQuery]);

  // 5. Calculate Column Totals
  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const lvl of distinctLevels) totals[lvl] = 0;
    let grandTotal = 0;

    for (const row of filteredRows) {
      for (const [lvl, cell] of row.cellsByLevel.entries()) {
        totals[lvl] = (totals[lvl] || 0) + cell.total_amount;
        grandTotal += cell.total_amount;
      }
    }
    return { byLevel: totals, grandTotal };
  }, [filteredRows, distinctLevels]);

  const hasDirtyCells = Object.keys(dirtyQuantities).length > 0;

  const handleCellChange = useCallback((itemId: string, val: string) => {
    const num = parseFloat(val);
    setDirtyQuantities((prev) => ({
      ...prev,
      [itemId]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  }, []);

  async function handleSaveChanges() {
    if (!hasDirtyCells) return;
    setSaving(true);
    try {
      const updates = Object.entries(dirtyQuantities).map(([id, quantity]) => ({ id, quantity }));
      const count = await bulkUpdateBoqQuantities(updates);
      toast.success(`Saved quantities for ${count} items`);
      setDirtyQuantities({});
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDirtyQuantities({});
  }

  // Open Spread Modal
  function openSpreadDialog(row: MatrixRow) {
    const cellList = Array.from(row.cellsByLevel.values());
    // Find the first cell with a quantity > 0 as default source
    const defaultSource = cellList.find((c) => c.quantity > 0) || cellList[0];
    if (!defaultSource) {
      toast.error("No items found for this element.");
      return;
    }

    const targets = new Set(cellList.filter((c) => c.level !== defaultSource.level).map((c) => c.level));

    setSpreadModal({
      open: true,
      rowTitle: `${row.sub_section ? row.sub_section + " › " : ""}${row.sub_element}`,
      sourceLevel: defaultSource.level,
      sourceQty: defaultSource.quantity,
      cells: cellList,
      selectedTargetLevels: targets,
    });
  }

  function applySpread() {
    const newDirty = { ...dirtyQuantities };
    for (const cell of spreadModal.cells) {
      if (spreadModal.selectedTargetLevels.has(cell.level)) {
        newDirty[cell.id] = spreadModal.sourceQty;
      }
    }
    setDirtyQuantities(newDirty);
    setSpreadModal((prev) => ({ ...prev, open: false }));
    toast.success(`Spread ${spreadModal.sourceQty} across ${spreadModal.selectedTargetLevels.size} levels`);
  }

  return (
    <div className="space-y-3">
      {/* Matrix Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2">
          {/* Discipline Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="h-8 rounded border border-border bg-background px-2 text-xs font-medium"
            >
              <option value="All">All Disciplines</option>
              {distinctDisciplines.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search element..."
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>

          <Badge variant="outline" className="text-xs">
            {filteredRows.length} Elements × {distinctLevels.length} Levels
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {hasDirtyCells && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                disabled={saving}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSaveChanges}
                disabled={saving || isLocked}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 font-semibold gap-1.5 shadow-xs"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Matrix Quantities ({Object.keys(dirtyQuantities).length})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Spreadsheet Matrix Grid */}
      <div className="rounded-lg border border-border bg-background overflow-x-auto shadow-xs">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
              <th className="sticky left-0 z-20 bg-muted/90 px-3 py-2.5 text-left min-w-[240px] border-r">
                Element Description (CBS)
              </th>
              <th className="px-2 py-2.5 text-center min-w-[50px] border-r">Unit</th>
              <th className="px-2 py-2.5 text-right min-w-[70px] border-r">Rate ($)</th>

              {/* Location Columns (LBS) */}
              {distinctLevels.map((lvl) => (
                <th
                  key={lvl}
                  className="px-2 py-2.5 text-right min-w-[85px] border-r font-mono tracking-tight"
                >
                  <div className="text-[11px] font-bold text-foreground">{lvl}</div>
                  <div className="text-[9px] font-normal uppercase text-muted-foreground">{inferLevelType(lvl)}</div>
                </th>
              ))}

              <th className="sticky right-[100px] z-10 bg-muted/90 px-3 py-2.5 text-right min-w-[90px] border-r font-bold">
                Total Qty
              </th>
              <th className="sticky right-0 z-10 bg-muted/90 px-3 py-2.5 text-right min-w-[100px] font-bold">
                Total ($)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={distinctLevels.length + 5} className="py-12 text-center text-muted-foreground">
                  No elements found matching the filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.rowKey} className="hover:bg-muted/30 transition-colors group">
                  {/* Element Description */}
                  <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/40 px-3 py-2 border-r">
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate">
                        <div className="font-semibold text-foreground truncate">{row.sub_element}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {row.section} {row.sub_section && `› ${row.sub_section}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-700"
                        title="Spread quantity across typical floors"
                        onClick={() => openSpreadDialog(row)}
                        disabled={isLocked}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>

                  {/* Unit */}
                  <td className="px-2 py-2 text-center text-muted-foreground border-r font-mono">
                    {row.unit}
                  </td>

                  {/* Unit Rate */}
                  <td className="px-2 py-2 text-right text-muted-foreground border-r font-mono">
                    {fmt(row.avgUnitRate)}
                  </td>

                  {/* Level Cell Inputs */}
                  {distinctLevels.map((lvl) => {
                    const cell = row.cellsByLevel.get(lvl);
                    if (!cell) {
                      return (
                        <td key={lvl} className="px-2 py-1 text-center text-muted-foreground/30 border-r bg-muted/10 font-mono">
                          -
                        </td>
                      );
                    }

                    const isDirty = dirtyQuantities[cell.id] !== undefined;

                    return (
                      <td
                        key={lvl}
                        className={`p-1 border-r transition-colors ${
                          isDirty ? "bg-amber-50/70 dark:bg-amber-950/30" : ""
                        }`}
                      >
                        <input
                          type="number"
                          step="any"
                          min="0"
                          disabled={isLocked}
                          value={cell.quantity === 0 ? "" : cell.quantity}
                          placeholder="0"
                          onChange={(e) => handleCellChange(cell.id, e.target.value)}
                          className={`w-full h-7 px-1.5 text-right font-mono text-xs rounded border transition-colors outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                            isDirty
                              ? "border-amber-400 font-bold text-amber-900 dark:text-amber-200"
                              : "border-transparent hover:border-border focus:bg-background"
                          }`}
                        />
                      </td>
                    );
                  })}

                  {/* Row Totals */}
                  <td className="sticky right-[100px] z-10 bg-background group-hover:bg-muted/40 px-3 py-2 text-right border-r font-mono font-semibold">
                    {fmt(row.totalQty)}
                  </td>
                  <td className="sticky right-0 z-10 bg-background group-hover:bg-muted/40 px-3 py-2 text-right font-mono font-bold text-foreground">
                    ${fmt(row.totalAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* Matrix Footer (Location Totals) */}
          <tfoot className="bg-muted/80 border-t-2 border-border font-bold">
            <tr>
              <td className="sticky left-0 z-20 bg-muted/90 px-3 py-2.5 text-left border-r uppercase text-[11px] tracking-wider">
                Total Level Cost
              </td>
              <td className="border-r" />
              <td className="border-r" />

              {distinctLevels.map((lvl) => (
                <td key={lvl} className="px-2 py-2.5 text-right border-r font-mono text-[11px]">
                  ${fmt(columnTotals.byLevel[lvl] || 0)}
                </td>
              ))}

              <td className="sticky right-[100px] z-10 bg-muted/90 px-3 py-2.5 border-r text-right" />
              <td className="sticky right-0 z-10 bg-muted/90 px-3 py-2.5 text-right font-mono text-xs text-blue-600 font-extrabold">
                ${fmt(columnTotals.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Spread Modal */}
      <Dialog
        open={spreadModal.open}
        onOpenChange={(open) => setSpreadModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Spread Quantity Across Typical Floors
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fast-fill repetitive floors with the takeoff quantity from an established floor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-2.5 rounded-md border bg-muted/40 space-y-1">
              <div className="text-xs font-semibold text-foreground">{spreadModal.rowTitle}</div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Source Floor: <strong className="font-mono text-foreground">{spreadModal.sourceLevel}</strong></span>
                <span>Takeoff Quantity: <strong className="font-mono text-blue-600 font-bold">{spreadModal.sourceQty}</strong></span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Select Target Floors to Apply</Label>
                <button
                  type="button"
                  onClick={() => {
                    const allTargets = new Set(spreadModal.cells.map((c) => c.level));
                    setSpreadModal((prev) => ({ ...prev, selectedTargetLevels: allTargets }));
                  }}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Select All
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                {spreadModal.cells.map((cell) => {
                  const checked = spreadModal.selectedTargetLevels.has(cell.level);
                  const isSource = cell.level === spreadModal.sourceLevel;
                  return (
                    <label
                      key={cell.id}
                      className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer ${
                        isSource ? "bg-blue-50/50 dark:bg-blue-950/20 text-blue-700" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={isSource}
                        onCheckedChange={(val) => {
                          setSpreadModal((prev) => {
                            const next = new Set(prev.selectedTargetLevels);
                            if (val) next.add(cell.level);
                            else next.delete(cell.level);
                            return { ...prev, selectedTargetLevels: next };
                          });
                        }}
                      />
                      <span className="font-mono font-semibold">{cell.level}</span>
                      {isSource && <span className="text-[10px] text-muted-foreground">(Source)</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSpreadModal((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={applySpread}
              className="bg-blue-600 hover:bg-blue-700 font-semibold"
            >
              Apply to {spreadModal.selectedTargetLevels.size} Floors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

