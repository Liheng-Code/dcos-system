"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Loader2, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { DwlMaterialCategoryDialog } from "@/components/qs/dwl-material-category-dialog";
import {
  DWL_DISCIPLINES,
  DWL_MATERIAL_LIFECYCLE,
  DWL_UNITS,
  type DwlMaterialCategory,
  type DwlMaterialPhoto,
  type DwlMaterialRow,
  type DwlUnit,
} from "@/components/qs/dwl-types";

// Material Master coding standard — standardized 2026-09-15 (QS Manager
// decision, supersedes the original SOP §6 D2 "M-GRP3-NNN" lock for
// materials only; see migration 20260910000030_dwl_material_code_
// standardize.sql): MAT- prefix, group segment derived from the selected
// Category (falling back to Discipline when no Category is set), 3-digit
// sequence — e.g. MAT-CEIL-001. Group segment is auto-computed by
// suggestCodeFor() below, kept in sync with the DB-side derivation used by
// the standardization migration.
const MATERIAL_CODE_PATTERN = /^MAT-[A-Z]{2,6}-\d{3}$/;

// Keep in sync with the discipline -> group fallback in
// 20260910000030_dwl_material_code_standardize.sql.
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

const materialFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Material code is required")
    .regex(MATERIAL_CODE_PATTERN, "Code must match M-GRP-NNN, e.g. M-CLG-001"),
  unit: z.enum(DWL_UNITS, { message: "Standard unit is required" }),
  material_name: z.string().trim().min(3, "Material name is required"),
  category_id: z.string().optional(),
  application_element: z.string().trim().optional(),
  discipline: z.enum(DWL_DISCIPLINES, { message: "Discipline is required" }),
  standard: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  budget_code_id: z.string().optional(),
  lifecycle_status: z.enum(DWL_MATERIAL_LIFECYCLE, { message: "Status is required" }),
  tech_spec_summary: z.string().trim().optional(),
  application_scope: z.string().trim().optional(),
});

type MaterialFormValues = z.infer<typeof materialFormSchema>;

interface BudgetCodeOption {
  id: string;
  code: string;
  description: string;
}

interface PendingPhoto {
  key: string;
  file: File;
  previewUrl: string;
}

interface ExistingPhoto extends DwlMaterialPhoto {
  url: string | null;
}

