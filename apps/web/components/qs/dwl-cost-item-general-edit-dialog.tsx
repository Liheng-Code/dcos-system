"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { deleteDwlAssemblySpecsByAssemblyIdAndSection, insertDwlAssemblySpecs, updateDwlAssemblyById, upsertDwlAssemblyCosting } from "@/lib/qs/qs-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DWL_DISCIPLINES,
  type DwlAssemblyCostingSummaryRow,
  type DwlAssemblySpec,
  type DwlAssemblySpecSection,
} from "@/components/qs/dwl-types";

const TEXTAREA_CLASS =
  "w-full min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 border-b-2 border-emerald-200 pb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
      {children}
    </p>
  );
}

const NUMERIC_RE = /^\d*\.?\d*$/;

const generalInfoFormSchema = z.object({
  discipline: z.string(),
  element_group: z.string().trim().min(1, "Category is required"),
  work_item_type: z.string().trim(),
  guardrail_note: z.string().trim(),
  version_label: z.string().trim(),
  status: z.enum(["active", "draft", "archived"]),
  assumptions_intro: z.string().trim(),
  manual_direct_cost: z.string().trim().regex(NUMERIC_RE, "Enter a number").optional().or(z.literal("")),
});

type GeneralInfoFormValues = z.infer<typeof generalInfoFormSchema>;

interface DwlCostItemGeneralEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  assemblyId: string;
  elementGroup: string;
  summary: DwlAssemblyCostingSummaryRow | null;
  specs: DwlAssemblySpec[];
  isStandalone: boolean;
  onSaved: () => void;
}

function specValues(specs: DwlAssemblySpec[], section: DwlAssemblySpecSection) {
  return specs
    .filter((s) => s.section === section && s.spec_label !== "__intro__")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.spec_value);
}

