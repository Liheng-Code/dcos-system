"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Boxes, Check, HardHat, Info, Layers, ListChecks, Loader2, Pencil, Percent,
  Plus, Ruler, RotateCcw, Trash2, Users, Wallet, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";
import { DwlCostItemGeneralEditDialog } from "@/components/qs/dwl-cost-item-general-edit-dialog";
import { DwlRecipeLineFormDialog } from "@/components/qs/dwl-recipe-line-form-dialog";
import { DwlAssemblyResourceLineFormDialog } from "@/components/qs/dwl-assembly-resource-line-form-dialog";
import { DwlAssemblyLayerFormDialog } from "@/components/qs/dwl-assembly-layer-form-dialog";
import { DwlAssemblyLayerViewer3D } from "@/components/qs/dwl-assembly-layer-viewer-3d";
import type {
  DwlAssemblyCostingSummaryRow,
  DwlAssemblyCrewRow,
  DwlAssemblyEquipmentRow,
  DwlAssemblyLayer,
  DwlAssemblyLayerMaterial,
  DwlAssemblyLayerMaterialRow,
  DwlAssemblyLayerSpec,
  DwlAssemblyMaterialExplosionRow,
  DwlAssemblySpec,
  DwlSupplierMaterialRow,
  DwlWorkItem,
  DwlWorkItemResource,
} from "@/components/qs/dwl-types";
import { deleteDwlAssemblyCrewById, deleteDwlAssemblyEquipmentById, deleteDwlAssemblyLayerById, deleteDwlWorkItemResourceById, getDwlVAssemblyCostingSummaryByAssemblyId, getProfileById, insertDwlAssemblyItem, insertDwlWorkItemReturning, listDwlAssemblyCrewByAssemblyId, listDwlAssemblyEquipmentByAssemblyId, listDwlAssemblyItemsByAssemblyId, listDwlAssemblyLayerMaterialsByLayerIds, listDwlAssemblyLayerSpecsByLayerIds, listDwlAssemblyLayersByAssemblyId, listDwlAssemblySpecsByAssemblyId, listDwlResourcePricesByResourceIds, listDwlVAssemblyLayerMaterialsByLayerIds, listDwlVAssemblyMaterialExplosionByAssemblyId, listDwlVResourceCostingRatesByResourceIds, listDwlVSupplierMaterialsByResourceIdsWithIsActive, listDwlWorkItemResourcesByWorkItemIds, listDwlWorkItemsByIds, updateDwlAssemblyCostingByAssemblyId } from "@/lib/qs/qs-queries";

const SUMMARY_COLUMNS =
  "assembly_id, code, element_group, description, unit, daily_output, overhead_pct, risk_pct, profit_pct, " +
  "guardrail_note, version_label, status, discipline, work_item_type, created_by, created_by_name, updated_at, " +
  "tuned_at, is_tuned, " +
  "material_base_cost, waste_cost, material_total_cost, " +
  "crew_cost_per_day, equipment_cost_per_day, labor_cost_per_unit, equipment_cost_per_unit, " +
  "direct_installed_cost, target_tender_rate";

const MATERIAL_COLUMNS =
  "assembly_id, assembly_code, resource_id, material_code, material_description, unit, consumption, " +
  "waste_pct, effective_qty, unit_price, currency, base_cost_contribution, waste_cost_contribution, " +
  "cost_contribution, is_expired, basis_note, sort_order";

function formatMoney(v: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}
function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function round2(v: number) { return Math.round(v * 100) / 100; }

function specValues(specs: DwlAssemblySpec[], section: DwlAssemblySpec["section"]) {
  return specs
    .filter((s) => s.section === section && s.spec_label !== "__intro__")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.spec_value);
}

type Tab = "general" | "calculator" | "boq" | "labour" | "specifications" | "cost_summary";
const TABS: { key: Tab; label: string; shortLabel: string; icon: typeof Info }[] = [
  { key: "general", label: "General Info", shortLabel: "General Info", icon: Info },
  { key: "calculator", label: "Installed Cost Calculator", shortLabel: "Cost Calculator", icon: Wallet },
  { key: "boq", label: "Bill of Quantities (Material Components)", shortLabel: "Bill of Quantities", icon: ListChecks },
  { key: "labour", label: "Labour & Productivity", shortLabel: "Labour", icon: Users },
  { key: "specifications", label: "Specifications", shortLabel: "Specifications", icon: Layers },
  { key: "cost_summary", label: "Cost Summary", shortLabel: "Cost Summary", icon: Ruler },
];

// Simple least-squares linear regression, x = days since first point.
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

interface PricePoint { date: string; price: number; days: number }

interface DwlCostItemDetailProps {
  assemblyId: string;
  onChanged: () => void;
}

