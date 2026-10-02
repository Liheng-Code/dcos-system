"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Search, ChevronsUpDown, RotateCcw,
  Building2, Paintbrush, Zap, Trees, Layers, PackageOpen, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  type QsElementLibraryItem,
  type QsDescriptionLibraryItem,
} from "@/lib/qs/tender-cost-service";
import { cn } from "@/lib/utils";
import { useQsLibrarySearch } from "@/hooks/use-qs-library-search";

export interface BoqElementLibrarySelection {
  elementId: string;
  element: QsElementLibraryItem;
  description: QsDescriptionLibraryItem;
}

interface Props {
  open: boolean;
  onClose: () => void;
  elements: QsElementLibraryItem[];
  descriptions: QsDescriptionLibraryItem[];
  onConfirm: (selected: BoqElementLibrarySelection[]) => void;
}

interface DisciplineStyle {
  icon: LucideIcon;
  chip: string;
  border: string;
}

const DISCIPLINE_STYLES: Record<string, DisciplineStyle> = {
  "Civil and Structure": {
    icon: Building2,
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    border: "border-slate-500",
  },
  "Architecture": {
    icon: Paintbrush,
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    border: "border-violet-500",
  },
  "MEP": {
    icon: Zap,
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    border: "border-amber-500",
  },
  "External Works": {
    icon: Trees,
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500",
  },
};
const DEFAULT_DISCIPLINE_STYLE: DisciplineStyle = {
  icon: Layers,
  chip: "bg-primary/10 text-primary",
  border: "border-primary",
};

function disciplineStyle(discipline: string): DisciplineStyle {
  return DISCIPLINE_STYLES[discipline] ?? DEFAULT_DISCIPLINE_STYLE;
}