export function EditableList({
  label, hint, rows, onChange, emphasize,
}: {
  label: string;
  hint?: string;
  rows: string[];
  onChange: (rows: string[]) => void;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={emphasize ? "text-xs font-bold uppercase tracking-wide text-emerald-700" : undefined}>
          {label}
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, ""])}>
          <Plus className="h-3 w-3" /> Add line
        </Button>
      </div>
      {emphasize && <div className="border-b-2 border-emerald-200" />}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No lines yet — click &quot;Add line&quot;.</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={row}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? e.target.value : r)))}
                placeholder="Enter text…"
                className="text-xs"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove line"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DwlCostItemGeneralEditDialog({
  open, onOpenChange, tenantId, userId, assemblyId, elementGroup, summary, specs, isStandalone, onSaved,
}: DwlCostItemGeneralEditDialogProps) {

  const [exclusions, setExclusions] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GeneralInfoFormValues>({
    resolver: zodResolver(generalInfoFormSchema),
    defaultValues: {
      discipline: "", element_group: "", work_item_type: "", guardrail_note: "",
      version_label: "v1.0", status: "active", assumptions_intro: "", manual_direct_cost: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      discipline: summary?.discipline ?? "",
      element_group: elementGroup ?? "",
      work_item_type: summary?.work_item_type ?? "",
      guardrail_note: summary?.guardrail_note ?? "",
      version_label: summary?.version_label ?? "v1.0",
      status: (summary?.status as GeneralInfoFormValues["status"]) ?? "active",
      assumptions_intro: specs.find((s) => s.section === "estimating_assumption" && s.spec_label === "__intro__")?.spec_value ?? "",
      manual_direct_cost: summary?.manual_direct_cost_per_unit != null ? String(summary.manual_direct_cost_per_unit) : "",
    });
    setExclusions(specValues(specs, "boundary_exclusion"));
    setAssumptions(specValues(specs, "estimating_assumption"));
    setLessons(specValues(specs, "field_lesson"));
  }, [open, summary, specs, elementGroup, reset]);

  async function replaceSection(section: DwlAssemblySpecSection, rows: string[], introText?: string) {
    const cleaned = rows.map((r) => r.trim()).filter(Boolean);
    const { error: delErr } = await deleteDwlAssemblySpecsByAssemblyIdAndSection(assemblyId, section);
    if (delErr) throw delErr;

    const inserts: { tenant_id: string; assembly_id: string; section: string; sort_order: number; spec_label: string; spec_value: string }[] = [];
    if (introText?.trim()) {
      inserts.push({ tenant_id: tenantId, assembly_id: assemblyId, section, sort_order: 0, spec_label: "__intro__", spec_value: introText.trim() });
    }
    cleaned.forEach((text, i) => {
      inserts.push({ tenant_id: tenantId, assembly_id: assemblyId, section, sort_order: i + 1, spec_label: "", spec_value: text });
    });
    if (inserts.length > 0) {
      const { error: insErr } = await insertDwlAssemblySpecs(inserts);
      if (insErr) throw insErr;
    }
  }

  async function onSubmit(values: GeneralInfoFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save General Info");
      return;
    }

    const { error: costErr } = await upsertDwlAssemblyCosting({
          assembly_id: assemblyId,
          tenant_id: tenantId,
          discipline: values.discipline || null,
          work_item_type: values.work_item_type.trim() || null,
          guardrail_note: values.guardrail_note.trim() || null,
          version_label: values.version_label.trim() || null,
          status: values.status,
          manual_direct_cost_per_unit: isStandalone ? Number(values.manual_direct_cost) || 0 : null,
          created_by: summary?.created_by ?? userId,
        });
    if (costErr) {
      toast.error(costErr.message);
      return;
    }

    if (values.element_group.trim() && values.element_group.trim() !== elementGroup) {
      const { error: catErr } = await updateDwlAssemblyById({ element_group: values.element_group.trim() }, assemblyId);
      if (catErr) {
        toast.error(catErr.message);
        return;
      }
    }

    try {
      await replaceSection("boundary_exclusion", exclusions);
      await replaceSection("estimating_assumption", assumptions, values.assumptions_intro);
      await replaceSection("field_lesson", lessons);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the boundary/assumption/lesson lists");
      return;
    }

    toast.success("General Info updated");
    onSaved();
    onOpenChange(false);
  }

  const status = watch("status");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit General Info</DialogTitle>
          <DialogDescription>
            Core scope, boundary/exclusions, estimating assumptions and field lessons for this cost item.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <SectionHeading>Core System Scope &amp; Definition</SectionHeading>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="discipline">Discipline</Label>
                <select
                  id="discipline"
                  {...register("discipline")}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="">— None —</option>
                  {DWL_DISCIPLINES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="element_group">Category</Label>
                <Input id="element_group" placeholder="e.g. Ceiling" {...register("element_group")} />
                {errors.element_group && <p className="text-xs text-destructive">{errors.element_group.message}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="work_item_type">Work Item Type</Label>
                <Input id="work_item_type" placeholder="e.g. Interior Ceiling Fitout" {...register("work_item_type")} />
              </div>
            </div>
          </div>

          {isStandalone && (
            <div>
              <SectionHeading>Standalone Pricing</SectionHeading>
              <div className="space-y-1">
                <Label htmlFor="manual_direct_cost">Base Direct Cost ({"$"} / {summary?.unit ?? "unit"})</Label>
                <Input id="manual_direct_cost" inputMode="decimal" placeholder="e.g. 85.00" {...register("manual_direct_cost")} />
                {errors.manual_direct_cost && <p className="text-xs text-destructive">{errors.manual_direct_cost.message}</p>}
                <p className="text-[11px] text-muted-foreground">
                  This item has no linked Bill of Quantities, crew, or equipment, so its Direct Cost is set manually here rather than computed bottom-up.
                </p>
              </div>
            </div>
          )}

          <div>
            <SectionHeading>Smart Estimator Guardrail Note</SectionHeading>
            <textarea
              className={TEXTAREA_CLASS}
              placeholder="e.g. Selected assembly excludes decorative painting and plenum insulation..."
              {...register("guardrail_note")}
            />
          </div>

          <EditableList
            label="Estimating Boundary &amp; Exclusions"
            hint="Work items strictly bounded to avoid double-counting with adjacent trade packages."
            rows={exclusions}
            onChange={setExclusions}
            emphasize
          />

          <div>
            <SectionHeading>Key Estimating Assumptions</SectionHeading>
            <div className="space-y-1.5">
              <Label htmlFor="assumptions_intro">Intro</Label>
              <Input
                id="assumptions_intro"
                placeholder="e.g. Baseline assumptions derived from Cambodia construction site conditions."
                {...register("assumptions_intro")}
              />
            </div>
            <div className="mt-3">
              <EditableList label="Bullets" rows={assumptions} onChange={setAssumptions} />
            </div>
          </div>

          <EditableList
            label="Field Lessons &amp; Estimator Memory"
            hint="Each line renders as its own note box."
            rows={lessons}
            onChange={setLessons}
            emphasize
          />

          <div>
            <SectionHeading>Audit Trail &amp; Specification Governance</SectionHeading>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="version_label">Specification Version</Label>
                <Input id="version_label" placeholder="e.g. v1.2" {...register("version_label")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="status">Current Status</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setValue("status", e.target.value as GeneralInfoFormValues["status"], { shouldValidate: true })}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Registered By and Last Review Date are tracked automatically and shown on the General Info tab.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save General Info
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