export function DwlCostItemDetail({ assemblyId, onChanged }: DwlCostItemDetailProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [summary, setSummary] = useState<DwlAssemblyCostingSummaryRow | null>(null);
  const [materials, setMaterials] = useState<DwlAssemblyMaterialExplosionRow[]>([]);
  const [crew, setCrew] = useState<DwlAssemblyCrewRow[]>([]);
  const [equipment, setEquipment] = useState<DwlAssemblyEquipmentRow[]>([]);
  const [layers, setLayers] = useState<DwlAssemblyLayer[]>([]);
  const [specs, setSpecs] = useState<DwlAssemblySpec[]>([]);
  const [suppliers, setSuppliers] = useState<DwlSupplierMaterialRow[]>([]);
  const [showEditGeneral, setShowEditGeneral] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<Record<string, PricePoint[]>>({});
  const [trendResourceId, setTrendResourceId] = useState<string>("");
  const { can } = useQsPermissions();

  const [assemblyWorkItems, setAssemblyWorkItems] = useState<DwlWorkItem[]>([]);
  const [rawLineByResourceId, setRawLineByResourceId] = useState<Map<string, DwlWorkItemResource>>(new Map());
  const [addMaterialWorkItemId, setAddMaterialWorkItemId] = useState<string>("");
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [editingMaterialLine, setEditingMaterialLine] = useState<DwlWorkItemResource | null>(null);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [editingCrewLine, setEditingCrewLine] = useState<DwlAssemblyCrewRow | null>(null);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipmentLine, setEditingEquipmentLine] = useState<DwlAssemblyEquipmentRow | null>(null);

  const [layerMaterialLinks, setLayerMaterialLinks] = useState<DwlAssemblyLayerMaterial[]>([]);
  const [layerMaterialSummary, setLayerMaterialSummary] = useState<DwlAssemblyLayerMaterialRow[]>([]);
  const [layerSpecs, setLayerSpecs] = useState<DwlAssemblyLayerSpec[]>([]);
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [editingLayer, setEditingLayer] = useState<DwlAssemblyLayer | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("");
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(new Set());
  const [layerViewMode, setLayerViewMode] = useState<"composite" | "exploded" | "peeling">("composite");
  const [layerOpacity, setLayerOpacity] = useState(100);
  const [layerViewIs3D, setLayerViewIs3D] = useState(true);

  // ── Interactive Site Productivity & Height Adjuster — client-side
  // what-if only, nothing here is persisted.
  const [simHeight, setSimHeight] = useState(3.0);
  const [simOpeningsMultiplier, setSimOpeningsMultiplier] = useState(1.0);
  const [simCrewRates, setSimCrewRates] = useState<Record<string, number>>({});

  // Core data — needed for the General Info tab and the persistent header
  // shown on every tab (code/description/direct+tender cost/weighting bar/
  // guardrail note all come from `summary`; boundary/assumptions/lessons
  // from `specs`). Kept deliberately small (2 queries) so switching cards
  // in the list feels instant; everything else loads in loadExtras below,
  // concurrently, without blocking this from resolving first.
  const loadCore = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setTab("general");

    const [sumRes, specRes] = await Promise.all([
      getDwlVAssemblyCostingSummaryByAssemblyId(SUMMARY_COLUMNS, assemblyId),
      listDwlAssemblySpecsByAssemblyId(assemblyId),
    ]);

    if (sumRes.error) { setErrorMsg(sumRes.error.message); setLoading(false); return; }
    setSummary((sumRes.data ?? null) as unknown as DwlAssemblyCostingSummaryRow | null);
    setSpecs((specRes.data ?? []) as DwlAssemblySpec[]);
    setLoading(false);
  }, [assemblyId, supabase]);

  // Everything the other 5 tabs need (BOQ, Labour, Specifications/3D, Cost
  // Summary) — fetched in the background alongside loadCore rather than
  // blocking it, since none of it is needed for the first-paint General
  // Info tab a card switch lands on.
  const loadExtras = useCallback(async () => {
    setExtrasLoading(true);
    // Reset first so a fast card-to-card click never shows the *previous*
    // item's materials/crew/equipment/layers while the new item's data is
    // still in flight.
    setMaterials([]);
    setCrew([]);
    setEquipment([]);
    setLayers([]);
    setSuppliers([]);
    setAssemblyWorkItems([]);
    setRawLineByResourceId(new Map());
    setLayerMaterialLinks([]);
    setLayerMaterialSummary([]);
    setLayerSpecs([]);
    setPriceHistory({});
    setTrendResourceId("");

    const [matRes, crewRes, equipRes, layerRes, assemblyItemsRes] = await Promise.all([
      listDwlVAssemblyMaterialExplosionByAssemblyId(MATERIAL_COLUMNS, assemblyId),
      listDwlAssemblyCrewByAssemblyId(assemblyId),
      listDwlAssemblyEquipmentByAssemblyId(assemblyId),
      listDwlAssemblyLayersByAssemblyId(assemblyId),
      listDwlAssemblyItemsByAssemblyId(assemblyId, "id, assembly_id, work_item_id, qty_per_unit, basis_note, sort_order"),
    ]);

    const matRows = (matRes.data ?? []) as unknown as DwlAssemblyMaterialExplosionRow[];
    setMaterials(matRows);
    const layerRows = (layerRes.data ?? []) as DwlAssemblyLayer[];
    setLayers(layerRows);
    const layerIds = layerRows.map((l) => l.id);
    setSelectedLayerId((prev) => (layerRows.some((l) => l.id === prev) ? prev : (layerRows[0]?.id ?? "")));
    setVisibleLayerIds(new Set(layerIds));

    const resourceIds = matRows.map((m) => m.resource_id);
    const materialResourceIds = new Set(resourceIds);

    const crewRaw = (crewRes.data ?? []) as { id: string; assembly_id: string; resource_id: string; role_label: string; quantity: number; sort_order: number; description: string | null; benchmark_note?: string | null }[];
    const equipRaw = (equipRes.data ?? []) as typeof crewRaw;
    const laborEquipIds = [...crewRaw.map((c) => c.resource_id), ...equipRaw.map((e) => e.resource_id)];

    const assemblyItemRows = (assemblyItemsRes.data ?? []) as { id: string; assembly_id: string; work_item_id: string; qty_per_unit: number; basis_note: string; sort_order: number }[];
    const workItemIds = Array.from(new Set(assemblyItemRows.map((a) => a.work_item_id)));

    const [priceRes, supRes, workItemsRes, rawLinesRes, layerMatRes, layerMatViewRes, layerSpecRes, priceHistRes] = await Promise.all([
      laborEquipIds.length > 0
        // Same rate the costing summary uses: labour all-in day rate when enabled, else the current price.
        ? listDwlVResourceCostingRatesByResourceIds(laborEquipIds)
        : Promise.resolve({ data: [] as { resource_id: string; code: string; unit_price: number; currency: string }[] }),
      resourceIds.length > 0
        ? listDwlVSupplierMaterialsByResourceIdsWithIsActive(resourceIds)
        : Promise.resolve({ data: [] as DwlSupplierMaterialRow[] }),
      workItemIds.length > 0
        ? listDwlWorkItemsByIds(workItemIds)
        : Promise.resolve({ data: [] as DwlWorkItem[] }),
      workItemIds.length > 0
        ? listDwlWorkItemResourcesByWorkItemIds(workItemIds)
        : Promise.resolve({ data: [] as DwlWorkItemResource[] }),
      layerIds.length > 0
        ? listDwlAssemblyLayerMaterialsByLayerIds(layerIds)
        : Promise.resolve({ data: [] as DwlAssemblyLayerMaterial[] }),
      layerIds.length > 0
        ? listDwlVAssemblyLayerMaterialsByLayerIds(layerIds)
        : Promise.resolve({ data: [] as DwlAssemblyLayerMaterialRow[] }),
      layerIds.length > 0
        ? listDwlAssemblyLayerSpecsByLayerIds(layerIds)
        : Promise.resolve({ data: [] as DwlAssemblyLayerSpec[] }),
      // Only depends on resourceIds (known after wave 1), same as the other
      // queries above — run it alongside them instead of as its own extra
      // sequential round trip after this Promise.all resolves.
      resourceIds.length > 0
        ? listDwlResourcePricesByResourceIds(resourceIds)
        : Promise.resolve({ data: [] as { resource_id: string; unit_price: number; valid_from: string }[] }),
    ]);
    setLayerMaterialLinks((layerMatRes.data ?? []) as DwlAssemblyLayerMaterial[]);
    setLayerMaterialSummary((layerMatViewRes.data ?? []) as unknown as DwlAssemblyLayerMaterialRow[]);
    setLayerSpecs((layerSpecRes.data ?? []) as DwlAssemblyLayerSpec[]);
    const priceByResource = new Map<string, { code: string; unit_price: number; currency: string }>();
    for (const p of (priceRes.data ?? []) as { resource_id: string; code: string; unit_price: number; currency: string }[]) {
      priceByResource.set(p.resource_id, p);
    }
    setCrew(crewRaw.map((c) => ({ ...c, benchmark_note: c.benchmark_note ?? null, resource_code: priceByResource.get(c.resource_id)?.code ?? null, day_rate: priceByResource.get(c.resource_id)?.unit_price ?? null, currency: priceByResource.get(c.resource_id)?.currency ?? null })));
    setEquipment(equipRaw.map((e) => ({ ...e, benchmark_note: null, resource_code: priceByResource.get(e.resource_id)?.code ?? null, day_rate: priceByResource.get(e.resource_id)?.unit_price ?? null, currency: priceByResource.get(e.resource_id)?.currency ?? null })));
    setSuppliers(((supRes.data ?? []) as unknown as DwlSupplierMaterialRow[]));

    const workItemRows = (workItemsRes.data ?? []) as DwlWorkItem[];
    setAssemblyWorkItems(workItemRows);
    setAddMaterialWorkItemId((prev) => (workItemRows.some((w) => w.id === prev) ? prev : (workItemRows[0]?.id ?? "")));
    // Keyed by resource_id — assumes each material appears on at most one
    // linked work item, true for every assembly seeded so far (single work
    // item). If an assembly ever links multiple work items sharing the same
    // material, only the last one wins here.
    const rawMap = new Map<string, DwlWorkItemResource>();
    for (const r of (rawLinesRes.data ?? []) as DwlWorkItemResource[]) {
      if (materialResourceIds.has(r.resource_id)) rawMap.set(r.resource_id, r);
    }
    setRawLineByResourceId(rawMap);

    if (resourceIds.length > 0) {
      const grouped: Record<string, PricePoint[]> = {};
      const first: Record<string, number> = {};
      for (const row of (priceHistRes.data ?? []) as { resource_id: string; unit_price: number; valid_from: string }[]) {
        const t = new Date(row.valid_from).getTime();
        if (!(row.resource_id in first)) first[row.resource_id] = t;
        const days = Math.round((t - first[row.resource_id]) / 86400000);
        (grouped[row.resource_id] ??= []).push({ date: row.valid_from, price: row.unit_price, days });
      }
      setPriceHistory(grouped);
      const topMaterial = [...matRows].sort((a, b) => b.cost_contribution - a.cost_contribution)[0];
      setTrendResourceId(topMaterial?.resource_id ?? "");
    } else {
      setPriceHistory({});
    }

    setExtrasLoading(false);
  }, [assemblyId, supabase]);

  const refreshAll = useCallback(() => {
    void loadCore();
    void loadExtras();
  }, [loadCore, loadExtras]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: profile } = await getProfileById(uid, "company_id");
      if (profile?.company_id) setTenantId(profile.company_id as string);
    })();
  }, [supabase]);

  // ── Installed Cost Calculator — client-side what-if state, reset per item
  const [calcMaterialBase, setCalcMaterialBase] = useState(0);
  const [calcWastePct, setCalcWastePct] = useState(0);
  const [calcLabor, setCalcLabor] = useState(0);
  const [calcEquipment, setCalcEquipment] = useState(0);
  const [calcQty, setCalcQty] = useState(500);

  const resetCalculator = useCallback(() => {
    if (!summary) return;
    setCalcMaterialBase(round2(summary.material_base_cost));
    setCalcWastePct(summary.material_total_cost > 0 && summary.material_base_cost > 0
      ? summary.waste_cost / summary.material_base_cost : 0.05);
    setCalcLabor(round2(summary.labor_cost_per_unit));
    setCalcEquipment(round2(summary.equipment_cost_per_unit));
  }, [summary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetCalculator();
  }, [resetCalculator]);

  const resetSimulator = useCallback(() => {
    setSimHeight(3.0);
    setSimOpeningsMultiplier(1.0);
    const rates: Record<string, number> = {};
    for (const c of crew) rates[c.id] = c.day_rate != null ? round2(c.day_rate) : 0;
    setSimCrewRates(rates);
  }, [crew]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetSimulator();
  }, [resetSimulator]);

  async function handleApplyToItem() {
    const { error } = await updateDwlAssemblyCostingByAssemblyId({
      material_base_cost_override: calcMaterialBase,
      material_waste_pct_override: calcWastePct,
      labor_cost_override_per_unit: calcLabor,
      equipment_cost_override_per_unit: calcEquipment,
      tuned_at: new Date().toISOString(),
    }, assemblyId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tuned values saved to this Cost Item", {
      description: "Material, waste, labor and equipment now use these tuned figures as the stored norms. The underlying BOQ/crew/equipment rows are unchanged — use Revert to Computed to go back to the bottom-up build-up.",
    });
    refreshAll();
    onChanged?.();
  }

  async function handleRevertTuning() {
    if (!confirm("Revert to the bottom-up computed values? The manually tuned figures for this Cost Item will be discarded.")) return;
    const { error } = await updateDwlAssemblyCostingByAssemblyId({
      material_base_cost_override: null,
      material_waste_pct_override: null,
      labor_cost_override_per_unit: null,
      equipment_cost_override_per_unit: null,
      tuned_at: null,
    }, assemblyId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reverted to computed values");
    refreshAll();
    onChanged?.();
  }

  // Material lines live on a linked work item's dwl_work_item_resources, so
  // a standalone item (created with no work item picked) has nothing to
  // attach a material to yet. Rather than blocking "Add Material" behind a
  // separate "link a work item" step, silently create one on first use —
  // same "Direct 1:1 — single work item forms the whole assembly" shape the
  // Create Cost Item form already uses when a work item IS picked there.
  async function ensureLinkedWorkItem(): Promise<DwlWorkItem | null> {
    if (assemblyWorkItems.length > 0) return assemblyWorkItems[0];
    if (!summary || !tenantId) return null;

    const { data: wi, error: wiErr } = await insertDwlWorkItemReturning({
        tenant_id: tenantId,
        code: summary.code,
        boq_section: summary.element_group || "GEN",
        description: summary.description,
        unit: summary.unit,
        created_by: userId,
      });
    if (wiErr || !wi) {
      toast.error(wiErr?.message ?? "Failed to set up this item's Bill of Quantities");
      return null;
    }

    const { error: linkErr } = await insertDwlAssemblyItem({
      tenant_id: tenantId,
      assembly_id: assemblyId,
      work_item_id: wi.id,
      qty_per_unit: 1,
      basis_note: "Direct 1:1 — single work item forms the whole assembly",
      sort_order: 0,
    });
    if (linkErr) {
      toast.error(linkErr.message);
      return null;
    }

    const workItemRow = wi as DwlWorkItem;
    setAssemblyWorkItems([workItemRow]);
    setAddMaterialWorkItemId(workItemRow.id);
    onChanged?.();
    return workItemRow;
  }

  async function handleAddMaterialClick() {
    const wi = addMaterialWorkItem ?? (await ensureLinkedWorkItem());
    if (!wi) return;
    setShowAddMaterial(true);
  }

  async function handleDeleteMaterialLine(m: DwlAssemblyMaterialExplosionRow) {
    const raw = rawLineByResourceId.get(m.resource_id);
    if (!raw) return;
    if (!confirm(`Delete "${m.material_description}" from this Bill of Quantities?`)) return;
    const { error } = await deleteDwlWorkItemResourceById(raw.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Material line deleted");
    refreshAll();
  }

  async function handleDeleteCrewLine(c: DwlAssemblyCrewRow) {
    if (!confirm(`Remove "${c.role_label}" from the crew?`)) return;
    const { error } = await deleteDwlAssemblyCrewById(c.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Crew member removed");
    refreshAll();
  }

  async function handleDeleteEquipmentLine(e: DwlAssemblyEquipmentRow) {
    if (!confirm(`Remove "${e.role_label}" from the equipment list?`)) return;
    const { error } = await deleteDwlAssemblyEquipmentById(e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Equipment item removed");
    refreshAll();
  }

  async function handleDeleteLayer(l: DwlAssemblyLayer) {
    if (!confirm(`Delete the "${l.layer_name}" layer? Its linked materials and specs will also be removed.`)) return;
    const { error } = await deleteDwlAssemblyLayerById(l.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Layer deleted");
    refreshAll();
  }

  const canCreateBoq = can("qs_libraries", "can_create");
  const canEditBoq = can("qs_libraries", "edit");
  const canDeleteBoq = can("qs_libraries", "delete");
  const addMaterialWorkItem = assemblyWorkItems.find((w) => w.id === addMaterialWorkItemId) ?? null;
  const editingMaterialWorkItem = editingMaterialLine
    ? assemblyWorkItems.find((w) => w.id === editingMaterialLine.work_item_id) ?? null
    : null;

  const calcMaterialWithWaste = calcMaterialBase * (1 + calcWastePct);
  const calcWasteAmount = calcMaterialWithWaste - calcMaterialBase;
  const calcTotalInstalled = calcMaterialWithWaste + calcLabor + calcEquipment;
  const calcSafeTotal = calcTotalInstalled || 1;
  const calcMaterialSharePct = calcMaterialBase / calcSafeTotal;
  const calcWasteSharePct = calcWasteAmount / calcSafeTotal;
  const calcMaterialGrossSharePct = calcMaterialWithWaste / calcSafeTotal;
  const calcLaborSharePct = calcLabor / calcSafeTotal;
  const calcEquipmentSharePct = calcEquipment / calcSafeTotal;
  const calcMarkupMultiplier =
    (1 + (summary?.overhead_pct ?? 0)) * (1 + (summary?.risk_pct ?? 0)) * (1 + (summary?.profit_pct ?? 0));
  const calcRecommendedTender = calcTotalInstalled * calcMarkupMultiplier;
  const calcMaterialDescLine = materials.slice(0, 4).map((m) => m.material_description).join(", ");
  const calcLaborDescLine = crew.map((c) => `${c.role_label} (${c.quantity} crew)`).join(", ");
  const calcEquipmentDescLine = equipment.map((e) => e.role_label).join(", ");
  const WASTE_PRESETS = [3, 4, 5, 7.5, 10];

  if (loading) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-destructive/30 p-8 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive/60" />
        <p className="text-xs text-muted-foreground">{errorMsg}</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        This item has no costing data yet.
      </div>
    );
  }

  const headerSafeTotal = summary.direct_installed_cost || 1;
  const boundaryExclusions = specValues(specs, "boundary_exclusion");
  const assumptionsIntro = specs.find((s) => s.section === "estimating_assumption" && s.spec_label === "__intro__")?.spec_value ?? "";
  const estimatingAssumptions = specValues(specs, "estimating_assumption");
  const fieldLessons = specValues(specs, "field_lesson");

  // ── Labour & Productivity — header + Interactive Height Adjuster (client
  // side what-if, mirrors the Calculator tab's stored-vs-simulated split)
  const crewRoleLabels = crew.map((c) => c.role_label).join(" + ") || "—";
  const crewSubtitle = crew.length > 0
    ? `${crew.length}-person installation gang (${crewRoleLabels}) for ${summary.description.split(" — ")[0]}.`
    : "No crew assigned yet.";
  const OPENINGS_PRESETS = [
    { label: "Straight Walls (Few Openings)", value: 1.0 },
    { label: "Moderate Openings", value: 1.15 },
    { label: "Complex / Many Openings", value: 1.3 },
  ];
  const simHeightFactor = simHeight <= 3.5 ? 1.0 : Math.max(0.6, 1 - (simHeight - 3.5) * 0.08);
  const simEffectiveOutput = (summary.daily_output ?? 0) * simHeightFactor / simOpeningsMultiplier;
  const simGangDailyWage = crew.reduce((sum, c) => sum + (simCrewRates[c.id] ?? 0) * c.quantity, 0);
  const simUnitLaborRate = simEffectiveOutput > 0 ? simGangDailyWage / simEffectiveOutput : 0;

  // ── Specifications — Interactive Assembly Cross-Section
  const sortedLayers = [...layers].sort((a, b) => a.sort_order - b.sort_order);
  const visibleLayers = sortedLayers.filter((l) => visibleLayerIds.has(l.id));
  const totalVisibleThickness = visibleLayers.reduce((s, l) => s + l.thickness_mm, 0) || 1;
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null;
  const selectedLayerResourceIds = new Set(layerMaterialLinks.filter((lm) => lm.layer_id === selectedLayerId).map((lm) => lm.resource_id));
  const selectedLayerMaterials = materials.filter((m) => selectedLayerResourceIds.has(m.resource_id));
  const selectedLayerCost = layerMaterialSummary.find((s) => s.layer_id === selectedLayerId)?.total_cost_contribution ?? 0;
  const selectedLayerSpecRows = layerSpecs.filter((s) => s.layer_id === selectedLayerId);
  const editingLayerResourceIds = editingLayer
    ? layerMaterialLinks.filter((lm) => lm.layer_id === editingLayer.id).map((lm) => lm.resource_id)
    : [];
  const editingLayerSpecRows = editingLayer ? layerSpecs.filter((s) => s.layer_id === editingLayer.id) : [];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="bg-emerald-600 text-white">{summary.code}</Badge>
            <Badge variant="secondary">{summary.element_group}</Badge>
            {summary.status && <Badge variant="outline">{summary.status}</Badge>}
          </div>
          <h2 className="mt-1 text-lg font-semibold">{summary.description.split(" — ")[0]}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{summary.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted-foreground">Advanced editors:</span>
            <Link
              href={`/dashboard/qs/dwl-assemblies?q=${encodeURIComponent(summary.code)}`}
              className="text-primary hover:underline"
              title="Build this item from several work items using design ratios"
            >
              Assembly Builder
            </Link>
            <Link
              href={`/dashboard/qs/dwl-work-items?q=${encodeURIComponent(assemblyWorkItems[0]?.code ?? summary.code)}`}
              className="text-primary hover:underline"
              title="Edit the resource recipe of this item's work item"
            >
              Rate Build-Up
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Unit</p>
            <p className="text-sm font-medium">{summary.unit}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Direct Cost</p>
            <p className="font-mono text-sm text-amber-600">{formatMoney(summary.direct_installed_cost)}/{summary.unit}</p>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">
            <p className="text-[10px] uppercase text-emerald-700">Tender Cost</p>
            <p className="font-mono text-sm font-semibold text-emerald-700">{formatMoney(summary.target_tender_rate)}/{summary.unit}</p>
          </div>
        </div>
      </div>

      {/* Persistent header — shown above the tabs on every tab */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Direct Cost Component Weighting</p>
          <span className="font-mono text-xs font-semibold">{formatMoney(summary.direct_installed_cost)}/{summary.unit}</span>
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          <div className="bg-blue-500" style={{ width: `${(summary.material_total_cost / headerSafeTotal) * 100}%` }} title="Material" />
          <div className="bg-amber-500" style={{ width: `${(summary.labor_cost_per_unit / headerSafeTotal) * 100}%` }} title="Labour" />
          <div className="bg-violet-500" style={{ width: `${(summary.equipment_cost_per_unit / headerSafeTotal) * 100}%` }} title="Equipment" />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Material: {formatMoney(summary.material_total_cost)} ({pct(summary.material_total_cost / headerSafeTotal)})</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Labour: {formatMoney(summary.labor_cost_per_unit)} ({pct(summary.labor_cost_per_unit / headerSafeTotal)})</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />Equipment: {formatMoney(summary.equipment_cost_per_unit)} ({pct(summary.equipment_cost_per_unit / headerSafeTotal)})</span>
        </div>
      </div>

      {summary.guardrail_note && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">Smart Estimator Guardrails</p>
            <p className="mt-0.5">{summary.guardrail_note}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            title={t.label}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              tab === t.key
                ? "bg-background text-emerald-700 shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5 shrink-0" /> {t.shortLabel}
          </button>
        ))}
      </div>

      {extrasLoading && tab !== "general" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {TABS.find((t) => t.key === tab)?.shortLabel.toLowerCase()} data…
        </div>
      )}

      {/* Tab content */}
      {tab === "general" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={extrasLoading} onClick={() => setShowEditGeneral(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit General Info
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Core System Scope &amp; Definition</p>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Item Code &amp; Name</dt><dd className="text-right font-medium">{summary.code} — {summary.description.split(" — ")[0]}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discipline &amp; Category</dt><dd>{summary.discipline ? `${summary.discipline} • ` : ""}{summary.element_group}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Work Item Type</dt><dd>{summary.work_item_type ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Measurement Unit</dt><dd>Per 1 {summary.unit}</dd></div>
              </dl>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Commercial Pricing Benchmarks</p>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Base Direct Cost</dt><dd className="font-mono">{formatMoney(summary.direct_installed_cost)}/{summary.unit}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Overheads ({pct(summary.overhead_pct ?? 0)})</dt><dd className="font-mono">{formatMoney(summary.direct_installed_cost * (summary.overhead_pct ?? 0))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Risk + Profit ({pct((summary.risk_pct ?? 0) + (summary.profit_pct ?? 0))})</dt><dd className="font-mono">{formatMoney(summary.target_tender_rate - summary.direct_installed_cost * (1 + (summary.overhead_pct ?? 0)))}</dd></div>
                <div className="flex justify-between border-t border-border pt-1 font-medium"><dt>Target Tender Selling Rate</dt><dd className="font-mono text-emerald-700">{formatMoney(summary.target_tender_rate)}/{summary.unit}</dd></div>
              </dl>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Estimating Boundary &amp; Exclusions</p>
              <p className="mb-1.5 text-[11px] text-muted-foreground">Work items are strictly bounded to avoid double-counting with adjacent trade packages.</p>
              {boundaryExclusions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No exclusions recorded yet.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {boundaryExclusions.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Key Estimating Assumptions</p>
              {assumptionsIntro && <p className="mb-1.5 text-[11px] italic text-muted-foreground">{assumptionsIntro}</p>}
              {estimatingAssumptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No assumptions recorded yet.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {estimatingAssumptions.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="mb-1.5 text-xs font-semibold text-amber-900">Field Lessons &amp; Estimator Memory</p>
              {fieldLessons.length === 0 ? (
                <p className="text-xs text-amber-800/70">No field lessons recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {fieldLessons.map((note, i) => (
                    <div key={i} className="rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-amber-900">{note}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Audit Trail &amp; Specification Governance</p>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Specification Version</dt><dd className="font-medium">{summary.version_label ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Current Status</dt><dd className="font-medium capitalize text-emerald-700">{summary.status ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Registered By</dt><dd>{summary.created_by_name ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Last Review Date</dt><dd>{summary.updated_at ? new Date(summary.updated_at).toISOString().slice(0, 10) : "—"}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {tab === "calculator" && (
        <div className="flex flex-col gap-5">
          {/* Automatic Installed Cost Engine */}
          <div className="rounded-xl border border-emerald-900/40 bg-slate-900 p-4 text-white sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Wallet className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Automatic Installed Cost Engine</p>
              <Badge variant="outline" className="border-slate-600 bg-slate-800 text-slate-300">Linked Assembly</Badge>
            </div>
            <h3 className="mt-2 text-base font-semibold">Total Installed Cost Calculation</h3>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-stretch">
              <div className="flex items-center rounded-lg bg-slate-800/60 p-3 font-mono text-[11px] leading-relaxed text-slate-200 sm:text-xs">
                <span>
                  <span className="text-blue-300">Material ({formatMoney(calcMaterialBase)})</span>
                  {" + "}
                  <span className="text-amber-300">Waste {pct(calcWastePct)} ({formatMoney(calcWasteAmount)})</span>
                  {" + "}
                  <span className="text-emerald-300">Labor ({formatMoney(calcLabor)})</span>
                  {" + "}
                  <span className="text-violet-300">Equipment ({formatMoney(calcEquipment)})</span>
                  {" = "}
                  <span className="font-semibold text-white">{formatMoney(calcTotalInstalled)}/{summary.unit}</span>
                </span>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-4 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wide text-emerald-400">Final Total Installed Cost</p>
                <p className="text-2xl font-bold text-emerald-400 sm:text-3xl">
                  {formatMoney(calcTotalInstalled)}<span className="ml-1 text-sm font-normal text-slate-400">/{summary.unit}</span>
                </p>
                <p className="text-[10px] text-slate-400">Sum of all 3 direct components</p>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Recommended Tender</p>
                <p className="text-lg font-semibold text-white sm:text-xl">
                  {formatMoney(calcRecommendedTender)}<span className="ml-1 text-xs font-normal text-slate-400">/{summary.unit}</span>
                </p>
                <p className="text-[10px] text-slate-400">Incl. {pct(calcMarkupMultiplier - 1)} OH &amp; Profit</p>
              </div>
            </div>
          </div>

          {assemblyWorkItems.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              This is a standalone item with no linked Bill of Quantities, crew, or equipment — its Direct Cost comes from the <strong>Base Direct Cost</strong> field on the General Info tab, not from the tuning cards below. Use <strong>General Info → Edit General Info</strong> to set or change it; the tuning cards here are for items with real BOQ/crew/equipment data.
            </div>
          )}

          {/* Component Weighting Distribution */}
          <div className="rounded-lg border border-border p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
              <p className="text-xs font-semibold text-muted-foreground">Component Weighting Distribution</p>
              <span className="text-[10px] font-medium text-emerald-700">100% Direct Installed Rate</span>
            </div>
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-blue-500" style={{ width: `${calcMaterialSharePct * 100}%` }} title="Base Material" />
              <div className="bg-amber-500" style={{ width: `${calcWasteSharePct * 100}%` }} title="Waste Allowance" />
              <div className="bg-emerald-500" style={{ width: `${calcLaborSharePct * 100}%` }} title="Labor Installation" />
              <div className="bg-violet-500" style={{ width: `${calcEquipmentSharePct * 100}%` }} title="Equipment & Tools" />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Base Material: {formatMoney(calcMaterialBase)} ({pct(calcMaterialSharePct)})</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Waste Allowance: {formatMoney(calcWasteAmount)} ({pct(calcWasteSharePct)})</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Labor Installation: {formatMoney(calcLabor)} ({pct(calcLaborSharePct)})</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />Equipment &amp; Tools: {formatMoney(calcEquipment)} ({pct(calcEquipmentSharePct)})</span>
            </div>
          </div>

          {/* Tuning header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cost Item Components Breakdown &amp; Tuning
                {summary?.is_tuned && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Manually Tuned</Badge>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {summary?.is_tuned
                  ? "This item is using manually tuned norms instead of the bottom-up BOQ/crew/equipment build-up."
                  : "Tune any component to simulate site conditions, supplier quote fluctuations, or productivity variance."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetCalculator}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset Norms
              </Button>
              {summary?.is_tuned && (
                <Button variant="outline" size="sm" onClick={handleRevertTuning}>
                  Revert to Computed
                </Button>
              )}
              {canEditBoq && (
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleApplyToItem}>
                  <Check className="h-3.5 w-3.5" /> Apply to Cost Item
                </Button>
              )}
            </div>
          </div>

          {/* 4 tuning cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                  <Boxes className="h-3.5 w-3.5" /> 1. Material Base
                </div>
                <Badge className="bg-blue-600 text-white">{formatMoney(calcMaterialBase)}</Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{calcMaterialDescLine || "No material components linked yet."}</p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Base Cost / {summary.unit}</span>
                <span className="font-mono font-medium">{formatMoney(calcMaterialBase)}</span>
              </div>
              <input
                type="range" min={0} max={calcMaterialBase * 2 || 10} step={0.01} value={calcMaterialBase}
                onChange={(e) => setCalcMaterialBase(round2(Number(e.target.value)))}
                className="mt-1.5 w-full accent-blue-600"
              />
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                <Input type="number" step="0.01" value={calcMaterialBase} onChange={(e) => setCalcMaterialBase(round2(Number(e.target.value) || 0))} className="h-7 pl-5 text-xs" />
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <Percent className="h-3.5 w-3.5" /> 2. Waste Scrap %
                </div>
                <Badge className="bg-amber-500 text-white">+{formatMoney(calcWasteAmount)}</Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">Cutting loss, transport breakage &amp; corner-fitting allowance.</p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Waste Rate:</span>
                <span className="font-mono font-medium">{pct(calcWastePct)}</span>
              </div>
              <input
                type="range" min={0} max={0.15} step={0.0025} value={calcWastePct}
                onChange={(e) => setCalcWastePct(Number(e.target.value))}
                className="mt-1.5 w-full accent-amber-500"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {WASTE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCalcWastePct(p / 100)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      Math.abs(calcWastePct * 100 - p) < 0.01 ? "border-amber-500 bg-amber-500 text-white" : "border-input text-muted-foreground"
                    )}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                  <HardHat className="h-3.5 w-3.5" /> 3. Labor Install
                </div>
                <Badge className="bg-emerald-600 text-white">{formatMoney(calcLabor)}</Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{calcLaborDescLine || "No crew linked yet."}</p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Labor Cost / {summary.unit}</span>
                <span className="font-mono font-medium">{formatMoney(calcLabor)}</span>
              </div>
              <input
                type="range" min={0} max={calcLabor * 2 || 5} step={0.01} value={calcLabor}
                onChange={(e) => setCalcLabor(round2(Number(e.target.value)))}
                className="mt-1.5 w-full accent-emerald-600"
              />
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                <Input type="number" step="0.01" value={calcLabor} onChange={(e) => setCalcLabor(round2(Number(e.target.value) || 0))} className="h-7 pl-5 text-xs" />
              </div>
            </div>

            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-900">
                  <Wrench className="h-3.5 w-3.5" /> 4. Equipment / Tools
                </div>
                <Badge className="bg-violet-600 text-white">{formatMoney(calcEquipment)}</Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{calcEquipmentDescLine || "No plant linked yet."}</p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Plant Cost / {summary.unit}</span>
                <span className="font-mono font-medium">{formatMoney(calcEquipment)}</span>
              </div>
              <input
                type="range" min={0} max={calcEquipment * 2 || 5} step={0.01} value={calcEquipment}
                onChange={(e) => setCalcEquipment(round2(Number(e.target.value)))}
                className="mt-1.5 w-full accent-violet-600"
              />
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                <Input type="number" step="0.01" value={calcEquipment} onChange={(e) => setCalcEquipment(round2(Number(e.target.value) || 0))} className="h-7 pl-5 text-xs" />
              </div>
            </div>
          </div>

          {/* Build-up summary + Project Takeoff Multiplier */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-border">
              <div className="border-b border-border bg-muted/40 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Item Rate Build-Up Summary (per 1 {summary.unit})</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-muted-foreground">
                    <th className="p-2">Component</th>
                    <th className="p-2 text-right">Base</th>
                    <th className="p-2 text-right">Waste</th>
                    <th className="p-2 text-right">Installed Rate</th>
                    <th className="p-2 text-right">% Share</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:p-2">
                  <tr className="border-t border-border">
                    <td className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />Material Base</td>
                    <td className="text-right font-mono">{formatMoney(calcMaterialBase)}</td>
                    <td className="text-right font-mono text-muted-foreground">—</td>
                    <td className="text-right font-mono font-medium text-blue-700">{formatMoney(calcMaterialBase)}</td>
                    <td className="text-right font-mono">{pct(calcMaterialSharePct)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Waste Allowance</td>
                    <td className="text-right font-mono text-muted-foreground">—</td>
                    <td className="text-right font-mono text-amber-600">+{pct(calcWastePct)}</td>
                    <td className="text-right font-mono font-medium text-amber-600">+{formatMoney(calcWasteAmount)}</td>
                    <td className="text-right font-mono">{pct(calcWasteSharePct)}</td>
                  </tr>
                  <tr className="border-t border-border bg-muted/30 text-muted-foreground">
                    <td className="pl-5">Subtotal: Material Gross (incl. scrap)</td>
                    <td className="text-right font-mono">{formatMoney(calcMaterialBase)} + {formatMoney(calcWasteAmount)}</td>
                    <td />
                    <td className="text-right font-mono font-medium text-foreground">{formatMoney(calcMaterialWithWaste)}</td>
                    <td className="text-right font-mono">{pct(calcMaterialGrossSharePct)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Direct Crew Labor</td>
                    <td className="text-right font-mono">{formatMoney(calcLabor)}</td>
                    <td className="text-right font-mono text-muted-foreground">—</td>
                    <td className="text-right font-mono font-medium text-emerald-700">{formatMoney(calcLabor)}</td>
                    <td className="text-right font-mono">{pct(calcLaborSharePct)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />Equipment &amp; Tools</td>
                    <td className="text-right font-mono">{formatMoney(calcEquipment)}</td>
                    <td className="text-right font-mono text-muted-foreground">—</td>
                    <td className="text-right font-mono font-medium text-violet-700">{formatMoney(calcEquipment)}</td>
                    <td className="text-right font-mono">{pct(calcEquipmentSharePct)}</td>
                  </tr>
                  <tr className="border-t border-border bg-emerald-50 font-semibold text-emerald-700">
                    <td>Total Installed Direct Cost</td>
                    <td colSpan={2} className="text-right text-[10px] font-normal text-emerald-700/80">Material + Waste + Labor + Equipment</td>
                    <td className="text-right font-mono">{formatMoney(calcTotalInstalled)}</td>
                    <td className="text-right font-mono">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project Takeoff Multiplier</p>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Live Procurement Model</Badge>
              </div>
              <p className="mt-3 text-[11px] font-medium text-muted-foreground">Project Work Quantity ({summary.unit}):</p>
              <div className="relative mt-1">
                <Input type="number" min={0} value={calcQty} onChange={(e) => setCalcQty(Number(e.target.value) || 0)} className="pr-10" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{summary.unit}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[100, 250, 500, 1000, 2500, 5000].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setCalcQty(q)}
                    className={cn("rounded-md border px-2.5 py-1 text-[11px] font-medium", calcQty === q ? "border-slate-900 bg-slate-900 text-white" : "border-input")}
                  >
                    {q} {summary.unit}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                  <p className="text-[10px] font-medium uppercase text-blue-700">Material Order (inc. scrap)</p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-blue-900">{formatMoney(calcMaterialWithWaste * calcQty)}</p>
                  <p className="text-[10px] text-blue-700">Incl. {formatMoney(calcWasteAmount * calcQty)} scrap</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                  <p className="text-[10px] font-medium uppercase text-emerald-700">Labor Gang Budget</p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-emerald-900">{formatMoney(calcLabor * calcQty)}</p>
                  <p className="text-[10px] text-emerald-700">Direct trade wages</p>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                  <p className="text-[10px] font-medium uppercase text-violet-700">Equipment &amp; Tools</p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-violet-900">{formatMoney(calcEquipment * calcQty)}</p>
                  <p className="text-[10px] text-violet-700">Staging &amp; rental</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-white">
                  <p className="text-[10px] font-medium uppercase text-slate-300">Total Project Installed</p>
                  <p className="mt-0.5 font-mono text-base font-semibold">{formatMoney(calcTotalInstalled * calcQty)}</p>
                  <p className="text-[10px] text-slate-400">At {formatMoney(calcTotalInstalled)}/{summary.unit}</p>
                </div>
              </div>
              <p className="mt-2.5 text-[10px] text-muted-foreground">Quantity scales automatically with component unit rates.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "boq" && (
        <div className="flex flex-col gap-4">
          {canCreateBoq && !extrasLoading && assemblyWorkItems.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              This item has no Bill of Quantities yet — clicking <strong>Add Material</strong> will set one up automatically.
            </p>
          )}
          {canCreateBoq && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {assemblyWorkItems.length > 1 && (
                <select
                  value={addMaterialWorkItemId}
                  onChange={(e) => setAddMaterialWorkItemId(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
                >
                  {assemblyWorkItems.map((w) => (
                    <option key={w.id} value={w.id}>Add to: {w.code}</option>
                  ))}
                </select>
              )}
              <Button variant="outline" size="sm" onClick={() => void handleAddMaterialClick()} disabled={extrasLoading || !tenantId}>
                <Plus className="h-3.5 w-3.5" /> Add Material
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="p-2">Material</th>
                  <th className="p-2">Unit</th>
                  <th className="p-2 text-right">Consumption</th>
                  <th className="p-2 text-right">Waste %</th>
                  <th className="p-2 text-right">Effective Qty</th>
                  <th className="p-2 text-right">Unit Price</th>
                  <th className="p-2 text-right">Cost Contribution</th>
                  {(canEditBoq || canDeleteBoq) && <th className="p-2" />}
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const raw = rawLineByResourceId.get(m.resource_id);
                  return (
                    <tr key={m.resource_id} className="border-t border-border">
                      <td className="p-2">
                        <div className="font-medium">{m.material_description}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{m.material_code} · {m.basis_note}</div>
                      </td>
                      <td className="p-2">{m.unit}</td>
                      <td className="p-2 text-right font-mono">{m.consumption.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{pct(m.waste_pct)}</td>
                      <td className="p-2 text-right font-mono">{m.effective_qty.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{m.unit_price != null ? formatMoney(m.unit_price, m.currency ?? "USD") : "—"}</td>
                      <td className="p-2 text-right font-mono font-medium">{formatMoney(m.cost_contribution, m.currency ?? "USD")}</td>
                      {(canEditBoq || canDeleteBoq) && (
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-1">
                            {canEditBoq && raw && (
                              <button
                                type="button"
                                onClick={() => setEditingMaterialLine(raw)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                title="Edit line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDeleteBoq && raw && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteMaterialLine(m)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Delete line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td colSpan={6} className="p-2 text-right">Total Material Cost:</td>
                  <td className="p-2 text-right font-mono">{formatMoney(summary.material_total_cost)}/{summary.unit}</td>
                  {(canEditBoq || canDeleteBoq) && <td className="p-2" />}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Approved Material Suppliers</p>
              {suppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No approved suppliers linked yet.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {suppliers.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span>{s.supplier_name}{s.supplier_code ? ` (${s.supplier_code})` : ""}</span>
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Approved</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1.5 text-xs font-semibold text-amber-800">Storage &amp; Handling Protocols</p>
              <ul className="space-y-1.5 text-xs text-amber-800">
                {specs.filter((s) => s.section === "storage_protocol").map((s) => (
                  <li key={s.id}><span className="font-medium">{s.spec_label}:</span> {s.spec_value}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === "labour" && (
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="h-4 w-4 text-muted-foreground" /> Labour Crew Composition &amp; Productivity Analysis
              </p>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{crewSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">Crew: {crewRoleLabels}</Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Direct Labour: {formatMoney(summary.labor_cost_per_unit)}/{summary.unit}
              </Badge>
            </div>
          </div>

          {canCreateBoq && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddCrew(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Crew Member
              </Button>
            </div>
          )}

          {/* Crew cards + stored Daily Crew Productivity */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {crew.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{c.resource_code}</p>
                    <p className="text-sm font-medium">{c.role_label}</p>
                  </div>
                  {(canEditBoq || canDeleteBoq) && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {canEditBoq && (
                        <button type="button" onClick={() => setEditingCrewLine(c)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeleteBoq && (
                        <button type="button" onClick={() => void handleDeleteCrewLine(c)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-1 font-mono text-sm">{c.day_rate != null ? formatMoney(c.day_rate, c.currency ?? "USD") : "—"} <span className="text-xs text-muted-foreground">/day × {c.quantity}</span></p>
                {c.description && <p className="mt-2 text-[11px] text-muted-foreground">{c.description}</p>}
                {c.benchmark_note && <p className="mt-2 border-t border-border pt-1.5 text-[10px] text-muted-foreground">{c.benchmark_note}</p>}
              </div>
            ))}
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase text-emerald-700"><HardHat className="h-3 w-3" /> Daily Crew Productivity</p>
              <p className="text-lg font-semibold text-emerald-700">{summary.daily_output ?? "—"} {summary.unit}/day</p>
              <p className="mt-1 text-xs text-emerald-800">
                Gang Daily Wage: {formatMoney(summary.crew_cost_per_day)}/day<br />
                Unit Labour Rate: {formatMoney(summary.labor_cost_per_unit)}/{summary.unit}
              </p>
              <p className="mt-1.5 border-t border-emerald-200 pt-1 text-[10px] text-emerald-700/80">
                Rate Formula: Crew Cost ({formatMoney(summary.crew_cost_per_day)}) ÷ Daily Output ({summary.daily_output ?? "—"} {summary.unit})
              </p>
            </div>
          </div>

          {/* Interactive Site Productivity & Height Adjuster — client-side what-if, not persisted */}
          <div className="rounded-lg border border-border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" /> Interactive Site Productivity &amp; Height Adjuster
              </p>
              <p className="text-[11px] text-muted-foreground">Simulate real site working height, wall openings, and wage adjustments</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Working Height:</span>
                  <span className="font-mono font-medium">{simHeight.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min={2} max={6} step={0.1} value={simHeight}
                  onChange={(e) => setSimHeight(Number(e.target.value))}
                  className="mt-1.5 w-full accent-emerald-600"
                />
                <p className={cn("mt-1 text-[10px]", simHeight <= 3.5 ? "text-emerald-700" : "text-amber-700")}>
                  {simHeight <= 3.5 ? "✓ Standard floor height (≤3.5m)" : "⚠ Above standard height — verify aerial lift access"}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Openings Complexity:</span>
                  <span className="font-mono font-medium">{simOpeningsMultiplier.toFixed(2)}x</span>
                </div>
                <select
                  value={simOpeningsMultiplier}
                  onChange={(e) => setSimOpeningsMultiplier(Number(e.target.value))}
                  className="mt-1.5 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs"
                >
                  {OPENINGS_PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">Affects cutting and lintel setting time</p>
              </div>
              {crew.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{c.role_label} Daily Rate:</span>
                    <span className="font-mono font-medium">{formatMoney(simCrewRates[c.id] ?? 0)}</span>
                  </div>
                  <Input
                    type="number" step="0.01" value={simCrewRates[c.id] ?? 0}
                    onChange={(e) => setSimCrewRates((prev) => ({ ...prev, [c.id]: round2(Number(e.target.value) || 0) }))}
                    className="mt-1.5 h-8 text-xs"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">{c.description ? c.description.slice(0, 40) + (c.description.length > 40 ? "…" : "") : "Day rate"}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[11px]">
              <span className="font-semibold text-muted-foreground">Simulated:</span>
              <span>Effective Output: <span className="font-mono font-medium">{simEffectiveOutput.toFixed(1)} {summary.unit}/day</span></span>
              <span>Gang Daily Wage: <span className="font-mono font-medium">{formatMoney(simGangDailyWage)}/day</span></span>
              <span>Unit Labour Rate: <span className="font-mono font-medium">{formatMoney(simUnitLaborRate)}/{summary.unit}</span></span>
              <Button variant="outline" size="sm" className="ml-auto h-6 px-2 text-[10px]" onClick={resetSimulator}>
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            </div>
          </div>

          {/* Plant / Tools table */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide">Small Plant, Tools &amp; Scaffolding Allocation</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-slate-600 bg-slate-800 text-[10px] text-slate-200">
                  Total Equipment: {formatMoney(summary.equipment_cost_per_unit)}/{summary.unit}
                </Badge>
                {canCreateBoq && (
                  <Button variant="outline" size="sm" className="h-6 border-slate-600 bg-slate-800 px-2 text-[10px] text-slate-200 hover:bg-slate-700" onClick={() => setShowAddEquipment(true)}>
                    <Plus className="h-3 w-3" /> Add Equipment
                  </Button>
                )}
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="p-2">Plant / Tool Item</th>
                  <th className="p-2">Scope / Specification</th>
                  <th className="p-2 text-right">Unit</th>
                  <th className="p-2 text-right">Daily / Rental Basis</th>
                  <th className="p-2 text-right">Cost Contribution</th>
                  {(canEditBoq || canDeleteBoq) && <th className="p-2" />}
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2 font-medium">{e.role_label}</td>
                    <td className="p-2 text-muted-foreground">{e.description ?? "—"}</td>
                    <td className="p-2 text-right">{summary.unit}</td>
                    <td className="p-2 text-right font-mono">{e.day_rate != null ? `${formatMoney(e.day_rate, e.currency ?? "USD")}/day` : "—"}</td>
                    <td className="p-2 text-right font-mono font-medium">{e.day_rate != null && summary.daily_output ? formatMoney((e.day_rate * e.quantity) / summary.daily_output) : "—"}</td>
                    {(canEditBoq || canDeleteBoq) && (
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-1">
                          {canEditBoq && (
                            <button type="button" onClick={() => setEditingEquipmentLine(e)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDeleteBoq && (
                            <button type="button" onClick={() => void handleDeleteEquipmentLine(e)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td colSpan={4} className="p-2 text-right">Combined Labour &amp; Equipment Rate:</td>
                  <td className="p-2 text-right font-mono">{formatMoney(summary.labor_cost_per_unit + summary.equipment_cost_per_unit)}/{summary.unit}</td>
                  {(canEditBoq || canDeleteBoq) && <td className="p-2" />}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" /> Historical Cambodia Site Productivity Benchmarks
              </p>
              <ul className="space-y-1.5 text-xs">
                {specs.filter((s) => s.section === "productivity_benchmark" && s.spec_label !== "In-House vs Subcontract").map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.spec_label}:</span>
                    <span className="text-right font-mono text-[11px] text-muted-foreground">{s.spec_value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" /> In-House Labour vs Subcontract Supply &amp; Install
              </p>
              {specs.filter((s) => s.spec_label === "In-House vs Subcontract").map((s) => (
                <p key={s.id} className="text-xs text-amber-800">{s.spec_value}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "specifications" && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-slate-800">
            {/* Dark header */}
            <div className="bg-slate-900 p-4 text-white sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-emerald-400" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Interactive Assembly Cross-Section</p>
                    <Badge variant="outline" className="border-slate-600 bg-slate-800 text-[10px] text-slate-300">Code: {summary.code}</Badge>
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold">{summary.description.split(" — ")[0]} — Build-Up &amp; Material Layers Diagram</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Interactive engineering cross-section of layers, specifications, and trade sequences for {summary.element_group}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex overflow-hidden rounded-md border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setLayerViewIs3D(true)}
                      className={cn("px-2.5 py-1.5 text-[11px] font-medium", layerViewIs3D ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700")}
                    >
                      3D
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayerViewIs3D(false)}
                      className={cn("px-2.5 py-1.5 text-[11px] font-medium", !layerViewIs3D ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700")}
                    >
                      2D
                    </button>
                  </div>
                  {([["composite", "Composite Overlay"], ["exploded", "Exploded View"], ["peeling", "Layer Peeling Cutaway"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLayerViewMode(key)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        layerViewMode === key ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground">LAYERS:</span>
                {sortedLayers.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                    <Checkbox
                      checked={visibleLayerIds.has(l.id)}
                      onCheckedChange={() => setVisibleLayerIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                        return next;
                      })}
                    />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color_hex }} />
                    {l.layer_name} ({l.thickness_mm} mm)
                  </label>
                ))}
                {canCreateBoq && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddLayer(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Layer
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Total Thickness: <span className="font-mono font-medium text-foreground">{totalVisibleThickness.toFixed(1)} mm</span></span>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                  Estimated Build Cost: {formatMoney(summary.material_total_cost)}/{summary.unit}
                </Badge>
              </div>
            </div>

            {/* Canvas + inspector */}
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
              <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">X-Ray Opacity</span>
                    <input type="range" min={20} max={100} value={layerOpacity} onChange={(e) => setLayerOpacity(Number(e.target.value))} className="w-28 accent-emerald-600" />
                    <span className="font-mono text-[10px] text-muted-foreground">{layerOpacity}%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Scale: 1:1 Assembly Detail</span>
                </div>

                {visibleLayers.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">No layers to display — check a layer above or add one.</p>
                ) : layerViewIs3D ? (
                  <DwlAssemblyLayerViewer3D
                    layers={visibleLayers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    viewMode={layerViewMode}
                    opacity={layerOpacity}
                    onUnavailable={() => setLayerViewIs3D(false)}
                  />
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {visibleLayers.map((l, i) => (
                        <span key={l.id}>{i + 1}. {l.layer_name} ({l.thickness_mm}mm)</span>
                      ))}
                    </div>
                    <div className="flex justify-center" style={{ height: 150 }}>
                      <div
                        className={cn(
                          "flex h-full",
                          layerViewMode === "peeling" ? "items-end" : "items-stretch",
                          layerViewMode === "composite" ? "gap-0" : "gap-2"
                        )}
                        style={{ width: "60%" }}
                      >
                        {visibleLayers.map((l, i) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setSelectedLayerId(l.id)}
                            className={cn(
                              "flex flex-col items-center justify-start rounded-sm border-2 pt-1 text-[9px] font-medium text-white transition-all",
                              selectedLayerId === l.id ? "border-emerald-400" : "border-transparent"
                            )}
                            style={{
                              flex: l.thickness_mm,
                              minWidth: 28,
                              backgroundColor: l.color_hex,
                              opacity: layerOpacity / 100,
                              height: layerViewMode === "peeling" ? `calc(100% - ${i * 22}px)` : "100%",
                            }}
                            title={`${l.layer_name} — ${l.thickness_mm}mm`}
                          >
                            <span className="rotate-90 whitespace-nowrap">{l.layer_name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>Click on any layer slab or tag to inspect specifications &amp; unit costs.</span>
                  <span>Discipline: {summary.discipline ?? "—"}</span>
                </div>
              </div>

              {/* Inspector panel */}
              <div className="p-4">
                {!selectedLayer ? (
                  <p className="text-xs text-muted-foreground">Select a layer to inspect.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge className="text-white" style={{ backgroundColor: selectedLayer.color_hex }}>
                        {selectedLayer.layer_name.toUpperCase()}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-emerald-700">{formatMoney(selectedLayerCost)}/{summary.unit}</span>
                        {(canEditBoq || canDeleteBoq) && (
                          <div className="flex items-center gap-0.5">
                            {canEditBoq && (
                              <button type="button" onClick={() => setEditingLayer(selectedLayer)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit layer">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDeleteBoq && (
                              <button type="button" onClick={() => void handleDeleteLayer(selectedLayer)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete layer">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {selectedLayer.material_label && <p className="text-[11px] text-muted-foreground">{selectedLayer.material_label}</p>}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border p-2">
                        <p className="text-[9px] uppercase text-muted-foreground">Layer Thickness</p>
                        <p className="font-mono text-sm font-medium">{selectedLayer.thickness_mm} mm</p>
                      </div>
                      <div className="rounded-lg border border-border p-2">
                        <p className="text-[9px] uppercase text-muted-foreground">Linked Materials</p>
                        <p className="font-mono text-sm font-medium">{selectedLayerMaterials.length}</p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        <ListChecks className="h-3 w-3" /> Material Reference
                      </p>
                      {selectedLayerMaterials.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-2 text-[11px] text-muted-foreground">No BOQ material linked to this layer yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {selectedLayerMaterials.map((m) => (
                            <div key={m.resource_id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-medium text-emerald-800">{m.material_code}</span>
                                <span className="font-mono text-emerald-800">{formatMoney(m.cost_contribution, m.currency ?? "USD")}</span>
                              </div>
                              <div className="flex items-center justify-between text-emerald-700">
                                <span className="truncate">{m.material_description}</span>
                                <span className="shrink-0 font-mono">{m.effective_qty.toFixed(2)} {m.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        <Info className="h-3 w-3" /> Technical Specifications
                      </p>
                      {selectedLayerSpecRows.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No technical specs recorded for this layer.</p>
                      ) : (
                        <dl className="space-y-1 text-[11px]">
                          {selectedLayerSpecRows.map((s) => (
                            <div key={s.id} className="flex justify-between gap-2">
                              <dt className="text-muted-foreground">{s.spec_label}:</dt>
                              <dd className="text-right font-medium">{s.spec_value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Select Layer to Inspect</p>
                      <div className="flex flex-wrap gap-1">
                        {sortedLayers.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setSelectedLayerId(l.id)}
                            className={cn(
                              "rounded-md border px-2 py-1 text-[11px] font-medium",
                              l.id === selectedLayerId ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-input text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {l.layer_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Engineering Specifications &amp; Technical Conformance
              </p>
              <p className="text-[10px] text-muted-foreground">Technical performance requirements, fire, acoustic, and manufacturer standards compliance.</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="p-2">Specification Parameter</th>
                  <th className="p-2">Requirement / Standard Conformance</th>
                </tr>
              </thead>
              <tbody>
                {specs.filter((s) => s.section === "specification").map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-2 font-medium">{s.spec_label}</td>
                    <td className="p-2 text-muted-foreground">{s.spec_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "cost_summary" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase text-slate-400">Target Tender Selling Rate</p>
                <p className="text-2xl font-semibold text-emerald-400">{formatMoney(summary.target_tender_rate)} <span className="text-sm font-normal text-slate-400">/{summary.unit}</span></p>
              </div>
              <p className="text-xs text-slate-400">Direct {formatMoney(summary.direct_installed_cost)} + Markup {pct((summary.overhead_pct ?? 0) + (summary.risk_pct ?? 0) + (summary.profit_pct ?? 0))}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="p-2">Rate Build-Up Line</th>
                  <th className="p-2 text-right">Basis</th>
                  <th className="p-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="[&_td]:p-2">
                <tr className="border-t border-border"><td>Direct Materials (incl. waste)</td><td className="text-right text-muted-foreground">Effective qty × price</td><td className="text-right font-mono">{formatMoney(summary.material_total_cost)}</td></tr>
                <tr className="border-t border-border"><td>Direct Labor</td><td className="text-right text-muted-foreground">Gang cost/day ÷ daily output</td><td className="text-right font-mono">{formatMoney(summary.labor_cost_per_unit)}</td></tr>
                <tr className="border-t border-border"><td>Small Plant &amp; Scaffolding</td><td className="text-right text-muted-foreground">Plant cost/day ÷ daily output</td><td className="text-right font-mono">{formatMoney(summary.equipment_cost_per_unit)}</td></tr>
                <tr className="border-t border-border font-medium"><td>Base Direct Cost</td><td /><td className="text-right font-mono">{formatMoney(summary.direct_installed_cost)}</td></tr>
                <tr className="border-t border-border"><td>Site &amp; Company Overheads</td><td className="text-right text-muted-foreground">{pct(summary.overhead_pct ?? 0)}</td><td className="text-right font-mono">{formatMoney(summary.direct_installed_cost * (summary.overhead_pct ?? 0))}</td></tr>
                <tr className="border-t border-border"><td>Risk Contingency</td><td className="text-right text-muted-foreground">{pct(summary.risk_pct ?? 0)}</td><td className="text-right font-mono">{formatMoney(summary.direct_installed_cost * (1 + (summary.overhead_pct ?? 0)) * (summary.risk_pct ?? 0))}</td></tr>
                <tr className="border-t border-border"><td>Profit</td><td className="text-right text-muted-foreground">{pct(summary.profit_pct ?? 0)}</td><td className="text-right font-mono">{formatMoney(summary.direct_installed_cost * (1 + (summary.overhead_pct ?? 0)) * (1 + (summary.risk_pct ?? 0)) * (summary.profit_pct ?? 0))}</td></tr>
                <tr className="border-t border-border bg-emerald-50 font-semibold text-emerald-700"><td>Target Tender Selling Rate</td><td /><td className="text-right font-mono">{formatMoney(summary.target_tender_rate)}</td></tr>
              </tbody>
            </table>
          </div>

          <PriceTrendChart
            materials={materials}
            priceHistory={priceHistory}
            trendResourceId={trendResourceId}
            onSelect={setTrendResourceId}
          />
        </div>
      )}

      <DwlCostItemGeneralEditDialog
        open={showEditGeneral}
        onOpenChange={setShowEditGeneral}
        tenantId={tenantId}
        userId={userId}
        assemblyId={assemblyId}
        elementGroup={summary.element_group}
        summary={summary}
        specs={specs}
        isStandalone={assemblyWorkItems.length === 0}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />

      <DwlRecipeLineFormDialog
        open={showAddMaterial}
        onOpenChange={setShowAddMaterial}
        tenantId={tenantId}
        workItem={addMaterialWorkItem}
        editingLine={null}
        nextSortOrder={materials.length + 1}
        resourceCategory="material"
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />

      <DwlRecipeLineFormDialog
        open={editingMaterialLine !== null}
        onOpenChange={(open) => { if (!open) setEditingMaterialLine(null); }}
        tenantId={tenantId}
        workItem={editingMaterialWorkItem}
        editingLine={editingMaterialLine}
        nextSortOrder={materials.length + 1}
        resourceCategory="material"
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />

      <DwlAssemblyResourceLineFormDialog
        open={showAddCrew}
        onOpenChange={setShowAddCrew}
        tenantId={tenantId}
        assemblyId={assemblyId}
        kind="crew"
        editingLine={null}
        nextSortOrder={crew.length + 1}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />
      <DwlAssemblyResourceLineFormDialog
        open={editingCrewLine !== null}
        onOpenChange={(open) => { if (!open) setEditingCrewLine(null); }}
        tenantId={tenantId}
        assemblyId={assemblyId}
        kind="crew"
        editingLine={editingCrewLine}
        nextSortOrder={crew.length + 1}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />

      <DwlAssemblyResourceLineFormDialog
        open={showAddEquipment}
        onOpenChange={setShowAddEquipment}
        tenantId={tenantId}
        assemblyId={assemblyId}
        kind="equipment"
        editingLine={null}
        nextSortOrder={equipment.length + 1}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />
      <DwlAssemblyResourceLineFormDialog
        open={editingEquipmentLine !== null}
        onOpenChange={(open) => { if (!open) setEditingEquipmentLine(null); }}
        tenantId={tenantId}
        assemblyId={assemblyId}
        kind="equipment"
        editingLine={editingEquipmentLine}
        nextSortOrder={equipment.length + 1}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />

      <DwlAssemblyLayerFormDialog
        open={showAddLayer}
        onOpenChange={setShowAddLayer}
        tenantId={tenantId}
        assemblyId={assemblyId}
        editingLayer={null}
        nextSortOrder={layers.length + 1}
        materials={materials}
        linkedResourceIds={[]}
        layerSpecs={[]}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />
      <DwlAssemblyLayerFormDialog
        open={editingLayer !== null}
        onOpenChange={(open) => { if (!open) setEditingLayer(null); }}
        tenantId={tenantId}
        assemblyId={assemblyId}
        editingLayer={editingLayer}
        nextSortOrder={layers.length + 1}
        materials={materials}
        linkedResourceIds={editingLayerResourceIds}
        layerSpecs={editingLayerSpecRows}
        onSaved={() => { refreshAll(); onChanged?.(); }}
      />
    </div>
  );
}

function PriceTrendChart({
  materials, priceHistory, trendResourceId, onSelect,
}: {
  materials: DwlAssemblyMaterialExplosionRow[];
  priceHistory: Record<string, PricePoint[]>;
  trendResourceId: string;
  onSelect: (id: string) => void;
}) {
  const points = priceHistory[trendResourceId] ?? [];
  const material = materials.find((m) => m.resource_id === trendResourceId);
  const regression = linearRegression(points.map((p) => ({ x: p.days, y: p.price })));

  const chartData = points.map((p) => ({ date: p.date, price: p.price }));
  if (regression && points.length >= 2) {
    const lastDay = points[points.length - 1].days;
    for (const monthsAhead of [3, 6, 12]) {
      const days = lastDay + monthsAhead * 30;
      const forecast = regression.slope * days + regression.intercept;
      chartData.push({ date: `+${monthsAhead}mo`, price: Math.max(0, forecast) });
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Historical Material Price Trend {regression && "+ Forecast (linear regression)"}</p>
        <select value={trendResourceId} onChange={(e) => onSelect(e.target.value)} className="h-7 rounded-lg border border-input bg-transparent px-2 text-xs">
          {materials.map((m) => <option key={m.resource_id} value={m.resource_id}>{m.material_code}</option>)}
        </select>
      </div>
      <ChartWrapper
        loading={false}
        empty={points.length < 2}
        emptyMessage="Only one price point recorded — not enough history to plot a trend yet."
        height={220}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={70}
              tickFormatter={(v: number) => formatMoney(v, material?.currency ?? "USD")} />
            <Tooltip formatter={(val) => [formatMoney(Number(val), material?.currency ?? "USD"), "Unit price"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  );
}