export function BoqElementLibraryPickerDialog({ open, onClose, elements, descriptions, onConfirm }: Props) {
  const [search, setSearch] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [subSectionFilter, setSubSectionFilter] = useState("");
  const [subElementFilter, setSubElementFilter] = useState("");
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const [expandedSubSections, setExpandedSubSections] = useState<Set<string>>(new Set());
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());
  const [selectedDescIds, setSelectedDescIds] = useState<Set<string>>(new Set());

  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    for (const el of elements) seen.add(el.discipline);
    return Array.from(seen).sort();
  }, [elements]);

  // Reset child filters when parent changes
  useEffect(() => { setSectionFilter(""); setSubSectionFilter(""); setSubElementFilter(""); }, [disciplineFilter]);
  useEffect(() => { setSubSectionFilter(""); setSubElementFilter(""); }, [sectionFilter]);
  useEffect(() => { setSubElementFilter(""); }, [subSectionFilter]);

  // Cascading filter options: each level depends on parent filters
  const sectionOptions = useMemo(() => {
    let list = elements;
    if (disciplineFilter) list = list.filter((el) => el.discipline === disciplineFilter);
    const seen = new Set<string>();
    for (const el of list) if (el.section) seen.add(el.section);
    return Array.from(seen).sort();
  }, [elements, disciplineFilter]);

  const subSectionOptions = useMemo(() => {
    let list = elements;
    if (disciplineFilter) list = list.filter((el) => el.discipline === disciplineFilter);
    if (sectionFilter) list = list.filter((el) => el.section === sectionFilter);
    const seen = new Set<string>();
    for (const el of list) if (el.sub_section) seen.add(el.sub_section);
    return Array.from(seen).sort();
  }, [elements, disciplineFilter, sectionFilter]);

  const subElementOptions = useMemo(() => {
    let list = elements;
    if (disciplineFilter) list = list.filter((el) => el.discipline === disciplineFilter);
    if (sectionFilter) list = list.filter((el) => el.section === sectionFilter);
    if (subSectionFilter) list = list.filter((el) => el.sub_section === subSectionFilter);
    const seen = new Set<string>();
    for (const el of list) if (el.sub_element) seen.add(el.sub_element);
    return Array.from(seen).sort();
  }, [elements, disciplineFilter, sectionFilter, subSectionFilter]);

  // Hybrid search (typo-tolerant + meaning-based) over element paths and description text.
  // A matching description keeps its element visible; plain substring matches still count.
  const librarySearch = useQsLibrarySearch(search, ["element", "element_description"]);
  const searchMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const ranks = librarySearch.ranks;
    const pathMatched = new Set<string>();
    for (const el of elements) {
      if (
        (ranks?.has(el.id) ?? false) ||
        el.section.toLowerCase().includes(q) ||
        el.sub_section.toLowerCase().includes(q) ||
        el.sub_element.toLowerCase().includes(q)
      ) pathMatched.add(el.id);
    }
    const descMatched = new Set<string>();
    const elementsWithDescMatch = new Set<string>();
    for (const d of descriptions) {
      if ((ranks?.has(d.id) ?? false) || d.description.toLowerCase().includes(q)) {
        descMatched.add(d.id);
        elementsWithDescMatch.add(d.element_library_id);
      }
    }
    return { pathMatched, descMatched, elementsWithDescMatch };
  }, [elements, descriptions, search, librarySearch.ranks]);

  const filteredElements = useMemo(() => {
    let list = elements;
    if (disciplineFilter) list = list.filter((el) => el.discipline === disciplineFilter);
    if (sectionFilter) list = list.filter((el) => el.section === sectionFilter);
    if (subSectionFilter) list = list.filter((el) => el.sub_section === subSectionFilter);
    if (subElementFilter) list = list.filter((el) => el.sub_element === subElementFilter);
    if (searchMatch) {
      list = list.filter((el) => searchMatch.pathMatched.has(el.id) || searchMatch.elementsWithDescMatch.has(el.id));
    }
    return list;
  }, [elements, disciplineFilter, sectionFilter, subSectionFilter, subElementFilter, searchMatch]);

  const filteredDescs = useMemo(() => {
    if (!searchMatch) return descriptions;
    // An element matched by its own path shows all its descriptions; otherwise only the matching ones.
    return descriptions.filter((d) => searchMatch.descMatched.has(d.id) || searchMatch.pathMatched.has(d.element_library_id));
  }, [descriptions, searchMatch]);

  // Grouped: discipline → section → sub_section → elements[]
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, QsElementLibraryItem[]>>>();
    for (const el of filteredElements) {
      if (!map.has(el.discipline)) map.set(el.discipline, new Map());
      const sections = map.get(el.discipline)!;
      if (!sections.has(el.section)) sections.set(el.section, new Map());
      const subSections = sections.get(el.section)!;
      if (!subSections.has(el.sub_section)) subSections.set(el.sub_section, []);
      subSections.get(el.sub_section)!.push(el);
    }
    return map;
  }, [filteredElements]);

  const descsByElement = useMemo(() => {
    const map = new Map<string, QsDescriptionLibraryItem[]>();
    for (const d of filteredDescs) {
      if (!map.has(d.element_library_id)) map.set(d.element_library_id, []);
      map.get(d.element_library_id)!.push(d);
    }
    return map;
  }, [filteredDescs]);

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

  function toggleSubSection(key: string) {
    setExpandedSubSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelectDesc(descId: string) {
    setSelectedDescIds((prev) => {
      const next = new Set(prev);
      next.has(descId) ? next.delete(descId) : next.add(descId);
      return next;
    });
  }

  function isElementSelected(elId: string): boolean {
    const descs = descsByElement.get(elId) ?? [];
    if (descs.length === 0) return false;
    return descs.every((d) => selectedDescIds.has(d.id));
  }

  function isElementPartial(elId: string): boolean {
    const descs = descsByElement.get(elId) ?? [];
    return descs.some((d) => selectedDescIds.has(d.id)) && !isElementSelected(elId);
  }

  function toggleSelectElement(elId: string) {
    const descs = descsByElement.get(elId) ?? [];
    const allSelected = isElementSelected(elId);
    setSelectedDescIds((prev) => {
      const next = new Set(prev);
      for (const d of descs) {
        allSelected ? next.delete(d.id) : next.add(d.id);
      }
      return next;
    });
  }

  function expandAll() {
    const allDiscs = new Set(grouped.keys());
    const allSubSections = new Set<string>();
    const allEls = new Set<string>();
    for (const [disc, sections] of grouped) {
      for (const [section, subSections] of sections) {
        for (const [subSection, els] of subSections) {
          allSubSections.add(`${disc}::${section}::${subSection}`);
          for (const el of els) allEls.add(el.id);
        }
      }
    }
    setExpandedDisciplines(allDiscs);
    setExpandedSubSections(allSubSections);
    setExpandedElements(allEls);
  }

  function collapseAll() {
    setExpandedDisciplines(new Set());
    setExpandedSubSections(new Set());
    setExpandedElements(new Set());
  }

  function clearFilters() {
    setSearch("");
    setDisciplineFilter("");
    setSectionFilter("");
    setSubSectionFilter("");
    setSubElementFilter("");
  }

  function handleConfirm() {
    const result: BoqElementLibrarySelection[] = [];
    for (const el of elements) {
      const elDescs = descsByElement.get(el.id) ?? [];
      for (const d of elDescs) {
        if (selectedDescIds.has(d.id)) {
          result.push({ elementId: el.id, element: el, description: d });
        }
      }
    }
    onConfirm(result);
  }

  const totalSelected = selectedDescIds.size;
  const filtersActive = Boolean(search || disciplineFilter || sectionFilter || subSectionFilter || subElementFilter);
  const selectClass =
    "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <DialogTitle>Add from Element Library</DialogTitle>
          </div>
          <DialogDescription>Select descriptions grouped by element to add as BOQ items.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search section, sub-element, description..."
              className="h-8 pl-8"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <select value={disciplineFilter} onChange={(e) => setDisciplineFilter(e.target.value)} className={selectClass}>
              <option value="">All Disciplines</option>
              {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={selectClass}>
              <option value="">All Sections</option>
              {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={subSectionFilter} onChange={(e) => setSubSectionFilter(e.target.value)} className={selectClass}>
              <option value="">All Sub Sections</option>
              {subSectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={subElementFilter} onChange={(e) => setSubElementFilter(e.target.value)} className={selectClass}>
              <option value="">All Sub Elements</option>
              {subElementOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-muted-foreground">
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={expandAll} title="Expand all">
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={collapseAll} title="Collapse all">
                <ChevronsUpDown className="h-3.5 w-3.5 rotate-180" />
              </Button>
            </div>
          </div>
        </div>

        {elements.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No active Element Library items found.</p>
          </div>
        ) : grouped.size === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No elements match &ldquo;{search}&rdquo;.</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {Array.from(grouped.entries()).map(([disc, sections]) => {
              const discExpanded = expandedDisciplines.has(disc);
              const discElIds = Array.from(sections.values()).flatMap((subSecs) => Array.from(subSecs.values()).flat()).map((e) => e.id);
              const discSelected = discElIds.every((id) => isElementSelected(id));
              const discPartial = discElIds.some((id) => isElementPartial(id)) && !discSelected;
              const discSelectedCount = discElIds.reduce((n, id) => n + (descsByElement.get(id) ?? []).filter((d) => selectedDescIds.has(d.id)).length, 0);
              const style = disciplineStyle(disc);
              const DiscIcon = style.icon;

              return (
                <div key={disc} className="overflow-hidden rounded-xl border border-border shadow-sm">
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none bg-muted/40 hover:bg-muted/60 transition-colors"
                    onClick={() => toggleDiscipline(disc)}
                  >
                    <button type="button" className="shrink-0 text-muted-foreground">
                      {discExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <input
                      type="checkbox"
                      checked={discSelected}
                      ref={(el) => { if (el) el.indeterminate = discPartial; }}
                      onChange={() => {
                        for (const id of discElIds) {
                          const elDescs = descsByElement.get(id) ?? [];
                          setSelectedDescIds((prev) => {
                            const next = new Set(prev);
                            for (const d of elDescs) {
                              discSelected ? next.delete(d.id) : next.add(d.id);
                            }
                            return next;
                          });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", style.chip)}>
                      <DiscIcon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold">{disc}</span>
                    <Badge variant="secondary" className="font-normal text-muted-foreground">
                      {discElIds.length} elements
                    </Badge>
                    {discSelectedCount > 0 && (
                      <Badge className="ml-auto">{discSelectedCount} selected</Badge>
                    )}
                  </div>

                  {discExpanded && (
                    <div className="divide-y divide-border/70 border-t border-border">
                      {Array.from(sections.entries()).map(([section, subSections]) => (
                        <div key={section} className={cn("relative border-l-4 pl-3", style.border)}>
                          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {section}
                          </div>
                          <div className="divide-y divide-border/50">
                            {Array.from(subSections.entries()).map(([subSection, els]) => {
                              const ssKey = `${disc}::${section}::${subSection}`;
                              const ssExpanded = expandedSubSections.has(ssKey);
                              const ssElIds = els.map((e) => e.id);
                              const ssSelected = ssElIds.every((id) => isElementSelected(id));
                              const ssPartial = ssElIds.some((id) => isElementPartial(id)) && !ssSelected;

                              return (
                                <div key={ssKey}>
                                  <div
                                    className="flex items-center gap-2.5 px-2 py-2 cursor-pointer select-none rounded-md hover:bg-muted/40 transition-colors"
                                    onClick={() => toggleSubSection(ssKey)}
                                  >
                                    <button type="button" className="shrink-0 text-muted-foreground">
                                      {ssExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={ssSelected}
                                      ref={(el) => { if (el) el.indeterminate = ssPartial; }}
                                      onChange={() => {
                                        for (const id of ssElIds) {
                                          const elDescs = descsByElement.get(id) ?? [];
                                          setSelectedDescIds((prev) => {
                                            const next = new Set(prev);
                                            for (const d of elDescs) {
                                              ssSelected ? next.delete(d.id) : next.add(d.id);
                                            }
                                            return next;
                                          });
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                                    />
                                    <span className="text-sm font-medium">{subSection}</span>
                                    <span className="text-xs text-muted-foreground">({els.length})</span>
                                  </div>

                                  {ssExpanded && (
                                    <div className="pl-6 pb-1 space-y-0.5">
                                      {els.map((el) => {
                                        const elDescs = descsByElement.get(el.id) ?? [];
                                        const elExpanded = expandedElements.has(el.id);
                                        const elChecked = isElementSelected(el.id);
                                        const elPartial = isElementPartial(el.id);

                                        return (
                                          <div key={el.id}>
                                            <div
                                              className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer select-none rounded-md hover:bg-muted/40 transition-colors"
                                              onClick={() => elDescs.length > 0 && toggleElement(el.id)}
                                            >
                                              {elDescs.length > 0 ? (
                                                <button type="button" className="shrink-0 text-muted-foreground">
                                                  {elExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                </button>
                                              ) : <span className="w-3 shrink-0" />}
                                              <input
                                                type="checkbox"
                                                checked={elChecked}
                                                ref={(elRef) => { if (elRef) elRef.indeterminate = elPartial; }}
                                                onChange={() => toggleSelectElement(el.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="h-3.5 w-3.5 rounded border-input accent-primary"
                                              />
                                              <span className="text-sm truncate">
                                                {el.sub_element || el.sub_section || section}
                                              </span>
                                              <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                                                {el.typical_unit ?? "ea"}
                                              </Badge>
                                              {el.budget_codes && (
                                                <Badge variant="outline" className="shrink-0 font-mono font-normal text-muted-foreground">
                                                  {el.budget_codes.code}
                                                </Badge>
                                              )}
                                            </div>

                                            {elExpanded && elDescs.length > 0 && (
                                              <div className="pl-9 pb-1 space-y-0.5">
                                                {elDescs.map((d) => {
                                                  const checked = selectedDescIds.has(d.id);
                                                  return (
                                                    <label
                                                      key={d.id}
                                                      className={cn(
                                                        "flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors",
                                                        checked ? "bg-primary/5" : "hover:bg-muted/40"
                                                      )}
                                                    >
                                                      <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleSelectDesc(d.id)}
                                                        className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
                                                      />
                                                      <span className="flex-1 truncate text-sm" title={d.description}>{d.description}</span>
                                                      <div className="flex shrink-0 items-center gap-1">
                                                        {d.material_rate != null && d.material_rate > 0 && (
                                                          <Badge className="border-transparent bg-amber-500/15 font-normal text-amber-700 dark:text-amber-400">
                                                            M ${d.material_rate}
                                                          </Badge>
                                                        )}
                                                        {d.labor_rate != null && d.labor_rate > 0 && (
                                                          <Badge className="border-transparent bg-blue-500/15 font-normal text-blue-700 dark:text-blue-400">
                                                            L ${d.labor_rate}
                                                          </Badge>
                                                        )}
                                                      </div>
                                                    </label>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="items-center border-t border-border pt-3 sm:justify-between">
          <div className="flex items-center gap-2">
            {totalSelected > 0 && (
              <>
                <Badge variant="secondary">{totalSelected} item{totalSelected !== 1 ? "s" : ""} selected</Badge>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedDescIds(new Set())}>
                  Clear selection
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={totalSelected === 0}>
              Add {totalSelected > 0 ? `${totalSelected} item${totalSelected !== 1 ? "s" : ""}` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
