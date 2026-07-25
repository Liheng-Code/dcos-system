"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  getElementLibraryForPicker,
  type QsElementLibraryItem,
  type QsDescriptionLibraryItem,
  type SelectedElementItem,
} from "@/lib/tender-cost-service";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (selected: SelectedElementItem[]) => void;
}

export function ElementLibraryPickerDialog({ open, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(true);
  const [elements, setElements] = useState<QsElementLibraryItem[]>([]);
  const [descriptions, setDescriptions] = useState<QsDescriptionLibraryItem[]>([]);
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());
  const [selectedElements, setSelectedElements] = useState<Set<string>>(new Set());
  const [selectedDescs, setSelectedDescs] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getElementLibraryForPicker()
      .then(({ elements, descriptions }) => {
        setElements(elements);
        setDescriptions(descriptions);
        setExpandedDisciplines(new Set());
        setExpandedElements(new Set());
        setSelectedElements(new Set());
        setSelectedDescs(new Map());
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load Element Library"))
      .finally(() => setLoading(false));
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, QsElementLibraryItem[]>>();
    for (const el of elements) {
      if (!map.has(el.discipline)) map.set(el.discipline, new Map());
      const sections = map.get(el.discipline)!;
      if (!sections.has(el.section)) sections.set(el.section, []);
      sections.get(el.section)!.push(el);
    }
    return map;
  }, [elements]);

  const descsByElement = useMemo(() => {
    const map = new Map<string, QsDescriptionLibraryItem[]>();
    for (const d of descriptions) {
      if (!map.has(d.element_library_id)) map.set(d.element_library_id, []);
      map.get(d.element_library_id)!.push(d);
    }
    return map;
  }, [descriptions]);

  function toggleDiscipline(disc: string) {
    setExpandedDisciplines((prev) => {
      const next = new Set(prev);
      next.has(disc) ? next.delete(disc) : next.add(disc);
      return next;
    });
  }

  function toggleElement(elId: string) {
    setExpandedElements((prev) => {
      const next = new Set(prev);
      next.has(elId) ? next.delete(elId) : next.add(elId);
      return next;
    });
  }

  function toggleSelectElement(elId: string) {
    setSelectedElements((prev) => {
      const next = new Set(prev);
      if (next.has(elId)) {
        next.delete(elId);
        setSelectedDescs((prev2) => { const m = new Map(prev2); m.delete(elId); return m; });
      } else {
        next.add(elId);
      }
      return next;
    });
  }

  function toggleSelectDesc(elId: string, descId: string) {
    setSelectedDescs((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(elId) ?? []);
      set.has(descId) ? set.delete(descId) : set.add(descId);
      next.set(elId, set);
      return next;
    });
    setSelectedElements((prev) => {
      const next = new Set(prev);
      next.delete(elId);
      return next;
    });
  }

  function isElementSelected(elId: string): boolean {
    if (selectedElements.has(elId)) return true;
    const descs = descsByElement.get(elId) ?? [];
    if (descs.length === 0) return selectedElements.has(elId);
    const sel = selectedDescs.get(elId);
    return sel !== undefined && sel.size === descs.length;
  }

  function handleConfirm() {
    const result: SelectedElementItem[] = [];
    for (const el of elements) {
      if (selectedElements.has(el.id)) {
        result.push({ elementId: el.id });
      } else {
        const sel = selectedDescs.get(el.id);
        if (sel && sel.size > 0) result.push({ elementId: el.id, descriptionIds: Array.from(sel) });
      }
    }
    onConfirm(result);
  }

  const totalSelected = useMemo(() => {
    let count = 0;
    for (const el of elements) {
      if (selectedElements.has(el.id)) {
        count += (descsByElement.get(el.id) ?? []).length || 1;
      } else {
        const sel = selectedDescs.get(el.id);
        if (sel) count += sel.size;
      }
    }
    return count;
  }, [selectedElements, selectedDescs, elements, descsByElement]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pull from Element Library</DialogTitle>
          <DialogDescription>Select elements and descriptions to pull into the Price List.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : elements.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active Element Library items found.</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {Array.from(grouped.entries()).map(([disc, sections]) => {
              const discExpanded = expandedDisciplines.has(disc);
              const discElIds = Array.from(sections.values()).flat().map((e) => e.id);
              const discSelected = discElIds.every((id) => isElementSelected(id));
              const discPartial = discElIds.some((id) => isElementSelected(id)) && !discSelected;

              return (
                <div key={disc} className="rounded border border-border">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer select-none" onClick={() => toggleDiscipline(disc)}>
                    <button type="button" className="shrink-0">
                      {discExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <input
                      type="checkbox"
                      checked={discSelected}
                      ref={(el) => { if (el) el.indeterminate = discPartial; }}
                      onChange={() => {
                        setSelectedElements((prev) => {
                          const next = new Set(prev);
                          for (const id of discElIds) {
                            discSelected ? next.delete(id) : next.add(id);
                          }
                          return next;
                        });
                        if (discSelected) {
                          for (const id of discElIds) {
                            setSelectedDescs((prev) => { const m = new Map(prev); m.delete(id); return m; });
                          }
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-sm font-medium">{disc}</span>
                    <span className="text-xs text-muted-foreground">({discElIds.length} elements)</span>
                  </div>

                  {discExpanded && (
                    <div className="divide-y divide-border">
                      {Array.from(sections.entries()).map(([section, els]) => (
                        <div key={section} className="pl-6">
                          {els.map((el) => {
                            const elDescs = descsByElement.get(el.id) ?? [];
                            const elExpanded = expandedElements.has(el.id);
                            const elChecked = isElementSelected(el.id);

                            return (
                              <div key={el.id}>
                                <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/20" onClick={() => elDescs.length > 0 && toggleElement(el.id)}>
                                  {elDescs.length > 0 ? (
                                    <button type="button" className="shrink-0">
                                      {elExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                  ) : <span className="w-3" />}
                                  <input
                                    type="checkbox"
                                    checked={elChecked}
                                    onChange={() => toggleSelectElement(el.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="text-xs truncate">
                                    {el.sub_element || el.sub_section || section}
                                  </span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    [{el.typical_unit ?? "ea"}]
                                  </span>
                                  {el.budget_codes && (
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {el.budget_codes.code}
                                    </span>
                                  )}
                                </div>

                                {elExpanded && elDescs.length > 0 && (
                                  <div className="pl-10 pb-1 space-y-0.5">
                                    {elDescs.map((d) => {
                                      const selDescs = selectedDescs.get(el.id);
                                      const checked = selDescs?.has(d.id) ?? false;
                                      return (
                                        <label key={d.id} className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-muted/20 cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleSelectDesc(el.id, d.id)}
                                            className="h-3 w-3"
                                          />
                                          <span className="text-xs truncate">{d.description}</span>
                                          <span className="text-xs text-muted-foreground shrink-0">
                                            {d.material_rate != null && d.material_rate > 0 && (
                                              <span className="text-amber-600">M${d.material_rate}</span>
                                            )}
                                            {d.material_rate != null && d.material_rate > 0 && d.labor_rate != null && d.labor_rate > 0 && " / "}
                                            {d.labor_rate != null && d.labor_rate > 0 && (
                                              <span className="text-blue-600">L${d.labor_rate}</span>
                                            )}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={totalSelected === 0}>
            Pull {totalSelected > 0 ? `${totalSelected} item${totalSelected !== 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
