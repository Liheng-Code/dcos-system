"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Blocks, Loader2, Search, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EditableList } from "@/components/qs/dwl-cost-item-general-edit-dialog";
import {
  DWL_DISCIPLINES,
  DWL_UNITS,
  type DwlMaterialCategory,
  type DwlUnit,
  type DwlWorkItem,
} from "@/components/qs/dwl-types";

const TEXTAREA_CLASS =
  "w-full min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Locked coding standard for assemblies (SOP §6 D2): ASM-{GROUP}-{NNN}.
// GROUP is derived from the selected Category (falling back to Discipline)
// — same derivation idiom as the Material Master form's groupCodeFor(),
// kept local here since assemblies and materials use independent group
// vocabularies (an assembly's group is its own short code, not tied to
// Material Master's MAT- group segments).
const CODE_PATTERN = /^ASM-[A-Z]{2,8}-\d{3}$/;
const DISCIPLINE_GROUP: Record<string, string> = {
  Architectural: "ARC",
  Structural: "STR",
  Civil: "CIV",
  MEP: "MEP",
  Interior: "INT",
  Landscape: "LND",
  Specialist: "SPC",
  "Façade": "FAC",
  "Fire & Life Safety": "FLS",
  Acoustic: "ACU",
};
function groupCodeFor(categoryCode: string | null | undefined, discipline: string | undefined): string {
  if (categoryCode) {
    const seg = categoryCode.split("-")[1];
    if (seg) return seg.toUpperCase();
  }
  return (discipline && DISCIPLINE_GROUP[discipline]) || "GEN";
}

const PCT_RE = /^\d*\.?\d*$/;
const pctField = () => z.string().trim().regex(PCT_RE, "Enter a number").optional().or(z.literal(""));

const createFormSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "Item Code is required").regex(CODE_PATTERN, "Code must match ASM-GROUP-NNN, e.g. ASM-CEIL-002"),
  status: z.enum(["active", "draft", "archived"]),
  name: z.string().trim().min(1, "Cost Item Name is required"),
  short_description: z.string().trim(),
  category_id: z.string().min(1, "Category is required"),
  discipline: z.string(),
  unit: z.enum(DWL_UNITS, { message: "Unit of Measure is required" }),
  scope_of_works: z.string().trim(),
  manual_direct_cost: pctField(),
  project_overhead_pct: pctField(),
  company_overhead_pct: pctField(),
  risk_pct: pctField(),
  profit_pct: pctField(),
  vat_pct: pctField(),
  thickness: z.string().trim(),
  material_core: z.string().trim(),
  manufacturer: z.string().trim(),
  standard: z.string().trim(),
  fire_rating: z.string().trim(),
  acoustic_rating: z.string().trim(),
  moisture_resistance: z.string().trim(),
  surface_finish: z.string().trim(),
  installation_method: z.string().trim(),
  compliance_notes: z.string().trim(),
  estimator_guidance: z.string().trim(),
});

type CreateFormValues = z.infer<typeof createFormSchema>;

const DEFAULT_VALUES: CreateFormValues = {
  code: "", status: "active", name: "", short_description: "", category_id: "", discipline: "",
  unit: "m2", scope_of_works: "", manual_direct_cost: "", project_overhead_pct: "5",
  company_overhead_pct: "5", risk_pct: "2", profit_pct: "10", vat_pct: "10",
  thickness: "", material_core: "", manufacturer: "", standard: "", fire_rating: "",
  acoustic_rating: "", moisture_resistance: "", surface_finish: "", installation_method: "",
  compliance_notes: "", estimator_guidance: "",
};

interface Template {
  label: string;
  categoryCode: string | null;
  values: Partial<CreateFormValues>;
}

