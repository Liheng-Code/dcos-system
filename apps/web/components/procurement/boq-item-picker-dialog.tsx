"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, PackageOpen, Search, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BoqItemForPr } from "@/lib/qs/public";

interface SectionInfo {
  id: string;
  section_code: string | null;
  title: string;
  seq: number;
}

interface SelectedItem {
  boq_item_id: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  budget_code: string;
  budget_code_id: string | null;
  total_amount: number;
  baseline_status: string | null;
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
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
    Promise.all([
      supabase
        .from("qs_v_boq_requisition_status")
        .select("*")
        .eq("project_id", projectId)
        .gt("remaining_quantity", 0)
        .order("seq"),
      supabase
        .from("qs_boq_sections")
        .select("id, section_code, title, seq")
        .eq("project_id", projectId)
        .order("seq"),
    ]).then(([itemsRes, secsRes]) => {
      if (itemsRes.error) { toast.error(itemsRes.error.message); return; }
      if (secsRes.error) { toast.error(secsRes.error.message); return; }
      const loadedItems = (itemsRes.data ?? []) as BoqItemForPr[];
      const loadedSections = (secsRes.data ?? []) as SectionInfo[];
      setItems(loadedItems);
      setSections(loadedSections);
      if (loadedSections.length > 0) setExpanded(new Set([loadedSections[0].id]));
    }, () => {}).then(() => { setLoading(false); });
  }, [open, projectId]);

  const sectionMap = useMemo(() => {
    const map = new Map<string, SectionInfo>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  const groupedSections = useMemo(() => {
    const sectionIds = new Set(items.map(i => i.boq_section_id));
    return sections
      .filter(s => sectionIds.has(s.id) || boqFilter !== "all")
      .map(s => ({
        ...s,
        sectionItems: items.filter(i => i.boq_section_id === s.id),
      }))
      .filter(s => s.sectionItems.length > 0)
      .sort((a, b) => a.seq - b.seq);
  }, [sections, items, boqFilter]);

  function toggleSection(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSectionAll(sectionId: string, sectionItemIds: string[]) {
    const allSelected = sectionItemIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of sectionItemIds) {
        allSelected ? next.delete(id) : next.add(id);
      }
      return next;
    });
  }

  function handleClose() {
    setOpen(false);
    setSelected(new Set());
    setSearch("");
    setBoqFilter("all");
    setExpanded(new Set());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (boqFilter === "all" || i.boq_id === boqFilter) &&
        (!q ||
          i.description.toLowerCase().includes(q) ||
          (i.item_code && i.item_code.toLowerCase().includes(q)) ||
          (i.item_no && i.item_no.toLowerCase().includes(q))),
    );
  }, [items, boqFilter, search]);

  const filteredBySection = useMemo(() => {
    const sectionIds = new Set(filtered.map(i => i.boq_section_id));
    return sections
      .filter(s => sectionIds.has(s.id))
      .map(s => ({
        ...s,
        sectionItems: filtered.filter(i => i.boq_section_id === s.id),
      }))
      .filter(s => s.sectionItems.length > 0)
      .sort((a, b) => a.seq - b.seq);
  }, [sections, filtered]);

  const totalSelected = selected.size;

  function handleConfirm() {
    const picked: SelectedItem[] = items
      .filter((i) => selected.has(i.boq_item_id))
      .map((i) => ({
        boq_item_id: i.boq_item_id,
        item_code: i.item_no ?? i.item_code ?? "",
        description: i.description,
        unit: i.unit,
        quantity: i.remaining_quantity,
        unit_rate: i.unit_rate,
        budget_code: i.budget_code_letter ?? "",
        budget_code_id: i.budget_code_id,
        total_amount: i.total_amount,
        baseline_status: i.baseline_status,
        notes: "",
      }));
    if (!picked.length) {
      toast.error("Select at least one item");
      return;
    }
    onPick(picked);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <PackageOpen className="h-3.5 w-3.5" />
        Pick from BOQ
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
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
            placeholder="Search by item no, code or description..."
            className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-hidden focus:border-primary"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredBySection.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <PackageOpen className="mb-2 h-8 w-8" />
            <p className="text-sm">
              {items.length === 0
                ? "No BOQ items with remaining quantity"
                : "No items match your search"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredBySection.map((section) => {
              const isExpanded = expanded.has(section.id);
              const sectionAllSelected = section.sectionItems.every(i => selected.has(i.boq_item_id));
              return (
                <div key={section.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Section header */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors select-none",
                      isExpanded ? "bg-muted/40 border-b border-border" : "hover:bg-muted/20",
                    )}
                    onClick={() => toggleSection(section.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <input
                      type="checkbox"
                      checked={sectionAllSelected && section.sectionItems.length > 0}
                      onChange={(e) => { e.stopPropagation(); toggleSectionAll(section.id, section.sectionItems.map(i => i.boq_item_id)); }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="text-xs font-semibold text-muted-foreground">{section.section_code ?? section.seq}</span>
                    <span className="text-sm font-medium">{section.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {section.sectionItems.length} item{section.sectionItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Items */}
                  {isExpanded && (
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="w-8 px-2 py-1.5"></th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Item No</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Code</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Description</th>
                          <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Unit</th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">BOQ Qty</th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Remaining</th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {section.sectionItems.map((item) => (
                          <tr
                            key={item.boq_item_id}
                            className={cn(
                              "cursor-pointer transition-colors",
                              selected.has(item.boq_item_id) ? "bg-primary/5" : "hover:bg-muted/20",
                            )}
                            onClick={() => toggleItem(item.boq_item_id)}
                          >
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={selected.has(item.boq_item_id)}
                                onChange={() => toggleItem(item.boq_item_id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">
                              {item.item_no ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">
                              {item.item_code ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              {item.description}
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
                  )}
                </div>
              );
            })}
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