interface DwlMaterialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onSaved: () => void;
  editRow?: DwlMaterialRow | null;
}

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const TEXTAREA_CLASS =
  "w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function DwlMaterialFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  onSaved,
  editRow,
}: DwlMaterialFormDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = editRow !== null && editRow !== undefined;

  const [categories, setCategories] = useState<DwlMaterialCategory[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCodeOption[]>([]);
  const [elementOptions, setElementOptions] = useState<string[]>([]);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: {
      code: "",
      unit: "m2",
      material_name: "",
      category_id: "",
      application_element: "",
      discipline: "Architectural",
      standard: "",
      grade: "",
      budget_code_id: "",
      lifecycle_status: "active",
      tech_spec_summary: "",
      application_scope: "",
    },
  });

  const loadLookups = useMemo(
    () => async () => {
      const [catRes, bcRes, elRes] = await Promise.all([
        supabase
          .from("dwl_material_categories")
          .select("id, group_name, name, code, sort_order, is_active, created_at, updated_at")
          .eq("is_active", true)
          .order("sort_order")
          .order("name"),
        supabase.from("budget_codes").select("id, code, description").eq("is_active", true).order("code"),
        supabase.from("qs_element_library").select("sub_element").eq("is_active", true),
      ]);
      setCategories((catRes.data ?? []) as DwlMaterialCategory[]);
      setBudgetCodes((bcRes.data ?? []) as BudgetCodeOption[]);
      const els = new Set<string>();
      for (const row of (elRes.data ?? []) as { sub_element: string }[]) {
        if (row.sub_element) els.add(row.sub_element);
      }
      setElementOptions(Array.from(els).sort());
    },
    [supabase]
  );

  async function loadPhotos(resourceId: string) {
    setPhotosLoading(true);
    const { data, error } = await supabase
      .from("dwl_material_photos")
      .select("id, tenant_id, resource_id, storage_path, caption, created_by, created_at")
      .eq("resource_id", resourceId)
      .order("created_at");
    if (error) {
      toast.error(`Failed to load photos: ${error.message}`);
      setPhotosLoading(false);
      return;
    }
    const rows = (data ?? []) as DwlMaterialPhoto[];
    const withUrls = await Promise.all(
      rows.map(async (p) => {
        const { data: signed } = await supabase.storage.from("material-photos").createSignedUrl(p.storage_path, 3600);
        return { ...p, url: signed?.signedUrl ?? null };
      })
    );
    setExistingPhotos(withUrls);
    setPhotosLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    for (const p of pendingPhotos) URL.revokeObjectURL(p.previewUrl);
    setPendingPhotos([]);
    setExistingPhotos([]);

    void (async () => {
      await loadLookups();

      if (editRow) {
        reset({
          code: editRow.code,
          unit: editRow.unit as DwlUnit,
          material_name: editRow.material_name,
          category_id: editRow.category_id ?? "",
          application_element: editRow.application_element ?? "",
          discipline: (editRow.discipline as (typeof DWL_DISCIPLINES)[number]) ?? "Architectural",
          standard: editRow.standard ?? "",
          grade: editRow.grade ?? "",
          budget_code_id: editRow.budget_code_id ?? "",
          lifecycle_status: editRow.lifecycle_status ?? "active",
          tech_spec_summary: editRow.tech_spec_summary ?? "",
          application_scope: editRow.application_scope ?? "",
        });
        void loadPhotos(editRow.resource_id);
      } else {
        reset({
          code: "MAT-",
          unit: "m2",
          material_name: "",
          category_id: "",
          application_element: "",
          discipline: "Architectural",
          standard: "",
          grade: "",
          budget_code_id: "",
          lifecycle_status: "active",
          tech_spec_summary: "",
          application_scope: "",
        });
        void suggestCodeFor("", "Architectural");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRow, reset]);

  async function suggestCodeFor(categoryId: string, discipline: string) {
    const cat = categories.find((c) => c.id === categoryId);
    const grp = groupCodeFor(cat?.code, discipline);
    setSuggesting(true);
    const { data, error } = await supabase
      .from("dwl_resources")
      .select("code")
      .eq("category", "material")
      .ilike("code", `MAT-${grp}-%`);
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
    const next = String(max + 1).padStart(3, "0");
    setValue("code", `MAT-${grp}-${next}`, { shouldValidate: true });
  }

  function suggestNextCode() {
    return suggestCodeFor(watch("category_id") || "", watch("discipline"));
  }

  function handlePhotoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions: PendingPhoto[] = Array.from(files).map((file) => ({
      key: `${Date.now()}_${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    if (isEdit && editRow) {
      void uploadPhotosNow(editRow.resource_id, additions);
    } else {
      setPendingPhotos((prev) => [...prev, ...additions]);
    }
  }

  async function uploadPhotosNow(resourceId: string, files: PendingPhoto[]) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot upload photos");
      return;
    }
    setPhotosLoading(true);
    for (const p of files) {
      const safeName = p.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/${resourceId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("material-photos").upload(path, p.file);
      if (upErr) {
        toast.error(`Photo upload failed: ${upErr.message}`);
        continue;
      }
      const { error: insErr } = await supabase.from("dwl_material_photos").insert({
        tenant_id: tenantId,
        resource_id: resourceId,
        storage_path: path,
        created_by: userId,
      });
      if (insErr) toast.error(`Photo record failed: ${insErr.message}`);
      URL.revokeObjectURL(p.previewUrl);
    }
    await loadPhotos(resourceId);
  }

  function removePendingPhoto(key: string) {
    setPendingPhotos((prev) => {
      const found = prev.find((p) => p.key === key);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function removeExistingPhoto(photo: ExistingPhoto) {
    const { error: rmErr } = await supabase.storage.from("material-photos").remove([photo.storage_path]);
    if (rmErr) {
      toast.error(rmErr.message);
      return;
    }
    const { error: delErr } = await supabase.from("dwl_material_photos").delete().eq("id", photo.id);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  }

  async function onSubmit(values: MaterialFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a material");
      return;
    }

    const codeUpper = values.code.trim().toUpperCase();
    const isActive = values.lifecycle_status === "active";
    const description = [values.material_name.trim(), values.grade?.trim() || null]
      .filter(Boolean)
      .join(" — ");

    const attributesPayload = {
      material_name: values.material_name.trim(),
      category_id: values.category_id || null,
      application_element: values.application_element?.trim() || null,
      discipline: values.discipline,
      standard: values.standard?.trim() || null,
      grade: values.grade?.trim() || null,
      budget_code_id: values.budget_code_id || null,
      lifecycle_status: values.lifecycle_status,
      tech_spec_summary: values.tech_spec_summary?.trim() || null,
      application_scope: values.application_scope?.trim() || null,
    };

    if (isEdit && editRow) {
      const { error: resErr } = await supabase
        .from("dwl_resources")
        .update({
          unit: values.unit,
          description,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editRow.resource_id);
      if (resErr) {
        toast.error(resErr.message);
        return;
      }
      const { error: attrErr } = await supabase
        .from("dwl_material_attributes")
        .update({ ...attributesPayload, updated_by: userId, updated_at: new Date().toISOString() })
        .eq("resource_id", editRow.resource_id);
      if (attrErr) {
        toast.error(attrErr.message);
        return;
      }
      toast.success(`Material ${editRow.code} updated`);
      onSaved();
      onOpenChange(false);
      return;
    }

    const { data: resource, error: resErr } = await supabase
      .from("dwl_resources")
      .insert({
        tenant_id: tenantId,
        category: "material",
        code: codeUpper,
        description,
        unit: values.unit,
        is_active: isActive,
        created_by: userId,
      })
      .select("id")
      .single();
    if (resErr || !resource) {
      if (resErr && (resErr.code === "23505" || /unique/i.test(resErr.message))) {
        setError("code", { message: "A material with this code already exists" });
      } else {
        toast.error(resErr?.message ?? "Failed to create material");
      }
      return;
    }

    const resourceId = resource.id as string;
    const { error: attrErr } = await supabase.from("dwl_material_attributes").insert({
      resource_id: resourceId,
      tenant_id: tenantId,
      ...attributesPayload,
      created_by: userId,
    });
    if (attrErr) {
      // Two-step spine+companion insert — never leave an orphaned dwl_resources row.
      await supabase.from("dwl_resources").delete().eq("id", resourceId);
      toast.error(attrErr.message);
      return;
    }

    if (pendingPhotos.length > 0) {
      await uploadPhotosNow(resourceId, pendingPhotos);
      setPendingPhotos([]);
    }

    toast.success(`Material ${codeUpper} created`);
    onSaved();
    onOpenChange(false);
  }

  const photosCount = existingPhotos.length + pendingPhotos.length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Material Record" : "Create New Material Record"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update this material's specification, classification and verification photos."
                : "Add a new material to the Material Master catalog with its classification, cost code and verification photos."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="code">Material Code *</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="code"
                    placeholder="MAT-CEIL-001"
                    {...register("code")}
                    disabled={isEdit}
                    onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
                  />
                  {!isEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void suggestNextCode()} disabled={suggesting} title="Suggest next code">
                      {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="unit">Standard Unit *</Label>
                <select id="unit" {...register("unit")} className={SELECT_CLASS}>
                  {DWL_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="material_name">Material Name *</Label>
              <Input id="material_name" placeholder="e.g. Ready Mix Concrete C35/45 Self-Compacting" {...register("material_name")} />
              {errors.material_name && <p className="text-xs text-destructive">{errors.material_name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category_id">Category</Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-violet-600 hover:underline"
                    onClick={() => setShowCategoryDialog(true)}
                  >
                    + Manage / New
                  </button>
                </div>
                <select
                  id="category_id"
                  {...register("category_id")}
                  className={SELECT_CLASS}
                  onChange={(e) => {
                    setValue("category_id", e.target.value);
                    if (!isEdit) void suggestCodeFor(e.target.value, watch("discipline"));
                  }}
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="application_element">Specific Element</Label>
                <Input
                  id="application_element"
                  list="dwl-material-element-options"
                  placeholder="e.g. Ceiling — Suspended Grid"
                  {...register("application_element")}
                />
                <datalist id="dwl-material-element-options">
                  {elementOptions.map((el) => <option key={el} value={el} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="discipline">Discipline</Label>
                <select
                  id="discipline"
                  {...register("discipline")}
                  className={SELECT_CLASS}
                  onChange={(e) => {
                    const next = e.target.value as (typeof DWL_DISCIPLINES)[number];
                    setValue("discipline", next, { shouldValidate: true });
                    if (!isEdit) void suggestCodeFor(watch("category_id") || "", next);
                  }}
                >
                  {DWL_DISCIPLINES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="standard">Standard (EN/BS/ASTM)</Label>
                <Input id="standard" placeholder="e.g. EN 13964" {...register("standard")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="grade">Grade/Strength</Label>
                <Input id="grade" placeholder="e.g. C30/37 or Grade 60 (420 MPa)" {...register("grade")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="budget_code_id">Cost Code</Label>
                <select id="budget_code_id" {...register("budget_code_id")} className={SELECT_CLASS}>
                  <option value="">— None —</option>
                  {budgetCodes.map((bc) => (
                    <option key={bc.id} value={bc.id}>{bc.code} — {bc.description}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="lifecycle_status">Status</Label>
              <select id="lifecycle_status" {...register("lifecycle_status")} className={SELECT_CLASS}>
                {DWL_MATERIAL_LIFECYCLE.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tech_spec_summary">Technical Specification Requirements</Label>
              <textarea
                id="tech_spec_summary"
                className={TEXTAREA_CLASS}
                placeholder="Minimum slump, aggregate size, w/c ratio, yield strength..."
                {...register("tech_spec_summary")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="application_scope">Application Scope</Label>
              <textarea
                id="application_scope"
                className={TEXTAREA_CLASS}
                placeholder="e.g. Structural Beams, Columns, Raft Foundations"
                {...register("application_scope")}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Material Photos &amp; Verification {photosCount > 0 && `(${photosCount})`}</Label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent">
                  <Camera className="h-3.5 w-3.5" /> Take Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => { handlePhotoFiles(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>

              {photosLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading photos…
                </div>
              ) : photosCount === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No photos attached. Use &quot;Take Photo&quot; to capture with device camera or upload image.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {existingPhotos.map((p) => (
                    <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                      {p.url && <img src={p.url} alt={p.caption ?? "Material photo"} className="h-full w-full object-cover" />}
                      <button
                        type="button"
                        onClick={() => void removeExistingPhoto(p)}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 shadow group-hover:opacity-100"
                        title="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {pendingPhotos.map((p) => (
                    <div key={p.key} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                      <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePendingPhoto(p.key)}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 shadow group-hover:opacity-100"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEdit ? "Update Material Record" : "Save Material Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DwlMaterialCategoryDialog
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        onChanged={() => void loadLookups()}
      />
    </>
  );
}