const TEMPLATES: Template[] = [
  {
    label: "Acoustic Ceiling",
    categoryCode: "CAT-CEIL",
    values: {
      name: "Acoustic Mineral Fiber Ceiling Tile 600x600",
      short_description: "Suspended acoustic ceiling with exposed T-grid.",
      discipline: "Architectural", unit: "m2",
      thickness: "15mm tile + 38mm suspension grid",
      acoustic_rating: "NRC 0.70 / CAC 35 dB",
    },
  },
  {
    label: "Drywall Partition",
    categoryCode: null,
    values: {
      name: "Gypsum Board Partition Wall 100mm Stud",
      short_description: "Single-layer gypsum board partition on galvanized steel studs.",
      discipline: "Architectural", unit: "m2",
      thickness: "12.5mm board + 75mm stud + 12.5mm board",
      fire_rating: "1-Hour Fire Rated (BS 476 Part 22)",
    },
  },
  {
    label: "Structural Concrete",
    categoryCode: null,
    values: {
      name: "Reinforced Concrete Column Grade C30/37",
      short_description: "Cast in-situ reinforced concrete, formwork and curing included.",
      discipline: "Structural", unit: "m3",
      material_core: "Grade C30/37",
      standard: "ASTM C39 / BS EN 12390",
    },
  },
  {
    label: "Ceramic Tiles",
    categoryCode: "CAT-TILE",
    values: {
      name: "Ceramic Floor Tile 600x600 Adhesive Fixed",
      short_description: "Ceramic tile flooring, thin-bed adhesive fixed with grout joints.",
      discipline: "Architectural", unit: "m2",
      moisture_resistance: "Water absorption < 3%",
      surface_finish: "Rectified edge, grouted joint",
    },
  },
];

