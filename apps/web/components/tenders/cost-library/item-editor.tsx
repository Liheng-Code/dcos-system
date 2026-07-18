"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type PrelimLibraryItemWithComponents,
  type PrelimLibraryComponent,
  type SiteDataParams,
  updateLibraryItem,
  createLibraryComponent,
  updateLibraryComponent,
  deleteLibraryComponent,
} from "@/lib/prelim-library-service";
import { toast } from "sonner";

interface ItemEditorProps {
  item: PrelimLibraryItemWithComponents;
  params: SiteDataParams;
  onClose: () => void;
  onSaved: () => void;
}

function resolveFormula(formula: string, params: SiteDataParams, fallback: number = 0): number {
  if (!formula || formula.trim() === "") return fallback;
  try {
    const expr = formula.replace(/[A-Z][A-Z0-9]*/g, (match) => {
      return String((params as unknown as Record<string, number>)[match] ?? 0);
    });
    return Function(`"use strict"; return (${expr})`)() as number;
  } catch {
    return fallback;
  }
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function ItemEditor({ item, params, onClose, onSaved }: ItemEditorProps) {
  const [comps, setComps] = useState<PrelimLibraryComponent[]>([...item.components]);
  const [saving, setSaving] = useState(false);
  const [newComp, setNewComp] = useState({ description: "", qty_formula: "1", unit: "no", rate: 0 });

  useEffect(() => {
    setComps([...item.components]);
    setNewComp({ description: "", qty_formula: "1", unit: "no", rate: 0 });
  }, [item]);

  const totalRate = comps.reduce((sum, c) => {
    const qty = resolveFormula(c.qty_formula, params, 1);
    return sum + qty * c.rate;
  }, 0);

  const qty = item.calc_mode === "param" && item.formula
    ? resolveFormula(item.formula, params, item.default_qty)
    : item.default_qty;
  const amount = qty * totalRate;

  function handleCompChange(index: number, field: string, value: string | number) {
    setComps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleSaveComp(comp: PrelimLibraryComponent, index: number) {
    try {
      await updateLibraryComponent(comp.id, {
        description: comp.description,
        qty_formula: comp.qty_formula,
        unit: comp.unit,
        rate: comp.rate,
      });
      toast.success("Component updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update component");
    }
  }

  async function handleDeleteComp(compId: string, index: number) {
    try {
      await deleteLibraryComponent(compId);
      setComps((prev) => prev.filter((_, i) => i !== index));
      toast.success("Component deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete component");
    }
  }

  async function handleAddComp() {
    if (!newComp.description.trim()) return;
    try {
      const created = await createLibraryComponent({
        item_id: item.id,
        description: newComp.description,
        qty_formula: newComp.qty_formula,
        unit: newComp.unit,
        rate: newComp.rate,
        sort_order: comps.length,
      });
      setComps((prev) => [...prev, created]);
      setNewComp({ description: "", qty_formula: "1", unit: "no", rate: 0 });
      toast.success("Component added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add component");
    }
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs text-muted-foreground">{item.unit}</span>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs text-muted-foreground">Qty: {qty}</span>
            </div>
            <h3 className="text-sm font-semibold mt-1">{item.description}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Component</th>
                <th className="px-3 py-2 text-left font-medium w-24">Qty Formula</th>
                <th className="px-3 py-2 text-left font-medium w-20">Unit</th>
                <th className="px-3 py-2 text-right font-medium w-24">Rate ($)</th>
                <th className="px-3 py-2 text-right font-medium w-28">Amount ($)</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comps.map((comp, i) => {
                const compQty = resolveFormula(comp.qty_formula, params, 1);
                const compAmount = compQty * comp.rate;
                return (
                  <tr key={comp.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5">
                      <input
                        value={comp.description}
                        onChange={(e) => handleCompChange(i, "description", e.target.value)}
                        onBlur={() => handleSaveComp(comp, i)}
                        className="w-full bg-transparent text-sm border-none outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={comp.qty_formula}
                        onChange={(e) => handleCompChange(i, "qty_formula", e.target.value)}
                        onBlur={() => handleSaveComp(comp, i)}
                        className="w-full bg-transparent text-xs font-mono border border-border rounded px-1.5 py-0.5 outline-none focus:border-blue-400"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{comp.unit}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(comp.rate)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(compAmount)}</td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => handleDeleteComp(comp.id, i)}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right text-sm">Item Rate</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totalRate)}</td>
                <td></td>
              </tr>
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right text-sm">Amount ({qty} x {formatCurrency(totalRate)})</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(amount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">New Component</label>
            <input
              value={newComp.description}
              onChange={(e) => setNewComp({ ...newComp, description: e.target.value })}
              placeholder="Description"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="w-24 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Qty</label>
            <input
              value={newComp.qty_formula}
              onChange={(e) => setNewComp({ ...newComp, qty_formula: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="w-20 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Unit</label>
            <input
              value={newComp.unit}
              onChange={(e) => setNewComp({ ...newComp, unit: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="w-28 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Rate ($)</label>
            <input
              type="number"
              value={newComp.rate}
              onChange={(e) => setNewComp({ ...newComp, rate: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleAddComp} disabled={!newComp.description.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
