"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, PackageOpen, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { BoqItemForPr } from "@/lib/qs-service";

interface SelectedItem {
  boq_item_id: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  budget_code: string;
  notes: string;
}

interface Props {
  projectId: string;
  onPick: (items: SelectedItem[]) => void;
}

const fmt = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BoqItemPickerDialog({ projectId, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BoqItemForPr[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [boqFilter, setBoqFilter] = useState<string>("all");

  const boqGroups = useMemo(() => {
    const map = new Map<string, { boq_id: string; boq_number: string; boq_type: string; count: number }>();
    for (const item of items) {
      const key = item.boq_id;
      if (!map.has(key)) map.set(key, { boq_id: item.boq_id, boq_number: item.boq_number, boq_type: item.boq_type, count: 0 });
      map.get(key)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.boq_number.localeCompare(b.boq_number));
  }, [items]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("qs_v_boq_requisition_status")
      .select("*")
      .eq("project_id", projectId)
      .gt("remaining_quantity", 0)
      .order("seq")
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setItems((data ?? []) as BoqItemForPr[]);
      }, () => {})
      .then(() => { setLoading(false); });
  }, [open, projectId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.boq_item_id)));
    }
  }

  function handleClose() {
    setOpen(false);
    setSelected(new Set());
    setSearch("");
    setBoqFilter("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (boqFilter === "all" || i.boq_id === boqFilter) &&
        (!q ||
          i.description.toLowerCase().includes(q) ||
          (i.item_code && i.item_code.toLowerCase().includes(q))),
    );
  }, [items, boqFilter, search]);

  function handleConfirm() {
    const picked: SelectedItem[] = items
      .filter((i) => selected.has(i.boq_item_id))
      .map((i) => ({
        boq_item_id: i.boq_item_id,
        item_code: i.item_code ?? "",
        description: i.description,
        unit: i.unit,
        quantity: i.remaining_quantity,
        unit_rate: i.unit_rate,
        budget_code: "",
        notes: "",
      }));
    if (!picked.length) {
      toast.error("Select at least one item");
      return;
    }
    onPick(picked);
    handleClose();
  }

  const totalSelected = selected.size;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <PackageOpen className="h-3.5 w-3.5" />
        Pick from BOQ
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick BOQ Items</DialogTitle>
          <DialogDescription>
            Select items from the project BOQ baseline to add as PR line items.
          </DialogDescription>
        </DialogHeader>

        {boqGroups.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                boqFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setBoqFilter("all")}
            >
              All ({items.length})
            </button>
            {boqGroups.map((g) => (
              <button
                key={g.boq_id}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  boqFilter === g.boq_id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setBoqFilter(g.boq_id === boqFilter ? "all" : g.boq_id)}
              >
                {g.boq_number} ({g.count})
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description..."
            className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-hidden focus:border-primary"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <PackageOpen className="mb-2 h-8 w-8" />
            <p className="text-sm">
              {items.length === 0
                ? "No BOQ items with remaining quantity"
                : "No items match your search"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  <th className="text-left px-2 py-1.5 font-medium">Code</th>
                  <th className="text-left px-2 py-1.5 font-medium">Description</th>
                  <th className="text-center px-2 py-1.5 font-medium">Unit</th>
                  <th className="text-right px-2 py-1.5 font-medium">BOQ Qty</th>
                  <th className="text-right px-2 py-1.5 font-medium">Remaining</th>
                  <th className="text-right px-2 py-1.5 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr
                    key={item.boq_item_id}
                    className={`cursor-pointer transition-colors ${
                      selected.has(item.boq_item_id) ? "bg-primary/5" : "hover:bg-muted/20"
                    }`}
                    onClick={() => toggle(item.boq_item_id)}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(item.boq_item_id)}
                        onChange={() => toggle(item.boq_item_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">
                      {item.item_code ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {item.description}
                      {boqGroups.length > 1 && boqFilter === "all" && (
                        <span
                          className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            item.boq_type === "preliminary"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {item.boq_number}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">{item.unit}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {item.boq_quantity.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-emerald-600">
                      {item.remaining_quantity.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">${fmt(item.unit_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={totalSelected === 0}>
            Add {totalSelected > 0 ? `${totalSelected} Item${totalSelected !== 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