interface DwlCostItemCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onCreated: (newAssemblyId: string) => void;
}

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function DwlCostItemCreateDialog({
  open, onOpenChange, tenantId, userId, onCreated,
}: DwlCostItemCreateDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"general" | "commercial" | "specs" | "knowledge">("general");
  const [categories, setCategories] = useState<DwlMaterialCategory[]>([]);
  const [workItems, setWorkItems] = useState<DwlWorkItem[]>([]);
  const [workItemSearch, setWorkItemSearch] = useState("");
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string>("");
  const [suggesting, setSuggesting] = useState(false);

  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [inclusions, setInclusions] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);

  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createFormSchema), defaultValues: DEFAULT_VALUES });

  useEffect(() => {
    if (!open) return;
    setTab("general");
    reset(DEFAULT_VALUES);
    setSelectedWorkItemId("");
    setWorkItemSearch("");
    setAssumptions([]);
    setInclusions([]);
    setExclusions([]);
    supabase.from("dwl_material_categories").select(
      "id, group_name, name, code, specific_element, discipline, cost_code_prefix, color_tag, description, sort_order, is_active, created_at, updated_at"
    ).eq("is_active", true).order("sort_order").then(({ data, error }) => {
      if (!error && data) setCategories(data as DwlMaterialCategory[]);
    });
    supabase.from("dwl_work_items").select(
      "id, tenant_id, code, boq_section, description, unit, method_note, is_active, created_by, created_at, updated_at"
    ).eq("is_active", true).order("code").then(({ data, error }) => {
      if (!error && data) setWorkItems(data as DwlWorkItem[]);
    });
  }, [open, reset, supabase]);

  const filteredWorkItems = useMemo(() => {
    if (!workItemSearch.trim()) return workItems.slice(0, 50);
    const q = workItemSearch.trim().toLowerCase();
    return workItems.filter((w) => w.code.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)).slice(0, 50);
  }, [workItems, workItemSearch]);

  const categoryId = watch("category_id");
  const discipline = watch("discipline");
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const selectedWorkItem = workItems.find((w) => w.id === selectedWorkItemId) ?? null;
  const isStandalone = !selectedWorkItemId;

  function applyTemplate(t: Template) {
    reset({ ...DEFAULT_VALUES, ...t.values });
    setSelectedWorkItemId("");
    setWorkItemSearch("");
    if (t.categoryCode) {
      const cat = categories.find((c) => c.code === t.categoryCode);
      if (cat) setValue("category_id", cat.id);
    }
    toast.success(`"${t.label}" starter values applied — everything is still editable.`);
  }

  async function suggestCode() {
    setSuggesting(true);
    const grp = groupCodeFor(selectedCategory?.code, discipline);
    const { data, error } = await supabase.from("dwl_assemblies").select("code").ilike("code", `ASM-${grp}-%`);
    setSuggesting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    let max = 0;
    for (const row of (data ?? []) as { code: string }[]) {
      const seq = row.code.match(/-(\d{3})$/);
      if (seq) max = Math.max(max, parseInt(seq[1], 10));
    }
    setValue("code", `ASM-${grp}-${String(max + 1).padStart(3, "0")}`, { shouldValidate: true });
  }

  // Live preview (Commercial & Rates tab) — mirrors the Installed Cost
  // Calculator tab's stored-vs-simulated split: when linked to a work
  // item, the real Direct Cost only exists after saving (it's the BOQ's
  // own computation), so the preview shows the typed manual figure only
  // for the standalone path and a placeholder note otherwise.
  const manualCost = Number(watch("manual_direct_cost")) || 0;
  const projectOh = (Number(watch("project_overhead_pct")) || 0) / 100;
  const companyOh = (Number(watch("company_overhead_pct")) || 0) / 100;
  const riskPct = (Number(watch("risk_pct")) || 0) / 100;
  const profitPct = (Number(watch("profit_pct")) || 0) / 100;
  const vatPct = (Number(watch("vat_pct")) || 0) / 100;
  const overheadPct = projectOh + companyOh;
  const previewDirect = isStandalone ? manualCost : 0;
  const previewWithMarkup = previewDirect * (1 + overheadPct) * (1 + riskPct) * (1 + profitPct);
  const previewTender = previewWithMarkup * (1 + vatPct);
  const markupPct = overheadPct + riskPct + profitPct;

  async function onSubmit(values: CreateFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot register a cost item");
      return;
    }

    const unitLabel: DwlUnit = values.unit;
    const description = values.short_description.trim()
      ? `${values.name.trim()} — ${values.short_description.trim()}`
      : values.name.trim();

    const { data: assemblyRow, error: asmErr } = await supabase
      .from("dwl_assemblies")
      .insert({
        tenant_id: tenantId,
        code: values.code.trim().toUpperCase(),
        element_group: selectedCategory?.name ?? (values.discipline || "General"),
        description,
        unit: unitLabel,
        measurement_rule: "Net area/quantity as measured, per selected unit",
        created_by: userId,
      })
      .select("id")
      .single();
    if (asmErr || !assemblyRow) {
      if (asmErr?.code === "23505" || /unique/i.test(asmErr?.message ?? "")) {
        toast.error("A cost item with this code already exists");
      } else {
        toast.error(asmErr?.message ?? "Failed to create the cost item");
      }
      return;
    }
    const assemblyId = assemblyRow.id as string;

    const { error: costErr } = await supabase.from("dwl_assembly_costing").upsert(
      {
        assembly_id: assemblyId,
        tenant_id: tenantId,
        category_id: values.category_id || null,
        discipline: values.discipline || null,
        status: values.status,
        overhead_pct: overheadPct,
        risk_pct: riskPct,
        profit_pct: profitPct,
        vat_pct: vatPct,
        manual_direct_cost_per_unit: isStandalone ? manualCost : null,
        scope_of_works: values.scope_of_works.trim() || null,
        created_by: userId,
      },
      { onConflict: "assembly_id" }
    );
    if (costErr) {
      toast.error(costErr.message);
      return;
    }

    if (selectedWorkItem) {
      const { error: linkErr } = await supabase.from("dwl_assembly_items").insert({
        tenant_id: tenantId,
        assembly_id: assemblyId,
        work_item_id: selectedWorkItem.id,
        qty_per_unit: 1,
        basis_note: "Direct 1:1 — single work item forms the whole assembly",
        sort_order: 0,
      });
      if (linkErr) {
        toast.error(`Cost item created, but linking the work item failed: ${linkErr.message}`);
      }
    }

    const specRows: { tenant_id: string; assembly_id: string; section: string; sort_order: number; spec_label: string; spec_value: string }[] = [];
    const fixedSpecs: [string, string][] = [
      ["Thickness / Dimensions", values.thickness],
      ["Material Core / Grade", values.material_core],
      ["Manufacturer / Brand Reference", values.manufacturer],
      ["Applicable Standard", values.standard],
      ["Fire Rating", values.fire_rating],
      ["Acoustic Rating (NRC / STC / CAC)", values.acoustic_rating],
      ["Moisture Resistance", values.moisture_resistance],
      ["Surface Finish & Jointing", values.surface_finish],
      ["Installation Method & Fixings", values.installation_method],
      ["Specification & Compliance Notes", values.compliance_notes],
    ];
    fixedSpecs.forEach(([label, value], i) => {
      if (value.trim()) specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "specification", sort_order: i + 1, spec_label: label, spec_value: value.trim() });
    });
    assumptions.map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
      specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "estimating_assumption", sort_order: i + 1, spec_label: "", spec_value: s });
    });
    inclusions.map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
      specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "inclusion", sort_order: i + 1, spec_label: "", spec_value: s });
    });
    exclusions.map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
      specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "boundary_exclusion", sort_order: i + 1, spec_label: "", spec_value: s });
    });
    values.estimator_guidance.split("\n").map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
      specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "field_lesson", sort_order: i + 1, spec_label: "", spec_value: s });
    });

    if (specRows.length > 0) {
      const { error: specErr } = await supabase.from("dwl_assembly_specs").insert(specRows);
      if (specErr) toast.error(`Cost item created, but saving some detail rows failed: ${specErr.message}`);
    }

    toast.success(`Cost item ${values.code.trim().toUpperCase()} registered`);
    onCreated(assemblyId);
    onOpenChange(false);
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "general", label: "1. General & Classification" },
    { key: "commercial", label: "2. Commercial & Rates" },
    { key: "specs", label: "3. Technical Specs" },
    { key: "knowledge", label: "4. Knowledge & Rules" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
        <div className="rounded-t-lg bg-slate-900 p-4 text-white">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20">
                <Blocks className="h-4.5 w-4.5 text-emerald-400" />
              </div>
              <DialogTitle className="flex items-center gap-2 text-white">
                Create New Cost Item
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Rate Master</span>
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-400">
              Define work breakdown item with technical specifications, markups, and transparent rate build-up.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Sparkles className="h-3 w-3" /> Fast Setup Templates:</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => applyTemplate(t)}
              className="rounded-md border border-input px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "border-b-2 px-2.5 py-1.5 text-xs font-medium",
                tab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
          {tab === "general" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="code">Item Code *</Label>
                    <button type="button" onClick={() => void suggestCode()} disabled={suggesting} className="flex items-center gap-1 text-[11px] text-emerald-700 hover:underline disabled:opacity-50">
                      <Sparkles className="h-3 w-3" /> {suggesting ? "Generating…" : "Auto-generate"}
                    </button>
                  </div>
                  <Input id="code" placeholder="e.g., ARC-CEIL-002" {...register("code")} />
                  {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                  <p className="text-[10px] text-muted-foreground">Format: ASM-GROUP-NNN, e.g. ASM-CEIL-002</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="status">Status</Label>
                  <select id="status" {...register("status")} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                    <option value="active">Active (Available for Estimates &amp; Tenders)</option>
                    <option value="draft">Draft (Not yet available)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="name">Cost Item Name *</Label>
                <Input id="name" placeholder="e.g., Suspended Mineral Fiber Ceiling Tile 600x600 with Exposed T-Grid" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="short_description">Short Specification Description</Label>
                <Input id="short_description" placeholder="Concise 1-line item specification for Bill of Quantities (BOQ)" {...register("short_description")} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="category_id">Category *</Label>
                  <select
                    id="category_id"
                    {...register("category_id")}
                    onChange={(e) => {
                      setValue("category_id", e.target.value, { shouldValidate: true });
                      const cat = categories.find((c) => c.id === e.target.value);
                      if (cat?.discipline && !discipline) setValue("discipline", cat.discipline);
                    }}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">— Select —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ""}{c.name}</option>
                    ))}
                  </select>
                  {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="discipline">Discipline</Label>
                  <select id="discipline" {...register("discipline")} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                    <option value="">— None —</option>
                    {DWL_DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="unit">Unit of Measure *</Label>
                  <select id="unit" {...register("unit")} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                    {DWL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Blocks className="h-3.5 w-3.5 text-emerald-600" /> Link to Construction Assembly (Optional)</Label>
                {selectedWorkItem ? (
                  <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                    <span><span className="font-mono text-xs font-medium">{selectedWorkItem.code}</span> {selectedWorkItem.description}</span>
                    <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setSelectedWorkItemId("")}>Change</button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input value={workItemSearch} onChange={(e) => setWorkItemSearch(e.target.value)} placeholder="None (Standalone Standard Rate) — or search work items to link…" className="pl-8" />
                    </div>
                    {workItemSearch.trim() && (
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-input">
                        {filteredWorkItems.length === 0 ? (
                          <p className="p-3 text-center text-xs text-muted-foreground">No matching work items</p>
                        ) : (
                          filteredWorkItems.map((w) => (
                            <button key={w.id} type="button" onClick={() => { setSelectedWorkItemId(w.id); setWorkItemSearch(""); }} className="flex w-full items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-left text-xs last:border-0 hover:bg-accent">
                              <span className="font-mono font-medium">{w.code}</span>
                              <span className="truncate text-muted-foreground">{w.description}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Linking a work item will automatically calculate material, labor, and equipment components for this cost item from its Bill of Quantities. Leave blank for a standalone rate you price directly.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="scope_of_works">Detailed Scope of Works &amp; Work Method</Label>
                <textarea id="scope_of_works" className={TEXTAREA_CLASS} placeholder="Comprehensive work description including installation method, accessories, preparation, and finish standards…" {...register("scope_of_works")} />
              </div>
            </div>
          )}

          {tab === "commercial" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-emerald-900/40 bg-slate-900 p-4 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Unit Rate Calculation Preview</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold">{formatMoney(previewWithMarkup)} <span className="text-sm font-normal text-slate-400">/{watch("unit")}</span></p>
                    <p className="text-[11px] text-slate-400">
                      Direct Cost: {formatMoney(previewDirect)} + Total Markups: +{(markupPct * 100).toFixed(1)}% ({formatMoney(previewWithMarkup - previewDirect)})
                    </p>
                    {!isStandalone && (
                      <p className="mt-1 text-[10px] text-amber-300">Linked to a work item — the real Direct Cost is calculated from its BOQ after saving, not the figure above.</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-right">
                    <p className="text-[9px] uppercase text-slate-400">Tender Rate + Tax ({(vatPct * 100).toFixed(0)}%)</p>
                    <p className="text-lg font-semibold text-emerald-400">{formatMoney(previewTender)} <span className="text-xs font-normal text-slate-400">/{watch("unit")}</span></p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="manual_direct_cost">Base Direct Cost ({"$"} / {watch("unit")}) {isStandalone && "*"}</Label>
                  <Input id="manual_direct_cost" inputMode="decimal" disabled={!isStandalone} placeholder="12.50" {...register("manual_direct_cost")} />
                  {!isStandalone && <p className="text-[10px] text-muted-foreground">Disabled — calculated from the linked work item&apos;s BOQ.</p>}
                  {errors.manual_direct_cost && <p className="text-xs text-destructive">{errors.manual_direct_cost.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="project_overhead_pct">Project Overhead (%)</Label>
                  <Input id="project_overhead_pct" inputMode="decimal" {...register("project_overhead_pct")} />
                  <p className="text-[10px] text-muted-foreground">Site supervision, welfare &amp; temp facilities</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company_overhead_pct">Company Overhead (%)</Label>
                  <Input id="company_overhead_pct" inputMode="decimal" {...register("company_overhead_pct")} />
                  <p className="text-[10px] text-muted-foreground">Head office, administrative &amp; legal</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="risk_pct">Risk &amp; Escalation (%)</Label>
                  <Input id="risk_pct" inputMode="decimal" {...register("risk_pct")} />
                  <p className="text-[10px] text-muted-foreground">Market volatility &amp; site complexity</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profit_pct">Contractor Profit (%)</Label>
                  <Input id="profit_pct" inputMode="decimal" {...register("profit_pct")} />
                  <p className="text-[10px] text-muted-foreground">Target net profit margin</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vat_pct">Applicable Tax / VAT (%)</Label>
                  <Input id="vat_pct" inputMode="decimal" {...register("vat_pct")} />
                  <p className="text-[10px] text-muted-foreground">Standard statutory VAT rate</p>
                </div>
              </div>
            </div>
          )}

          {tab === "specs" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ["thickness", "Thickness / Dimensions", "e.g., 12.5mm Board + 38mm Suspension Grid"],
                ["material_core", "Material Core / Grade", "e.g., Paper-faced gypsum plasterboard or Grade C30/37"],
                ["manufacturer", "Manufacturer / Brand Reference", "e.g., Saint-Gobain Gyproc / Knauf / Armstrong"],
                ["standard", "Applicable Standard", "e.g., ASTM C1396 / BS EN 520 / ASTM C635"],
                ["fire_rating", "Fire Rating", "e.g., 1-Hour Fire Rated (BS 476 Part 22) / Class A"],
                ["acoustic_rating", "Acoustic Rating (NRC / STC / CAC)", "e.g., NRC 0.70 / CAC 35 dB / STC 48 dB"],
                ["moisture_resistance", "Moisture Resistance", "e.g., RH 90% humidity resistance / Water absorption < 2%"],
                ["surface_finish", "Surface Finish & Jointing", "e.g., Level 4 tape and feathered joint finish"],
              ].map(([field, label, placeholder]) => (
                <div key={field} className="space-y-1">
                  <Label htmlFor={field}>{label}</Label>
                  <Input id={field} placeholder={placeholder} {...register(field as keyof CreateFormValues)} />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="installation_method">Installation Method &amp; Fixings</Label>
                <textarea id="installation_method" className={TEXTAREA_CLASS} placeholder="e.g., Suspended galvanized steel wire @ 1200mm centers with perimeter trim clips…" {...register("installation_method")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="compliance_notes">Specification &amp; Compliance Notes</Label>
                <textarea id="compliance_notes" className={TEXTAREA_CLASS} placeholder="e.g., All hanger drops greater than 1.5m must include diagonal sway bracing." {...register("compliance_notes")} />
              </div>
            </div>
          )}

          {tab === "knowledge" && (
            <div className="flex flex-col gap-4">
              <EditableList label="Key Estimating Assumptions" hint="Standard working conditions this rate assumes." rows={assumptions} onChange={setAssumptions} emphasize />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <EditableList label="Inclusions in Unit Rate" rows={inclusions} onChange={setInclusions} />
                <EditableList label="Exclusions from Unit Rate" rows={exclusions} onChange={setExclusions} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="estimator_guidance">Estimator Guidance &amp; Historical Lessons</Label>
                <p className="text-[11px] text-muted-foreground">One lesson per line — each renders as its own note box on the item&apos;s General Info tab.</p>
                <textarea id="estimator_guidance" className={TEXTAREA_CLASS} placeholder="e.g., Verify drop ceiling plenum depth for ductwork clearance before finalizing hanger rod schedule." {...register("estimator_guidance")} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-[11px] text-muted-foreground">Fill in required fields (*) to register cost item</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save &amp; Register Cost Item
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
