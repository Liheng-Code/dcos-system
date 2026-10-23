"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { ImagePlus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ACTIVITY_TYPES } from "@/lib/planning/activity-library/activity-database-import";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
import { divisionLabel, percentLabel, sectionLabel } from "@/lib/planning/activity-library/activity-chips-rules";
import { CsiSectionPicker } from "@/components/csi/csi-section-picker";
import type { CsiSection } from "@/lib/csi-divisions";
import { ActivityChipSections } from "./activity-chip-sections";
import { SELECT_CLS } from "./activity-database-shared";

const pct = z.string().refine((s) => s.trim() === "" || (Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 100), "Enter 0 to 100");

export const detailsSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string(),
    default_unit: z.string(),
    activity_type: z.string(),
    visible_code: z.string().trim().regex(/^$|^D\d{2}-\d{3,}$/i, "Use the format D04-001"),
    trade: z.string(),
    csi_division_code: z.string(),
    csi_section_code: z.string(),
    min_pct: pct,
    max_pct: pct,
  })
  .refine((v) => v.min_pct.trim() === "" || v.max_pct.trim() === "" || Number(v.min_pct) <= Number(v.max_pct), {
    message: "Min must not exceed max",
    path: ["max_pct"],
  });

export type DetailsValues = z.infer<typeof detailsSchema>;

const TYPE_LABEL: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  construction: "Construction", procurement: "Procurement", design: "Design", submittal: "Submittal", testing: "Testing", milestone: "Milestone",
};

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Label above a read-only value (view mode of the Identify and Duration grid). */
function ValueCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="min-h-9 break-words py-1.5 text-sm">{value || "-"}</div>
    </div>
  );
}

