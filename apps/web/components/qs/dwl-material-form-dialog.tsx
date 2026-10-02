"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Camera, Loader2, Lock, X } from "lucide-react";
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
import { deleteDwlMaterialPhotoById, dwlCreateMaterial, dwlFindMaterialMatches, insertDwlMaterialPhoto, listBudgetCodesWithIsActive, listDwlMaterialCategoriesWithIsActiveOrderedBySortOrderAndName, listDwlMaterialPhotosByResourceId, listQsElementLibraryWithIsActive, updateDwlMaterialAttributesByResourceId, updateDwlResourceById } from "@/lib/qs/qs-queries";

// Material codes (MAT-<GROUP>-NNN) are allocated by the database on create
// (dwl_create_material / dwl_next_material_code, migration 20261002000002):
// never typed, never reused, immutable. An exact spec match is refused and a
// near match is warned about here, so the same material is not coded twice.
interface MaterialMatch {
  resource_id: string;
  code: string;
  material_name: string;
  match_level: "exact" | "near";
}

const materialFormSchema = z.object({
  code: z.string().optional(),
  unit: z.enum(DWL_UNITS, { message: "Standard unit is required" }),
  material_name: z.string().trim().min(3, "Material name is required"),
  category_id: z.string().optional(),
  application_element: z.string().trim().optional(),
  discipline: z.enum(DWL_DISCIPLINES, { message: "Discipline is required" }),
  standard: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  material_type: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  dimension: z.string().trim().optional(),
  thickness: z.string().trim().optional(),
  density: z.string().trim().optional(),
  compressive_strength: z.string().trim().optional(),
  color_finish: z.string().trim().optional(),
  effective_date: z.string().optional(),
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
  const [matches, setMatches] = useState<MaterialMatch[]>([]);
  const [confirmDifferent, setConfirmDifferent] = useState(false);

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
      material_type: "",
      brand: "",
      manufacturer: "",
      dimension: "",
      thickness: "",
      density: "",
      compressive_strength: "",
      color_finish: "",
      effective_date: "",
      budget_code_id: "",
      lifecycle_status: "active",
      tech_spec_summary: "",
      application_scope: "",
    },
  });

  const loadLookups = useMemo(
    () => async () => {
      const [catRes, bcRes, elRes] = await Promise.all([
        listDwlMaterialCategoriesWithIsActiveOrderedBySortOrderAndName(),
        listBudgetCodesWithIsActive(),
        listQsElementLibraryWithIsActive(),
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
    const { data, error } = await listDwlMaterialPhotosByResourceId(resourceId);
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
          material_type: editRow.material_type ?? "",
          brand: editRow.brand ?? "",
          manufacturer: editRow.manufacturer ?? "",
          dimension: editRow.dimension ?? "",
          thickness: editRow.thickness ?? "",
          density: editRow.density ?? "",
          compressive_strength: editRow.compressive_strength ?? "",
          color_finish: editRow.color_finish ?? "",
          effective_date: editRow.effective_date ?? "",
          budget_code_id: editRow.budget_code_id ?? "",
          lifecycle_status: editRow.lifecycle_status ?? "active",
          tech_spec_summary: editRow.tech_spec_summary ?? "",
          application_scope: editRow.application_scope ?? "",
        });
        void loadPhotos(editRow.resource_id);
      } else {
        reset({
          code: "",
          unit: "m2",
          material_name: "",
          category_id: "",
          application_element: "",
          discipline: "Architectural",
          standard: "",
          grade: "",
          material_type: "",
          brand: "",
          manufacturer: "",
          dimension: "",
          thickness: "",
          density: "",
          compressive_strength: "",
          color_finish: "",
          effective_date: "",
          budget_code_id: "",
          lifecycle_status: "active",
          tech_spec_summary: "",
          application_scope: "",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRow, reset]);

  // Live duplicate check (create only): same spec => exact match (blocked on
  // save); similar name in the same category => near match (needs a tick).
  const [wCat, wName, wType, wDim, wThick, wGrade, wStrength, wStd, wUnit] = watch([
    "category_id", "material_name", "material_type", "dimension", "thickness",
    "grade", "compressive_strength", "standard", "unit",
  ]);
  useEffect(() => {
    if (!open || isEdit || !wCat || (wName ?? "").trim().length < 3) {
      setMatches([]);
      return;
    }
    const handle = setTimeout(() => {
      void (async () => {
        const { data } = await dwlFindMaterialMatches({
          p_category_id: wCat,
          p_type: wType || null,
          p_dimension: wDim || null,
          p_thickness: wThick || null,
          p_grade: wGrade || null,
          p_strength: wStrength || null,
          p_standard: wStd || null,
          p_unit: wUnit,
          p_name: wName,
        });
        setMatches((data ?? []) as MaterialMatch[]);
        setConfirmDifferent(false);
      })();
    }, 400);
    return () => clearTimeout(handle);
  }, [open, isEdit, wCat, wName, wType, wDim, wThick, wGrade, wStrength, wStd, wUnit]);

  const exactMatch = matches.find((m) => m.match_level === "exact");
  const nearMatches = matches.filter((m) => m.match_level === "near");

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
      const { error: insErr } = await insertDwlMaterialPhoto({
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
    const { error: delErr } = await deleteDwlMaterialPhotoById(photo.id);
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
      material_type: values.material_type?.trim() || null,
      brand: values.brand?.trim() || null,
      manufacturer: values.manufacturer?.trim() || null,
      dimension: values.dimension?.trim() || null,
      thickness: values.thickness?.trim() || null,
      density: values.density?.trim() || null,
      compressive_strength: values.compressive_strength?.trim() || null,
      color_finish: values.color_finish?.trim() || null,
      effective_date: values.effective_date || null,
      budget_code_id: values.budget_code_id || null,
      lifecycle_status: values.lifecycle_status,
      tech_spec_summary: values.tech_spec_summary?.trim() || null,
      application_scope: values.application_scope?.trim() || null,
    };

    if (isEdit && editRow) {
      const { error: resErr } = await updateDwlResourceById({
          unit: values.unit,
          description,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }, editRow.resource_id);
      if (resErr) {
        toast.error(resErr.message);
        return;
      }
      const { error: attrErr } = await updateDwlMaterialAttributesByResourceId({ ...attributesPayload, updated_by: userId, updated_at: new Date().toISOString() }, editRow.resource_id);
      if (attrErr) {
        toast.error(attrErr.message);
        return;
      }
      toast.success(`Material ${editRow.code} updated`);
      onSaved();
      onOpenChange(false);
      return;
    }

    if (!values.category_id) {
      setError("category_id", { message: "Category is required to generate the material code" });
      return;
    }
    if (exactMatch) {
      toast.error(`Already exists as ${exactMatch.code} — add a supplier or price to it instead`);
      return;
    }
    if (nearMatches.length > 0 && !confirmDifferent) {
      toast.error("Similar materials exist — confirm this is a different material");
      return;
    }

    const { data: created, error: createErr } = await dwlCreateMaterial({
      ...attributesPayload,
      description,
      unit: values.unit,
    });
    if (createErr || !created) {
      if (createErr && /DUPLICATE_MATERIAL/.test(createErr.message)) {
        toast.error(createErr.message.replace(/^.*DUPLICATE_MATERIAL: /, "Already exists as "));
      } else {
        toast.error(createErr?.message ?? "Failed to create material");
      }
      return;
    }

    const { resource_id: resourceId, code: newCode } = created as { resource_id: string; code: string };
    if (pendingPhotos.length > 0) {
      await uploadPhotosNow(resourceId, pendingPhotos);
      setPendingPhotos([]);
    }

    toast.success(`Material ${newCode} created`);
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
                <Label htmlFor="code">Material Code</Label>
                <div className="relative">
                  <Input
                    id="code"
                    readOnly
                    value={isEdit ? editRow?.code ?? "" : ""}
                    placeholder="Auto-assigned on save"
                    className="bg-muted pr-8"
                  />
                  <Lock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                </div>
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
                  <Label htmlFor="category_id">Category{isEdit ? "" : " *"}</Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="material_type">Type</Label>
                <Input id="material_type" placeholder="e.g. Hollow Clay Brick – 4 Hole" {...register("material_type")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="color_finish">Colour / Finish</Label>
                <Input id="color_finish" placeholder="e.g. Natural Red Clay / Fired Finish" {...register("color_finish")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dimension">Size</Label>
                <Input id="dimension" placeholder="e.g. 80 × 80 × 180 mm" {...register("dimension")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="thickness">Thickness</Label>
                <Input id="thickness" placeholder="e.g. 12 mm" {...register("thickness")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="density">Density</Label>
                <Input id="density" placeholder="e.g. ~1,000–1,400 kg/m³" {...register("density")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="compressive_strength">Compressive Strength</Label>
                <Input id="compressive_strength" placeholder="e.g. ~5–10 MPa" {...register("compressive_strength")} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" placeholder="TBD" {...register("brand")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input id="manufacturer" {...register("manufacturer")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="effective_date">Effective Date</Label>
                <Input id="effective_date" type="date" {...register("effective_date")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tech_spec_summary">Specification</Label>
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

            {!isEdit && exactMatch && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">This material already exists as {exactMatch.code}</p>
                  <p className="text-muted-foreground">{exactMatch.material_name}. Same category, type, size, grade and unit share one code. Add the new supplier or price to that material instead of creating another.</p>
                </div>
              </div>
            )}
            {!isEdit && !exactMatch && nearMatches.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-600" /> Similar materials already exist</p>
                <ul className="list-disc pl-6 text-muted-foreground">
                  {nearMatches.map((m) => <li key={m.resource_id}>{m.code} — {m.material_name}</li>)}
                </ul>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={confirmDifferent} onChange={(e) => setConfirmDifferent(e.target.checked)} />
                  This is a different material (different size, grade or type)
                </label>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || (!isEdit && !!exactMatch)}>
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
