"use client";

import { useEffect, useState, useCallback, Fragment, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2, Upload, ChevronDown, ChevronRight, Library, RefreshCw, Tag, Columns3, Sparkles, Blocks, Database } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getBoqItemsGrouped, createBoqItem, deleteBoqItem, getBudgetCodes,
  flattenBoqItemsGrouped, getBoqLibraryCurrentRates, getBoqItemStaleness,
  buildBoqLibraryRefreshPreview, commitBoqLibraryRefresh,
  EQUIPMENT_SUBCON_GUARDRAIL_PCT, getWbsProjectNodes,   getQsElementLibrary,
  getQsDescriptionLibrary, getPriceList, getTenderMargins, isInstalledCostSnapshot,
  type BoqItemsGrouped, type BudgetCode, type TenderBoqItem,
  type BoqLibraryCurrentRates, type BoqLibraryRefreshPreview, type WbsProjectNode,
  type QsElementLibraryItem, type QsDescriptionLibraryItem, type TenderPriceListItem,
} from "@/lib/qs/tender-cost-service";
import { TenderCostImportDialog } from "./tender-cost-import-dialog";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { BoqElementLibraryPickerDialog, type BoqElementLibrarySelection } from "./boq-element-library-picker-dialog";
import { PriceListPickerDialog } from "./price-list-picker-dialog";
import { AiBoqDraftDialog } from "./ai-boq-draft-dialog";
import { AssignLibraryToBoqDialog } from "./assign-library-to-boq-dialog";
import { AssignCostDatabaseDialog } from "./assign-cost-database-dialog";
import { SaveToCostDatabaseDialog } from "./save-to-cost-database-dialog";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

import { BOQ_UNITS } from "@/lib/qs/boq-units";