function PencilButton({ editing, onClick, label, className }: { editing: boolean; onClick: () => void; label: string; className?: string }) {
  return (
    <Button
      type="button" variant={editing ? "secondary" : "ghost"} size="icon-xs" aria-label={label} aria-pressed={editing} title={label}
      onClick={onClick} className={className}
    >
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
}

/** Details tab: name, image + description, Identify and Duration, and the shop drawing / material / coordination chips. */
export function ActivityDetailsTab({
  db, masterId, form, divisions, sections, status, versionedEditable, canEdit, imageUrl, imageLoading, onUploadImage, editing, onToggleEdit,
}: {
  db: SupabaseClient;
  masterId: string;
  form: UseFormReturn<DetailsValues>;
  divisions: Division[];
  sections: CsiSection[];
  status: string;
  versionedEditable: boolean;
  canEdit: boolean;
  imageUrl: string | null;
  imageLoading: boolean;
  onUploadImage: (file: File) => Promise<void>;
  /** One edit mode for Name, Description and Identify and Duration. */
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const { register, formState: { errors } } = form;
  const v = useWatch({ control: form.control }) as Partial<DetailsValues>;
  const divisionValue = v.csi_division_code ?? "";
  const sectionValue = v.csi_section_code ?? "";
  // Offer active divisions, plus the current one if it has since been deactivated.
  const divisionOptions = divisions.filter((d) => d.is_active || d.code === divisionValue);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const edit = canEdit && editing;
  const lockV = !edit || !versionedEditable;
  const hint = !versionedEditable ? `Approved/active - create a new version to change this (status: ${status})` : undefined;

  const divisionName = divisions.find((d) => d.code === divisionValue)?.name;
  const sectionName = sections.find((s) => s.code === sectionValue)?.name;
  const typeValue = (ACTIVITY_TYPES as readonly string[]).includes(v.activity_type ?? "") ? TYPE_LABEL[v.activity_type as (typeof ACTIVITY_TYPES)[number]] : "";

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          You can view this activity; only library managers can change it.
        </p>
      )}
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} readOnly={lockV} title={hint} aria-invalid={!!errors.name} className={lockV ? "bg-muted/30" : undefined} />
      </Field>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div>
          <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
              <img src={imageUrl} alt="Activity" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">{imageLoading ? "Loading image…" : "No image"}</span>
            )}
          </div>
          {canEdit && (
            <>
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setUploading(true);
                  try { await onUploadImage(f); } finally { setUploading(false); }
                }}
              />
              <Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
                {imageUrl ? "Replace image" : "Upload image"}
              </Button>
            </>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Description</h3>
            {canEdit && <PencilButton editing={editing} onClick={onToggleEdit} label={editing ? "Stop editing" : "Edit details"} />}
          </div>
          {lockV ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed" title={edit ? hint : undefined}>
              {v.description?.trim() ? v.description : <span className="text-muted-foreground">No description.</span>}
            </p>
          ) : (
            <>
              <textarea
                {...register("description")} rows={6} aria-label="Description"
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {errors.description?.message && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
            </>
          )}
        </div>
      </div>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Identify and duration</h3>
          {canEdit && <PencilButton editing={editing} onClick={onToggleEdit} label={editing ? "Stop editing" : "Edit identify and duration"} />}
        </div>
        {edit ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Visible ID" error={errors.visible_code?.message}>
              <Input {...register("visible_code")} placeholder="D04-001" className="font-mono" aria-invalid={!!errors.visible_code} />
            </Field>
            <Field label="Trade" error={errors.trade?.message}>
              <Input {...register("trade")} placeholder="Finishes Works" />
            </Field>
            <Field label="Min Duration (percentage)" error={errors.min_pct?.message}>
              <div className="flex items-center gap-2">
                <Input type="number" step="any" min={0} max={100} {...register("min_pct")} disabled={lockV} title={hint} aria-invalid={!!errors.min_pct} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field label="Max Duration (percentage)" error={errors.max_pct?.message}>
              <div className="flex items-center gap-2">
                <Input type="number" step="any" min={0} max={100} {...register("max_pct")} disabled={lockV} title={hint} aria-invalid={!!errors.max_pct} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field label="Division Name" error={errors.csi_division_code?.message}>
              <select
                {...register("csi_division_code", { onChange: () => form.setValue("csi_section_code", "", { shouldDirty: true }) })}
                className={SELECT_CLS}
              >
                <option value="">No division</option>
                {divisionOptions.map((d) => <option key={d.code} value={d.code}>{divisionLabel(d.code, d.name)}</option>)}
              </select>
            </Field>
            <Field label="CSI Section" error={errors.csi_section_code?.message}>
              <CsiSectionPicker
                sections={sections} divisionCode={divisionValue || null} value={sectionValue || null}
                disabled={!divisionValue} placeholder={divisionValue ? "No section" : "Choose a division first"}
                onChange={(code) => form.setValue("csi_section_code", code ?? "", { shouldDirty: true })}
              />
            </Field>
            <Field label="Type" error={errors.activity_type?.message}>
              <select {...register("activity_type")} disabled={lockV} title={hint} className={SELECT_CLS}>
                <option value="">Not set</option>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Unit" error={errors.default_unit?.message}>
              <Input {...register("default_unit")} disabled={lockV} title={hint} placeholder="m2" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <ValueCell label="Visible ID" value={v.visible_code ?? ""} />
            <ValueCell label="Trade" value={v.trade ?? ""} />
            <ValueCell label="Min Duration (percentage)" value={percentLabel(v.min_pct)} />
            <ValueCell label="Max Duration (percentage)" value={percentLabel(v.max_pct)} />
            <ValueCell label="Division Name" value={divisionLabel(divisionValue, divisionName)} />
            <ValueCell label="CSI Section" value={sectionLabel(sectionValue, sectionName)} />
            <ValueCell label="Type" value={typeValue} />
            <ValueCell label="Unit" value={v.default_unit ?? ""} />
          </div>
        )}
        {edit && !versionedEditable && (
          <p className="text-xs text-muted-foreground">
            Approved/active - create a new version to change name, description, unit, type and duration %. Division, visible ID, trade and image can still be edited.
          </p>
        )}
      </section>

      <Separator />

      <ActivityChipSections db={db} masterId={masterId} divisionCode={divisionValue || null} canEdit={canEdit} />
    </div>
  );
}
