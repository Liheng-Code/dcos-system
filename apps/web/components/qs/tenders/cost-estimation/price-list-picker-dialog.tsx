"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { type TenderPriceListItem } from "@/lib/qs/tender-cost-service";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  open: boolean;
  onClose: () => void;
  priceList: TenderPriceListItem[];
  onConfirm: (selected: TenderPriceListItem[]) => void;
}

export function PriceListPickerDialog({ open, onClose, priceList, onConfirm }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return priceList;
    const q = search.trim().toLowerCase();
    return priceList.filter((p) =>
      p.item_code.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.budget_codes?.code ?? "").toLowerCase().includes(q)
    );
  }, [priceList, search]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleClose() {
    setSearch("");
    setSelectedIds(new Set());
    onClose();
  }

  function handleConfirm() {
    const result = priceList.filter((p) => selectedIds.has(p.id));
    setSearch("");
    setSelectedIds(new Set());
    onConfirm(result);
  }

  const totalSelected = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add from Price List</DialogTitle>
          <DialogDescription>Select rates from the tender Price List to add as BOQ items. Labor/Material net cost, margins, and rates are linked and stay in sync with the Price List.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, description, budget code..."
            className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-hidden focus:border-primary"
          />
        </div>

        {priceList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No Price List rates found for this tender yet — pull from the Element Library or import a Price List first.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No rates match &ldquo;{search}&rdquo;.</p>
        ) : (
          <div className="flex-1 overflow-y-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-2 py-1.5 font-medium">Code</th>
                  <th className="text-left px-2 py-1.5 font-medium">Description</th>
                  <th className="text-right px-2 py-1.5 font-medium">Labor Rate($)</th>
                  <th className="text-right px-2 py-1.5 font-medium">Material Rate($)</th>
                  <th className="text-right px-2 py-1.5 font-medium">Total Rate($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/20"
                    onClick={() => toggle(p.id)}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggle(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono">{p.item_code}</td>
                    <td className="px-2 py-1.5">
                      {p.description} <span className="text-muted-foreground">/ {p.unit}</span>
                      {p.budget_codes?.code && <span className="text-muted-foreground ml-1">[{p.budget_codes.code}]</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">${fmt(p.labor_rate)}</td>
                    <td className="px-2 py-1.5 text-right">${fmt(p.material_rate)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">${fmt(p.total_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={totalSelected === 0}>
            Add {totalSelected > 0 ? `${totalSelected} item${totalSelected !== 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
