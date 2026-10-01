"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listBudgetCodesWithIsActiveOrderedBySortOrder, listQsDescriptionLibrary, listQsElementLibrary } from "@/lib/qs/qs-queries";
import { ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { useQsLibrarySearch } from "@/hooks/use-qs-library-search";
import { QsSearchIndexRefreshButton } from "@/components/qs/qs-search-index-refresh-button";
import ElementLibraryTree from "@/components/tenders/element-library/element-library-tree";
import ElementDetailPanel from "@/components/tenders/element-library/element-detail-panel";
import AddElementDialog from "@/components/tenders/element-library/add-element-dialog";
import { type QsElementRow, type DescriptionRow, type BudgetCodeOption } from "@/lib/qs/qs-element-library-shared";

export default function QsElementLibraryPage() {
  const { can } = useQsPermissions();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QsElementRow[]>([]);
  const [descriptions, setDescriptions] = useState<DescriptionRow[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCodeOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<QsElementRow | null>(null);
  const [showAddElement, setShowAddElement] = useState(false);
  const [search, setSearch] = useState("");
  const [subSectionFilter, setSubSectionFilter] = useState("");
  const [subElementFilter, setSubElementFilter] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const [libRes, codesRes, descRes] = await Promise.all([
        listQsElementLibrary(),
        listBudgetCodesWithIsActiveOrderedBySortOrder(),
        listQsDescriptionLibrary(),
      ]);
      if (libRes.error) toast.error("Failed to load QS element library");
      else setItems((libRes.data ?? []) as QsElementRow[]);
      if (codesRes.error) toast.error("Failed to load budget codes");
      else setBudgetCodes((codesRes.data ?? []) as BudgetCodeOption[]);
      if (descRes.error) toast.error("Failed to load description library");
      else setDescriptions((descRes.data ?? []) as DescriptionRow[]);
      setLoading(false);
    }
    load();
  }, []);

  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of items) {
      if (!seen.has(i.discipline)) {
        seen.add(i.discipline);
        out.push(i.discipline);
      }
    }
    return out;
  }, [items]);

  const maxSortOrder = useMemo(() => items.reduce((max, i) => Math.max(max, i.sort_order), 0), [items]);

  const subSectionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const i of items) seen.add(i.sub_section);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const subElementOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const i of items) {
      if (subSectionFilter && i.sub_section !== subSectionFilter) continue;
      seen.add(i.sub_element);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [items, subSectionFilter]);

  function handleSubSectionFilterChange(value: string) {
    setSubSectionFilter(value);
    // drop a now-invalid sub-element selection when narrowing by sub-section
    if (subElementFilter) {
      const stillValid = items.some(
        (i) => i.sub_element === subElementFilter && (!value || i.sub_section === value)
      );
      if (!stillValid) setSubElementFilter("");
    }
  }

  const hasActiveFilters = search.trim() !== "" || subSectionFilter !== "" || subElementFilter !== "";

  function clearFilters() {
    setSearch("");
    setSubSectionFilter("");
    setSubElementFilter("");
  }

  // Hybrid search (keyword + meaning) also matches description text, which the
  // plain filter below never did. A description hit surfaces its parent element.
  const librarySearch = useQsLibrarySearch(search, ["element", "element_description"]);
  const searchMatchedElementIds = useMemo(() => {
    if (!librarySearch.ranks) return null;
    const elementIdByDescription = new Map(descriptions.map((d) => [d.id, d.element_library_id]));
    const ids = new Set<string>();
    for (const r of librarySearch.results) {
      if (r.source_type === "element") ids.add(r.source_id);
      else if (r.source_type === "element_description") {
        const elementId = elementIdByDescription.get(r.source_id);
        if (elementId) ids.add(elementId);
      }
    }
    return ids;
  }, [librarySearch.ranks, librarySearch.results, descriptions]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (subSectionFilter && i.sub_section !== subSectionFilter) return false;
      if (subElementFilter && i.sub_element !== subElementFilter) return false;
      if (!q) return true;
      return (
        searchMatchedElementIds?.has(i.id) ||
        i.section.toLowerCase().includes(q) ||
        i.sub_section.toLowerCase().includes(q) ||
        i.sub_element.toLowerCase().includes(q)
      );
    });
  }, [items, search, subSectionFilter, subElementFilter, searchMatchedElementIds]);

  const grouped = useMemo(() => {
    const disciplineMap = new Map<string, Map<string, QsElementRow[]>>();
    for (const item of filteredItems) {
      if (!disciplineMap.has(item.discipline)) disciplineMap.set(item.discipline, new Map());
      const sectionMap = disciplineMap.get(item.discipline)!;
      if (!sectionMap.has(item.section)) sectionMap.set(item.section, []);
      sectionMap.get(item.section)!.push(item);
    }
    return disciplineMap;
  }, [filteredItems]);

  const allSectionKeys = useMemo(() => {
    const keys: string[] = [];
    for (const [discipline, sectionMap] of grouped) {
      for (const section of sectionMap.keys()) keys.push(`${discipline}::${section}`);
    }
    return keys;
  }, [grouped]);

  const allExpanded = allSectionKeys.length > 0 && allSectionKeys.every((k) => expandedGroups.has(k));

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleToggleExpandAll = useCallback(() => {
    setExpandedGroups(allExpanded ? new Set() : new Set(allSectionKeys));
  }, [allExpanded, allSectionKeys]);

  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Element Library</h1>
          <p className="text-sm text-muted-foreground">
            Standardized Discipline / Section / Sub Section / Sub Element / Description picklist, reused across all Tender BOQ line items
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {items.length} elements ({items.filter((i) => i.is_active).length} active)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search elements & descriptions..."
              className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-hidden focus:border-primary"
            />
            {librarySearch.searching && (
              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {canEdit && <QsSearchIndexRefreshButton />}
          <button
            type="button"
            onClick={handleToggleExpandAll}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground tabular-nums">
              {expandedGroups.size}/{allSectionKeys.length}
            </span>
          </button>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowAddElement(true)} className="whitespace-nowrap">
              <Plus className="mr-1 h-4 w-4" /> Add Element
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={subSectionFilter}
          onChange={(e) => handleSubSectionFilterChange(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
        >
          <option value="">All Sub Sections</option>
          {subSectionOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={subElementFilter}
          onChange={(e) => setSubElementFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
        >
          <option value="">All Sub Elements</option>
          {subElementOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      {showAddElement && (
        <AddElementDialog
          disciplines={disciplines}
          budgetCodes={budgetCodes}
          currentMaxSortOrder={maxSortOrder}
          onClose={() => setShowAddElement(false)}
          onCreated={(created) => setItems((prev) => [...prev, created])}
        />
      )}

      <div className="flex gap-6 items-start">
        <div className={selectedItem ? "w-1/2" : "w-full"}>
          <ElementLibraryTree
            grouped={grouped}
            isFiltering={hasActiveFilters}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            descriptions={descriptions}
            budgetCodes={budgetCodes}
            selectedId={selectedItem?.id ?? null}
            onSelectItem={setSelectedItem}
          />
        </div>

        {selectedItem && (
          <div className="w-1/2">
            <ElementDetailPanel
              item={selectedItem}
              descriptions={descriptions}
              disciplines={disciplines}
              budgetCodes={budgetCodes}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              onClose={() => setSelectedItem(null)}
              onSaved={(updated) => {
                setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
                setSelectedItem(updated);
              }}
              onDeleted={(id) => {
                setItems((prev) => prev.filter((i) => i.id !== id));
                setSelectedItem(null);
              }}
              onDescriptionsChange={(updater) => setDescriptions(updater)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