const emptyForm = {
  budget_code: "", section: "", sub_section: "", sub_element: "", level: "All", building_code: "", discipline: "", description: "", unit: "m",
  quantity: "0", labor_net_cost: "0", labor_margin_pct: "20", material_net_cost: "0", material_margin_pct: "12",
};

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BoqTab({ tenderId, isLocked = false }: { tenderId: string; isLocked?: boolean }) {
  const [grouped, setGrouped] = useState<BoqItemsGrouped | null>(null);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [wbsLevels, setWbsLevels] = useState<WbsProjectNode[]>([]);
  const [wbsBuildings, setWbsBuildings] = useState<WbsProjectNode[]>([]);
  const [elementLibrary, setElementLibrary] = useState<QsElementLibraryItem[]>([]);
  const [descriptionLibrary, setDescriptionLibrary] = useState<QsDescriptionLibraryItem[]>([]);
  const [priceList, setPriceList] = useState<TenderPriceListItem[]>([]);
  const [tenderMargins, setTenderMargins] = useState({ labor: 0, material: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [showCostLibrary, setShowCostLibrary] = useState(false);
  const [showCostDatabase, setShowCostDatabase] = useState(false);
  const [showSaveDatabase, setShowSaveDatabase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewLevel, setViewLevel] = useState<"main" | "detail" | "flat">("detail");

  const allFlatColumns = useMemo(() => [
    { id: "description", label: "Description", align: "left" as const },
    { id: "unit", label: "Unit", align: "left" as const },
    { id: "qty", label: "Qty", align: "right" as const },
    { id: "labor_net", label: "Labor Net($)", align: "right" as const },
    { id: "labor_margin", label: "Labor Margin(%)", align: "right" as const },
    { id: "labor_rate", label: "Labor Rate($)", align: "right" as const },
    { id: "material_net", label: "Material Net($)", align: "right" as const },
    { id: "material_margin", label: "Material Margin(%)", align: "right" as const },
    { id: "material_rate", label: "Material Rate($)", align: "right" as const },
    { id: "total_rate", label: "Total Rate($)", align: "right" as const },
    { id: "amount", label: "Amount", align: "right" as const },
    { id: "level", label: "Level", align: "left" as const },
    { id: "budget_code", label: "Budget Code", align: "left" as const },
    { id: "section", label: "Section", align: "left" as const },
    { id: "sub_section", label: "Sub Section", align: "left" as const },
    { id: "sub_element", label: "Sub Element", align: "left" as const },
    { id: "discipline", label: "Discipline", align: "left" as const },
    { id: "item_code", label: "Item Code", align: "left" as const },
    { id: "rate_source", label: "Rate Source", align: "left" as const },
    { id: "building_code", label: "Building", align: "left" as const },
  ], []);
  const defaultVisible = useMemo(() => new Set(allFlatColumns.slice(0, 11).map((c) => c.id)), [allFlatColumns]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(defaultVisible);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  function toggleColumn(colId: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      next.has(colId) ? next.delete(colId) : next.add(colId);
      return next;
    });
  }

  const [columnOrder, setColumnOrder] = useState<string[]>(() => allFlatColumns.map((c) => c.id));
  const [dragColId, setDragColId] = useState<string | null>(null);

  function handleColDragStart(e: React.DragEvent, colId: string) {
    setDragColId(colId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleColDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragColId || dragColId === targetId) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragColId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragColId);
      return next;
    });
  }

  function handleColDragEnd() {
    setDragColId(null);
  }

  const orderedColumns = useMemo(
    () => columnOrder.map((id) => allFlatColumns.find((c) => c.id === id)).filter(Boolean) as typeof allFlatColumns,
    [columnOrder, allFlatColumns]
  );

  const flatItems = useMemo(() => grouped
    ? grouped.groups.flatMap((g) =>
        g.budgetCodes.flatMap((bc) =>
          bc.sections.flatMap((sec) =>
            sec.subSections.flatMap((ss) =>
              ss.items.map((item) => ({ ...item, _group: `${g.codeLetter} — ${g.groupName}`, _budgetCode: bc.code }))
            )
          )
        )
      )
    : [], [grouped]);

  // BOQ flat-view filters
  const [filterLevel, setFilterLevel] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSubSection, setFilterSubSection] = useState("");
  const [filterSubElement, setFilterSubElement] = useState("");
  const [filterBudgetCode, setFilterBudgetCode] = useState("");

  const filterOptions = useMemo(() => {
    const levels = new Set<string>();
    const sections = new Set<string>();
    const subSections = new Set<string>();
    const subElements = new Set<string>();
    const budgetCodes = new Set<string>();
    for (const item of flatItems) {
      if (item.level) levels.add(item.level);
      if (item.section) sections.add(item.section);
      if (item.sub_section) subSections.add(item.sub_section);
      if (item.sub_element) subElements.add(item.sub_element);
      if (item._budgetCode) budgetCodes.add(item._budgetCode);
    }
    return {
      levels: Array.from(levels).sort(),
      sections: Array.from(sections).sort(),
      subSections: Array.from(subSections).sort(),
      subElements: Array.from(subElements).sort(),
      budgetCodes: Array.from(budgetCodes).sort(),
    };
  }, [flatItems]);

  const hasActiveFilters = filterLevel || filterSection || filterSubSection || filterSubElement || filterBudgetCode;

  function clearFilters() {
    setFilterLevel("");
    setFilterSection("");
    setFilterSubSection("");
    setFilterSubElement("");
    setFilterBudgetCode("");
  }

  const filteredGrouped = useMemo(() => {
    if (!grouped) return null;
    if (!hasActiveFilters) return grouped;
    const result = { grandTotal: 0, groups: grouped.groups.map((g) => {
      const bcFiltered = g.budgetCodes.map((bc) => {
        const secFiltered = bc.sections.map((sec) => {
          const ssFiltered = sec.subSections.map((ss) => {
            const itemsFiltered = ss.items.filter((item) => {
              if (filterLevel && item.level !== filterLevel) return false;
              if (filterSection && item.section !== filterSection) return false;
              if (filterSubSection && (item.sub_section || "") !== filterSubSection) return false;
              if (filterSubElement && (item.sub_element || "") !== filterSubElement) return false;
              if (filterBudgetCode && bc.code !== filterBudgetCode) return false;
              return true;
            });
            return { ...ss, items: itemsFiltered, subtotal: itemsFiltered.reduce((s, i) => s + (i.total_amount ?? 0), 0) };
          }).filter((ss) => ss.items.length > 0);
          return { ...sec, subSections: ssFiltered, subtotal: ssFiltered.reduce((s, ss) => s + ss.subtotal, 0) };
        }).filter((sec) => sec.subSections.length > 0);
        return { ...bc, sections: secFiltered, subtotal: secFiltered.reduce((s, sec) => s + sec.subtotal, 0) };
      }).filter((bc) => bc.sections.length > 0);
      return { ...g, budgetCodes: bcFiltered, subtotal: bcFiltered.reduce((s, bc) => s + bc.subtotal, 0) };
    }).filter((g) => g.budgetCodes.length > 0) };
    result.grandTotal = result.groups.reduce((s, g) => s + g.subtotal, 0);
    return result;
  }, [grouped, hasActiveFilters, filterLevel, filterSection, filterSubSection, filterSubElement, filterBudgetCode]);

  const filteredFlatItems = useMemo(() => {
    if (!hasActiveFilters) return flatItems;
    return flatItems.filter((item) => {
      if (filterLevel && item.level !== filterLevel) return false;
      if (filterSection && item.section !== filterSection) return false;
      if (filterSubSection && (item.sub_section || "") !== filterSubSection) return false;
      if (filterSubElement && (item.sub_element || "") !== filterSubElement) return false;
      if (filterBudgetCode && item._budgetCode !== filterBudgetCode) return false;
      return true;
    });
  }, [flatItems, hasActiveFilters, filterLevel, filterSection, filterSubSection, filterSubElement, filterBudgetCode]);

  const columnPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showColumnPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnPicker]);

  const [form, setForm] = useState(emptyForm);

  // Element Library picker dialog
  const [showElementPicker, setShowElementPicker] = useState(false);

  // Price List picker dialog
  const [showPriceListPicker, setShowPriceListPicker] = useState(false);

  // Intermediate step: pending selections waiting for level/building assignment
  const [pendingElementSelections, setPendingElementSelections] = useState<BoqElementLibrarySelection[] | null>(null);
  const [pendingPriceListSelections, setPendingPriceListSelections] = useState<TenderPriceListItem[] | null>(null);
  const [elementAssignForm, setElementAssignForm] = useState({
    level: "All",
    building_code: "",
    budget_code: "",
    quantity: "0",
    labor_margin_pct: "0",
    material_margin_pct: "0",
  });

  // SOP-QS-003 §7.1/§7.2 (BR6) — current live library rates for every
  // dwl_work_item_id/dwl_assembly_id on the loaded page, batch-fetched once
  // per load() and merged client-side per row to compute both staleness
  // badges. Empty maps render zero badges, never an error.
  const [currentRates, setCurrentRates] = useState<BoqLibraryCurrentRates>({
    workItemRates: new Map(),
    assemblyRates: new Map(),
    installedRates: new Map(),
  });

  // "Refresh from Library" (§7.3, BR7) — preview-then-confirm flow. Opening
  // the dialog builds a preview (no write); confirming commits exactly that
  // preview; cancelling (closing the dialog) never writes anything.
  const [refreshTarget, setRefreshTarget] = useState<TenderBoqItem | null>(null);
  const [refreshPreview, setRefreshPreview] = useState<BoqLibraryRefreshPreview | null>(null);
  const [loadingRefreshPreview, setLoadingRefreshPreview] = useState(false);
  const [committingRefresh, setCommittingRefresh] = useState(false);

  const { can } = useTenderPermissions();
  // Pricing is frozen from Internal Review onward (tender_lock_guard); hide the add actions.
  const canAdd = can("tender_boq", "can_create") && !isLocked;
  // Saving only reads the BOQ, so it stays available on locked (submitted / awarded) tenders.
  const { can: canQs } = useQsPermissions();
  const canSaveDatabase = canQs("qs_cost_database", "can_create");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, codes, wbsNodes] = await Promise.all([getBoqItemsGrouped(tenderId), getBudgetCodes(), getWbsProjectNodes(tenderId)]);
      setGrouped(g);
      setBudgetCodes(codes);
      setWbsLevels(wbsNodes.levels);
      setWbsBuildings(wbsNodes.buildings);
      try {
        const rates = await getBoqLibraryCurrentRates(flattenBoqItemsGrouped(g));
        setCurrentRates(rates);
      } catch (rateErr) {
        // Non-fatal — the BOQ itself loaded fine, only the staleness badges
        // are affected. Don't block the whole screen on this.
        console.warn("Failed to load current library rates for staleness badges", rateErr);
      }
      try {
        const [elements, descriptions] = await Promise.all([
          getQsElementLibrary(),
          getQsDescriptionLibrary(),
        ]);
        setElementLibrary(elements);
        setDescriptionLibrary(descriptions);
      } catch (libErr) {
        // Non-fatal — the qs_element_library / qs_description_library tables
        // may not be seeded/live yet in every environment; the BOQ itself
        // loaded fine, only the Discipline/Section/Sub Section/Sub Element/
        // Description pickers are affected.
        console.warn("Failed to load QS element/description library", libErr);
      }
      try {
        setPriceList(await getPriceList(tenderId));
      } catch (plErr) {
        // Non-fatal — only the "Add from Price List" picker is affected.
        console.warn("Failed to load tender price list", plErr);
      }
      try {
        const margins = await getTenderMargins(tenderId);
        setTenderMargins({ labor: margins.defaultLaborMarginPct, material: margins.defaultMaterialMarginPct });
      } catch (mErr) {
        console.warn("Failed to load tender default margins", mErr);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load BOQ");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      const bc = budgetCodes.find((c) => c.code === form.budget_code);
      await createBoqItem({
        tender_id: tenderId,
        section: form.section,
        item_code: `${form.budget_code || "MISC"}.${Date.now().toString().slice(-6)}`,
        description: form.description,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        budget_code_id: bc?.id ?? null,
        level: form.level,
        building_code: form.building_code || "",
        discipline: form.discipline || null,
        sub_section: form.sub_section || null,
        sub_element: form.sub_element || null,
        labor_net_cost: parseFloat(form.labor_net_cost) || 0,
        labor_margin_pct: parseFloat(form.labor_margin_pct) || 0,
        material_net_cost: parseFloat(form.material_net_cost) || 0,
        material_margin_pct: parseFloat(form.material_margin_pct) || 0,
      });
      toast.success("BOQ item added");
      closeForm();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
  }

  function openManualForm() {
    if (!showForm) {
      setForm(emptyForm);
    }
    setShowForm(!showForm);
  }

  // Element Library selection — store selections, open assign form for level/building
  function handleElementLibrarySelect(selections: BoqElementLibrarySelection[]) {
    setShowElementPicker(false);
    if (selections.length === 0) return;
    // Auto-fill budget_code from first element if available
    const firstBc = selections[0].element.budget_codes;
    setElementAssignForm({
      level: "All",
      building_code: "",
      budget_code: firstBc?.code ?? "",
      quantity: "0",
      labor_margin_pct: String(tenderMargins.labor),
      material_margin_pct: String(tenderMargins.material),
    });
    setPendingElementSelections(selections);
  }

  // Price List selection — store selections, open assign form for level/building.
  // Rates (labor/material net cost + margins) are NOT copied here — createBoqItem()
  // resolves them from price_list_item_id server-side so the BOQ line stays linked
  // to (and refreshable from) the source Price List row, via rate_source: 'price_list'.
  function handlePriceListSelect(selections: TenderPriceListItem[]) {
    setShowPriceListPicker(false);
    if (selections.length === 0) return;
    const firstBc = selections[0].budget_codes;
    setElementAssignForm({
      level: "All",
      building_code: "",
      budget_code: firstBc?.code ?? "",
      quantity: "0",
      labor_margin_pct: String(tenderMargins.labor),
      material_margin_pct: String(tenderMargins.material),
    });
    setPendingPriceListSelections(selections);
  }

  // Submit the assign form for Price List selections.
  async function handleSubmitPriceListAssign() {
    if (!pendingPriceListSelections || pendingPriceListSelections.length === 0) return;
    setSaving(true);
    try {
      const qty = parseFloat(elementAssignForm.quantity) || 0;
      let budgetCodeId: string | null = null;
      if (elementAssignForm.budget_code) {
        const match = budgetCodes.find((c) => c.code === elementAssignForm.budget_code);
        if (match) budgetCodeId = match.id;
      }
      let created = 0;
      for (const pl of pendingPriceListSelections) {
        await createBoqItem({
          tender_id: tenderId,
          section: pl.section || "Direct Works",
          item_code: `${elementAssignForm.budget_code || pl.budget_codes?.code || "MISC"}.${Date.now().toString().slice(-6)}${created > 0 ? `-${created}` : ""}`,
          description: pl.description,
          unit: pl.unit,
          quantity: qty,
          budget_code_id: budgetCodeId ?? pl.budget_code_id ?? null,
          level: elementAssignForm.level,
          building_code: elementAssignForm.building_code,
          sub_section: pl.sub_section || null,
          sub_element: pl.sub_element || null,
          price_list_item_id: pl.id,
        });
        created++;
      }
      toast.success(`${created} BOQ item${created !== 1 ? "s" : ""} added from Price List`);
      setPendingPriceListSelections(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add items from Price List");
    } finally {
      setSaving(false);
    }
  }

  // Submit the assign form — create BOQ items with user-specified level/building/etc.
  async function handleSubmitElementAssign() {
    if (!pendingElementSelections || pendingElementSelections.length === 0) return;
    setSaving(true);
    try {
      const qty = parseFloat(elementAssignForm.quantity) || 0;
      // Resolve budget_code_id from code
      let budgetCodeId: string | null = null;
      if (elementAssignForm.budget_code) {
        const match = budgetCodes.find((c) => c.code === elementAssignForm.budget_code);
        if (match) budgetCodeId = match.id;
      }
      const laborMargin = parseFloat(elementAssignForm.labor_margin_pct) || 0;
      const materialMargin = parseFloat(elementAssignForm.material_margin_pct) || 0;
      let created = 0;
      for (const sel of pendingElementSelections) {
        const bc = sel.element.budget_codes;
        await createBoqItem({
          tender_id: tenderId,
          section: sel.element.section,
          item_code: `${elementAssignForm.budget_code || bc?.code || "MISC"}.${Date.now().toString().slice(-6)}${created > 0 ? `-${created}` : ""}`,
          description: sel.description.description,
          unit: sel.element.typical_unit ?? "ea",
          quantity: qty,
          budget_code_id: budgetCodeId ?? sel.element.budget_code_id ?? null,
          level: elementAssignForm.level,
          building_code: elementAssignForm.building_code,
          discipline: sel.element.discipline || null,
          sub_section: sel.element.sub_section || null,
          sub_element: sel.element.sub_element || null,
          labor_net_cost: sel.description.labor_rate ?? 0,
          labor_margin_pct: laborMargin,
          material_net_cost: sel.description.material_rate ?? 0,
          material_margin_pct: materialMargin,
        });
        created++;
      }
      toast.success(`${created} BOQ item${created !== 1 ? "s" : ""} added from Element Library`);
      setPendingElementSelections(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add items from Element Library");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteBoqItem(id);
      toast.success("Item deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  // "Refresh from Library" (§7.3, BR7) — opening the dialog only builds a
  // preview (no write happens yet). Available only from rows whose
  // rate_source is library-sourced (enforced again inside
  // buildBoqLibraryRefreshPreview itself, not just at the button gate).
  async function handleRefreshClick(item: TenderBoqItem) {
    setRefreshTarget(item);
    setRefreshPreview(null);
    setLoadingRefreshPreview(true);
    try {
      const preview = await buildBoqLibraryRefreshPreview(item);
      setRefreshPreview(preview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build refresh preview");
      setRefreshTarget(null);
    } finally {
      setLoadingRefreshPreview(false);
    }
  }

  function closeRefreshDialog() {
    setRefreshTarget(null);
    setRefreshPreview(null);
  }

  // Explicit confirm — cancelling/closing the dialog above never calls this,
  // so "cancel = no write at all" (§7.3 BR7) holds.
  async function handleConfirmRefresh() {
    if (!refreshTarget || !refreshPreview) return;
    setCommittingRefresh(true);
    try {
      await commitBoqLibraryRefresh(refreshTarget, refreshPreview);
      toast.success("Rate refreshed from library");
      // §6.4/BR9 — re-run the guardrail check against the NEW snapshot,
      // since a refresh can shift the resource mix. Non-blocking.
      if (refreshPreview.equipmentSubconShare > EQUIPMENT_SUBCON_GUARDRAIL_PCT / 100) {
        toast.warning(
          `This rate is now ${(refreshPreview.equipmentSubconShare * 100).toFixed(0)}% equipment/subcontract — material_margin_pct will apply to that amount too. Review the margin before finalizing.`
        );
      }
      closeRefreshDialog();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh from library");
    } finally {
      setCommittingRefresh(false);
    }
  }

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // QS Element Library cascade (Discipline → Section → Sub Section → Sub
  // Element → Description) — options at each level are derived from whatever
  // was picked at the level above, so the estimator can only pick valid
  // combinations.
  const disciplineOptions = Array.from(new Set(elementLibrary.map((e) => e.discipline))).sort();
  const sectionOptions = form.discipline
    ? Array.from(new Set(elementLibrary.filter((e) => e.discipline === form.discipline).map((e) => e.section))).sort()
    : [];
  const subSectionOptions = form.discipline && form.section
    ? Array.from(
        new Set(
          elementLibrary
            .filter((e) => e.discipline === form.discipline && e.section === form.section)
            .map((e) => e.sub_section)
        )
      ).sort()
    : [];
  const subElementRows = form.discipline && form.section && form.sub_section
    ? elementLibrary.filter(
        (e) => e.discipline === form.discipline && e.section === form.section && e.sub_section === form.sub_section
      )
    : [];
  const subElementOptions = Array.from(new Set(subElementRows.map((e) => e.sub_element))).sort();

  const selectedElementRow = form.sub_element
    ? subElementRows.find((e) => e.sub_element === form.sub_element)
    : null;
  const descriptionOptions = selectedElementRow
    ? descriptionLibrary
        .filter((d) => d.element_library_id === selectedElementRow.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  function handleSubElementSelect(value: string) {
    const row = subElementRows.find((e) => e.sub_element === value);
    setForm((prev) => ({
      ...prev,
      sub_element: value,
      description: "",
      unit: row?.typical_unit ?? prev.unit,
      budget_code: row?.budget_codes?.code ?? prev.budget_code,
    }));
  }

  function handleDescriptionSelect(value: string) {
    const matchedDesc = selectedElementRow
      ? descriptionLibrary.find((d) => d.element_library_id === selectedElementRow.id && d.description === value)
      : null;
    setForm((prev) => ({
      ...prev,
      description: value,
      ...(selectedElementRow ? {
        unit: selectedElementRow.typical_unit ?? prev.unit,
        budget_code: selectedElementRow.budget_codes?.code ?? prev.budget_code,
      } : {}),
      ...(matchedDesc ? {
        labor_net_cost: String(matchedDesc.labor_rate ?? 0),
        material_net_cost: String(matchedDesc.material_rate ?? 0),
      } : {}),
    }));
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const display = filteredGrouped ?? grouped!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{(filteredGrouped ?? grouped)?.groups.reduce((n, g) => n + g.budgetCodes.reduce((m, b) => m + b.sections.reduce((k, s) => k + s.subSections.reduce((j, ss) => j + ss.items.length, 0), 0), 0), 0) ?? 0} item(s) · Direct Works ${fmt((filteredGrouped ?? grouped)?.grandTotal ?? 0)}</p>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <div className="flex rounded-md border border-border overflow-hidden mr-2">
            <button
              onClick={() => setViewLevel("main")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewLevel === "main" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
            >Main</button>
            <button
              onClick={() => setViewLevel("detail")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewLevel === "detail" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
            >Detail</button>
            <button
              onClick={() => setViewLevel("flat")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewLevel === "flat" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
            >Flat</button>
          </div>
          {viewLevel === "flat" && (
            <div className="relative" ref={columnPickerRef}>
              <Button size="sm" variant="outline" onClick={() => setShowColumnPicker(!showColumnPicker)}>
                <Columns3 className="mr-1 h-3.5 w-3.5" /> Columns
              </Button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-background shadow-lg p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground px-2 pb-1">Drag to reorder · Click to toggle</p>
                  {orderedColumns.map((col) => (
                    <div
                      key={col.id}
                      draggable
                      onDragStart={(e) => handleColDragStart(e, col.id)}
                      onDragOver={(e) => handleColDragOver(e, col.id)}
                      onDragEnd={handleColDragEnd}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
                        dragColId === col.id ? "bg-primary/10 opacity-50" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-muted-foreground text-[10px]">⠿</span>
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.id)}
                        onChange={() => toggleColumn(col.id)}
                        className="h-3 w-3"
                      />
                      {col.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isLocked && can("tender_boq", "can_create") && (
            <span className="text-xs text-amber-700">Pricing locked — adding items (incl. Assign from Cost Library) is disabled</span>
          )}
          {canSaveDatabase && (
          <Button size="sm" variant="outline" onClick={() => setShowSaveDatabase(true)} disabled={!grouped || flattenBoqItemsGrouped(grouped).length === 0} title="Save a frozen copy of this BOQ to Quantity Surveying → Cost Database">
            <Database className="mr-1 h-4 w-4" /> Save to Cost Database
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowCostDatabase(true)} disabled={saving}>
            <Database className="mr-1 h-4 w-4" /> Assign from Cost Database
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          )}
          {canAdd && (
          <Button size="sm" onClick={() => setShowCostLibrary(true)} disabled={saving}>
            <Blocks className="mr-1 h-4 w-4" /> Assign from Cost Library
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowElementPicker(true)} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Library className="mr-1 h-4 w-4" />} Add from Element Library
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowAiDraft(true)} disabled={saving}>
            <Sparkles className="mr-1 h-4 w-4" /> AI Draft from Drawing
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowPriceListPicker(true)} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Tag className="mr-1 h-4 w-4" />} Add from Price List
          </Button>
          )}
          {canAdd && (
          <Button size="sm" variant="outline" onClick={openManualForm}>
            <Plus className="mr-1 h-4 w-4" /> Add Item
          </Button>
          )}
        </div>
      </div>

      {flatItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Filter:</span>
          <select value={filterBudgetCode} onChange={(e) => setFilterBudgetCode(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary">
            <option value="">All Budget Codes</option>
            {filterOptions.budgetCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary">
            <option value="">All Levels</option>
            {filterOptions.levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary">
            <option value="">All Sections</option>
            {filterOptions.sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterSubSection} onChange={(e) => setFilterSubSection(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary">
            <option value="">All Sub Sections</option>
            {filterOptions.subSections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterSubElement} onChange={(e) => setFilterSubElement(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary">
            <option value="">All Sub Elements</option>
            {filterOptions.subElements.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
              Clear
            </button>
          )}
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Budget Code *</label>
                <select value={form.budget_code} onChange={(e) => setForm({ ...form, budget_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Level</label>
                <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="All">All — Unallocated</option>
                  {wbsLevels.map((l) => <option key={l.id} value={l.wbs_code}>{l.wbs_code} — {l.wbs_name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Building</label>
                <select value={form.building_code} onChange={(e) => setForm({ ...form, building_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {wbsBuildings.map((b) => <option key={b.id} value={b.wbs_code}>{b.wbs_code} — {b.wbs_name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Discipline</label>
                <select
                  value={form.discipline}
                  onChange={(e) => setForm({ ...form, discipline: e.target.value, section: "", sub_section: "", sub_element: "" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {disciplineOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Section</label>
                <select
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value, sub_section: "", sub_element: "" })}
                  disabled={!form.discipline}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{form.discipline ? "Select..." : "Select Discipline first"}</option>
                  {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Sub Section</label>
                <select
                  value={form.sub_section}
                  onChange={(e) => setForm({ ...form, sub_section: e.target.value, sub_element: "" })}
                  disabled={!form.section}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{form.section ? "Select..." : "Select Section first"}</option>
                  {subSectionOptions.map((ss) => <option key={ss} value={ss}>{ss}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Sub Element</label>
                <select
                  value={form.sub_element}
                  onChange={(e) => handleSubElementSelect(e.target.value)}
                  disabled={!form.sub_section}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{form.sub_section ? "Select..." : "Select Sub Section first"}</option>
                  {subElementOptions.map((se) => <option key={se} value={se}>{se}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label>
                {descriptionOptions.length > 0 ? (
                  <select
                    value={form.description}
                    onChange={(e) => handleDescriptionSelect(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select description...</option>
                    {descriptionOptions.map((d) => (
                      <option key={d.id} value={d.description}>
                        {d.description}{d.in_price_list ? " ✓" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder={form.sub_element ? "Enter description..." : "Select Sub Element first"} />
                )}
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Unit</label>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {BOQ_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Net Cost</label><input type="number" value={form.labor_net_cost} onChange={(e) => setForm({ ...form, labor_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Margin %</label><input type="number" value={form.labor_margin_pct} onChange={(e) => setForm({ ...form, labor_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Net Cost</label><input type="number" value={form.material_net_cost} onChange={(e) => setForm({ ...form, material_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Margin %</label><input type="number" value={form.material_margin_pct} onChange={(e) => setForm({ ...form, material_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={closeForm}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.description.trim() || !form.budget_code}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!grouped || grouped.groups.length === 0 ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No BOQ items yet — import your Raw Data spreadsheet or add items manually</div>
      ) : display.groups.length === 0 ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No items match the selected filters</div>
      ) : viewLevel === "main" ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Group</th>
                <th className="text-right px-3 py-2 font-medium">Budget Codes</th>
                <th className="text-right px-3 py-2 font-medium">Items</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {display.groups.map((g) => {
                const itemCount = g.budgetCodes.reduce((m, b) => m + b.sections.reduce((k, s) => k + s.subSections.reduce((j, ss) => j + ss.items.length, 0), 0), 0);
                return (
                <tr key={`main-${g.codeLetter}`} className="bg-slate-100 cursor-pointer" onClick={() => toggle(g.codeLetter)}>
                  <td className="px-3 py-2 font-semibold flex items-center gap-1">
                    {collapsed.has(g.codeLetter) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {g.codeLetter} — {g.groupName}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">{g.budgetCodes.length}</td>
                  <td className="px-3 py-2 text-right text-xs">{itemCount}</td>
                  <td className="px-3 py-2 text-right font-semibold">${fmt(g.subtotal)}</td>
                </tr>
                );
              })}
              <tr className="font-semibold border-t-2 border-border">
                <td className="px-3 py-2" colSpan={3}>Grand Total</td>
                <td className="px-3 py-2 text-right">${fmt(display.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : viewLevel === "flat" ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {orderedColumns.filter((c) => visibleColumns.has(c.id)).map((col) => (
                  <th key={col.id} className={`px-3 py-2 font-medium text-xs whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}>
                    {col.label}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredFlatItems.map((item) => {
                const isLibrarySourced = item.rate_source === "dwl_work_item" || item.rate_source === "dwl_assembly";
                const isPriceListSourced = item.rate_source === "price_list";
                const staleness = getBoqItemStaleness(item, currentRates);
                const laborNet = item.labor_net_cost ?? 0;
                const laborMargin = item.labor_margin_pct ?? 0;
                const laborRate = laborNet * (1 + laborMargin / 100);
                const materialNet = item.material_net_cost ?? 0;
                const materialMargin = item.material_margin_pct ?? 0;
                const materialRate = materialNet * (1 + materialMargin / 100);
                const totalRate = laborRate + materialRate;
                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    {orderedColumns.filter((c) => visibleColumns.has(c.id)).map((col) => {
                      if (col.id === "description") {
                        return (
                          <td key="description" className="px-3 py-1.5 text-xs max-w-[250px]">
                            <div className="truncate">{item.description}</div>
                            {(staleness.rateChangedSincePriced || staleness.libraryPriceExpired || isPriceListSourced) && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {staleness.rateChangedSincePriced && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 text-[9px]">Rate changed</Badge>}
                                {staleness.libraryPriceExpired && <Badge variant="outline" className="text-muted-foreground text-[9px]">Expired</Badge>}
                                {isPriceListSourced && <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 text-[9px]">Price List</Badge>}
                              </div>
                            )}
                          </td>
                        );
                      }
                      const valueMap: Record<string, { text: string; cls?: string }> = {
                        unit: { text: item.unit },
                        qty: { text: fmt(item.quantity), cls: "font-medium" },
                        labor_net: { text: `$${fmt(laborNet)}` },
                        labor_margin: { text: `${fmt(laborMargin)}%` },
                        labor_rate: { text: `$${fmt(laborRate)}`, cls: "font-medium" },
                        material_net: { text: `$${fmt(materialNet)}` },
                        material_margin: { text: `${fmt(materialMargin)}%` },
                        material_rate: { text: `$${fmt(materialRate)}`, cls: "font-medium" },
                        total_rate: { text: `$${fmt(totalRate)}`, cls: "font-medium" },
                        amount: { text: `$${fmt(item.total_amount)}`, cls: "font-medium" },
                        level: { text: item.level },
                        budget_code: { text: item._budgetCode },
                        section: { text: item.section },
                        sub_section: { text: item.sub_section || "" },
                        sub_element: { text: item.sub_element || "" },
                        discipline: { text: item.discipline || "" },
                        item_code: { text: item.item_code },
                        rate_source: { text: isInstalledCostSnapshot(item.rate_build_up) ? "Cost Library" : item.rate_source },
                        building_code: { text: item.building_code },
                      };
                      const v = valueMap[col.id];
                      if (!v) return null;
                      return (
                        <td key={col.id} className={`px-3 py-1.5 text-xs whitespace-nowrap ${col.align === "right" ? "text-right" : ""} ${v.cls ?? ""}`}>
                          {v.text}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {isLibrarySourced && can("tender_boq", "edit") && (
                          <button onClick={() => handleRefreshClick(item)} className="text-muted-foreground hover:text-blue-600" disabled={refreshTarget?.id === item.id && loadingRefreshPreview} title="Refresh from Library">
                            {refreshTarget?.id === item.id && loadingRefreshPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {can("tender_boq", "delete") && (
                          <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                            {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-left px-3 py-2 font-medium">Unit</th>
                <th className="text-right px-3 py-2 font-medium">Qty</th>
                <th className="text-right px-3 py-2 font-medium">Labor Net($)</th>
                <th className="text-right px-3 py-2 font-medium">Labor Margin(%)</th>
                <th className="text-right px-3 py-2 font-medium">Labor Rate($)</th>
                <th className="text-right px-3 py-2 font-medium">Material Net($)</th>
                <th className="text-right px-3 py-2 font-medium">Material Margin(%)</th>
                <th className="text-right px-3 py-2 font-medium">Material Rate($)</th>
                <th className="text-right px-3 py-2 font-medium">Total Rate($)</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {display.groups.map((g) => (
                <Fragment key={`g-${g.codeLetter}`}>
                  <tr className="bg-slate-100 cursor-pointer" onClick={() => toggle(g.codeLetter)}>
                    <td className="px-3 py-2 font-semibold flex items-center gap-1" colSpan={10}>
                      {collapsed.has(g.codeLetter) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {g.codeLetter} — {g.groupName}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">${fmt(g.subtotal)}</td>
                    <td />
                  </tr>
                  {!collapsed.has(g.codeLetter) && g.budgetCodes.map((bc) => (
                    <Fragment key={`bc-${bc.budgetCodeId}-${bc.code}`}>
                      <tr className="bg-slate-50">
                        <td className="px-3 py-1.5 pl-6 font-medium text-xs" colSpan={10}>{bc.code} — {bc.description}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(bc.subtotal)}</td>
                        <td />
                      </tr>
                      {bc.sections.map((sec) => (
                        <Fragment key={`sec-${bc.budgetCodeId}-${sec.section}`}>
                          {sec.subSections.map((ss) => (
                            <Fragment key={`ss-${bc.budgetCodeId}-${sec.section}-${ss.subSection}`}>
                              {ss.items.map((item) => {
                                const isLibrarySourced = item.rate_source === "dwl_work_item" || item.rate_source === "dwl_assembly";
                                const isPriceListSourced = item.rate_source === "price_list";
                                const staleness = getBoqItemStaleness(item, currentRates);
                                const laborNet = item.labor_net_cost ?? 0;
                                const laborMargin = item.labor_margin_pct ?? 0;
                                const laborRate = laborNet * (1 + laborMargin / 100);
                                const materialNet = item.material_net_cost ?? 0;
                                const materialMargin = item.material_margin_pct ?? 0;
                                const materialRate = materialNet * (1 + materialMargin / 100);
                                const totalRate = laborRate + materialRate;
                                return (
                                <tr key={item.id}>
                                  <td className="px-3 py-1.5 pl-10 text-xs">
                                    <div>{item.description}</div>
                                    <div className="text-[10px] text-muted-foreground">{sec.section}{ss.subSection !== "—" ? ` · ${ss.subSection}` : ""} · {item.level}</div>
                                    {(staleness.rateChangedSincePriced || staleness.libraryPriceExpired || isPriceListSourced) && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {staleness.rateChangedSincePriced && (
                                          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                                            Rate changed since priced
                                          </Badge>
                                        )}
                                        {staleness.libraryPriceExpired && (
                                          <Badge variant="outline" className="text-muted-foreground">
                                            Library price expired
                                          </Badge>
                                        )}
                                        {isPriceListSourced && (
                                          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
                                            Linked to Price List
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{item.unit}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">{fmt(item.quantity)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">${fmt(laborNet)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">{fmt(laborMargin)}%</td>
                                  <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(laborRate)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">${fmt(materialNet)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">{fmt(materialMargin)}%</td>
                                  <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(materialRate)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(totalRate)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(item.total_amount)}</td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center justify-end gap-2">
                                      {isLibrarySourced && can("tender_boq", "edit") && (
                                        <button
                                          onClick={() => handleRefreshClick(item)}
                                          className="text-muted-foreground hover:text-blue-600"
                                          disabled={refreshTarget?.id === item.id && loadingRefreshPreview}
                                          title="Refresh from Library"
                                        >
                                          {refreshTarget?.id === item.id && loadingRefreshPreview ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      )}
                                      {can("tender_boq", "delete") && (
                                      <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                                        {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                      </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <TenderCostImportDialog tenderId={tenderId} initialMode="boq" onClose={() => setShowImport(false)} onImported={load} />
      )}

      <BoqElementLibraryPickerDialog
        open={showElementPicker}
        onClose={() => setShowElementPicker(false)}
        elements={elementLibrary}
        descriptions={descriptionLibrary}
        onConfirm={handleElementLibrarySelect}
      />

      <PriceListPickerDialog
        open={showPriceListPicker}
        onClose={() => setShowPriceListPicker(false)}
        priceList={priceList}
        onConfirm={handlePriceListSelect}
      />

      <AssignLibraryToBoqDialog
        open={showCostLibrary}
        onOpenChange={setShowCostLibrary}
        tenderId={tenderId}
        onAssigned={() => void load()}
      />

      <AssignCostDatabaseDialog
        open={showCostDatabase}
        onOpenChange={setShowCostDatabase}
        tenderId={tenderId}
        onAssigned={() => void load()}
      />

      <SaveToCostDatabaseDialog
        open={showSaveDatabase}
        onOpenChange={setShowSaveDatabase}
        tenderId={tenderId}
        itemCount={grouped ? flattenBoqItemsGrouped(grouped).length : 0}
        total={grouped?.grandTotal ?? 0}
      />

      {showAiDraft && (
        <AiBoqDraftDialog
          tenderId={tenderId}
          budgetCodes={budgetCodes}
          onClose={() => setShowAiDraft(false)}
          onAccepted={() => void load()}
        />
      )}

      {/* Assign form — intermediate step after Element Library or Price List selection */}
      {(() => {
        const pendingUnits = pendingElementSelections
          ? [...new Set(pendingElementSelections.map((s) => s.element.typical_unit ?? "ea"))]
          : pendingPriceListSelections
            ? [...new Set(pendingPriceListSelections.map((s) => s.unit ?? "ea"))]
            : [];
        const unitLabel = pendingUnits.length === 0 ? "" : pendingUnits.length === 1 ? pendingUnits[0] : pendingUnits.join(", ");
        return (
      <Dialog
        open={!!pendingElementSelections || !!pendingPriceListSelections}
        onOpenChange={(open) => {
          if (!open) {
            setPendingElementSelections(null);
            setPendingPriceListSelections(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Level & Settings</DialogTitle>
            <DialogDescription>
              {(pendingElementSelections?.length ?? pendingPriceListSelections?.length ?? 0)} item(s) selected from {pendingPriceListSelections ? "the Price List" : "Element Library"}.
              Set the WBS Level, Building, Budget Code, and Quantity before adding to BOQ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Level</label>
              <select
                value={elementAssignForm.level}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, level: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="All">All — Unallocated</option>
                {wbsLevels.map((l) => <option key={l.id} value={l.wbs_code}>{l.wbs_code} — {l.wbs_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Building</label>
              <select
                value={elementAssignForm.building_code}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, building_code: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {wbsBuildings.map((b) => <option key={b.id} value={b.wbs_code}>{b.wbs_code} — {b.wbs_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Budget Code</label>
              <select
                value={elementAssignForm.budget_code}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, budget_code: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Quantity{unitLabel ? ` (${unitLabel})` : ""}</label>
              <input
                type="number"
                step="any"
                value={elementAssignForm.quantity}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, quantity: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Labor Margin %</label>
              <input
                type="number"
                step="any"
                value={elementAssignForm.labor_margin_pct}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, labor_margin_pct: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Material Margin %</label>
              <input
                type="number"
                step="any"
                value={elementAssignForm.material_margin_pct}
                onChange={(e) => setElementAssignForm({ ...elementAssignForm, material_margin_pct: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setPendingElementSelections(null); setPendingPriceListSelections(null); }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={pendingPriceListSelections ? handleSubmitPriceListAssign : handleSubmitElementAssign} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add {pendingElementSelections?.length ?? pendingPriceListSelections?.length ?? 0} Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        );
      })()}

      {/* SOP-QS-003 §7.3 BR7 — Refresh confirmation. Opening this dialog has
          already built a preview (no write); closing it (Cancel/backdrop)
          discards that preview and writes nothing. Only "Confirm Refresh"
          commits. */}
      <Dialog
        open={!!refreshTarget}
        onOpenChange={(open) => {
          if (!open) closeRefreshDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refresh from Library</DialogTitle>
            <DialogDescription>
              {refreshTarget?.description} — this overwrites the rate build-up and net costs from the
              current library data. Your margins are not changed.
            </DialogDescription>
          </DialogHeader>

          {loadingRefreshPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : refreshPreview ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="grid grid-cols-3 gap-2 font-medium text-muted-foreground">
                  <span />
                  <span className="text-right">Before</span>
                  <span className="text-right">After</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <span className="text-muted-foreground">Net direct rate</span>
                  <span className="text-right font-mono">${fmt(refreshPreview.before.snapshot_net_direct_rate)}</span>
                  <span className="text-right font-mono">${fmt(refreshPreview.after.snapshot_net_direct_rate)}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 border-t border-border pt-1">
                  <span className="text-muted-foreground">% change</span>
                  <span className="col-span-2 text-right font-mono">
                    {refreshPreview.before.snapshot_net_direct_rate !== 0
                      ? `${(((refreshPreview.after.snapshot_net_direct_rate - refreshPreview.before.snapshot_net_direct_rate) / refreshPreview.before.snapshot_net_direct_rate) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 font-medium">
                  <span>Unit rate</span>
                  <span className="text-right font-mono">${fmt(refreshPreview.before.unit_rate)}</span>
                  <span className="text-right font-mono">${fmt(refreshPreview.after.unit_rate)}</span>
                </div>
              </div>

              {!refreshPreview.reconciles && (
                <p className="text-xs text-amber-700">
                  Library recipe lines don&apos;t fully reconcile with the header rate — review before confirming.
                </p>
              )}

              {refreshPreview.equipmentSubconShare > EQUIPMENT_SUBCON_GUARDRAIL_PCT / 100 && (
                <p className="text-xs text-amber-700">
                  This rate is {(refreshPreview.equipmentSubconShare * 100).toFixed(0)}% equipment/subcontract —
                  material_margin_pct will apply to that amount too. Review the margin before confirming.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={closeRefreshDialog} disabled={committingRefresh}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRefresh}
              disabled={!refreshPreview || loadingRefreshPreview || committingRefresh}
            >
              {committingRefresh && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Confirm Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
