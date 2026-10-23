"use client";

import { useRef, useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { ImagePlus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CsiSectionPicker } from "@/components/csi/csi-section-picker";
import type { CsiSection } from "@/lib/csi-divisions";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
import { divisionText } from "@/lib/planning/activity-library/boq-item-rules";
import { SELECT_CLS } from "./activity-database-shared";

export const boqDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string(),
  unit: z.string().trim().min(1, "Unit is required"),
  csi_division_code: z.string(),
  csi_section_code: z.string(),
});
export type BoqDetailsValues = z.infer<typeof boqDetailsSchema>;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Details tab of the BOQ item dialog: name, division of work, CSI section, image, description and unit. */
export function BoqItemDetailsTab({
  form, divisions, sections, units, canEdit, editing, onToggleEdit, imageUrl, imageLoading, onUploadImage, inactive,
}: {
  form: UseFormReturn<BoqDetailsValues>;
  divisions: Division[];
  sections: CsiSection[];
  /** Distinct units already used in the cost library. */
  units: string[];
  canEdit: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  imageUrl: string | null;
  imageLoading: boolean;
  onUploadImage: (file: File) => Promise<void>;
  inactive: boolean;
}) {
  const { register, formState: { errors } } = form;
  const v = useWatch({ control: form.control }) as Partial<BoqDetailsValues>;
  const divisionValue = v.csi_division_code ?? "";
  const sectionValue = v.csi_section_code ?? "";
  const edit = canEdit && editing;
  const divisionOptions = divisions.filter((d) => d.is_active || d.code === divisionValue);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const readOnlyCls = edit ? undefined : "bg-muted/30";

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">You can view this BOQ item; only library managers can change it.</p>
      )}
      {inactive && <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">This BOQ item is inactive: it no longer appears in pickers.</p>}

      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} readOnly={!edit} className={readOnlyCls} aria-invalid={!!errors.name} />
      </Field>

      <Field label="Division of Work" error={errors.csi_division_code?.message}>
        {edit ? (
          <select
            {...register("csi_division_code", { onChange: () => form.setValue("csi_section_code", "", { shouldDirty: true }) })}
            className={SELECT_CLS}
          >
            <option value="">No division</option>
            {divisionOptions.map((d) => <option key={d.code} value={d.code}>{divisionText(d.code, d.name)}</option>)}
          </select>
        ) : (
          <Input readOnly className={readOnlyCls} value={divisionText(divisionValue, divisions.find((d) => d.code === divisionValue)?.name)} />
        )}
      </Field>

      <Field label="CSI Section (optional)" error={errors.csi_section_code?.message}>
        <CsiSectionPicker
          sections={sections} divisionCode={divisionValue || null} value={sectionValue || null}
          disabled={!edit || !divisionValue} placeholder={divisionValue ? "No section" : "Choose a division first"}
          onChange={(code) => form.setValue("csi_section_code", code ?? "", { shouldDirty: true })}
        />
      </Field>

      <div className="max-w-md">
        <div className="mb-1 flex items-center justify-end gap-1">
          {canEdit && (
            <Button
              type="button" variant={editing ? "secondary" : "ghost"} size="icon-xs" aria-pressed={editing}
              aria-label={editing ? "Stop editing" : "Edit BOQ item"} title={editing ? "Stop editing" : "Edit BOQ item"} onClick={onToggleEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
            <img src={imageUrl} alt="BOQ item" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">{imageLoading ? "Loading image…" : "No image"}</span>
          )}
        </div>
        {edit && (
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

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-primary">Description:</h3>
        {edit ? (
          <textarea
            {...register("description")} rows={6} aria-label="Description"
            className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        ) : (
          <p className="min-h-20 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed">
            {v.description?.trim() ? v.description : <span className="text-muted-foreground">No description.</span>}
          </p>
        )}
      </section>

      <Field label="Unit" error={errors.unit?.message}>
        <Input {...register("unit")} list="boq-unit-options" readOnly={!edit} className={readOnlyCls} placeholder="m2" aria-invalid={!!errors.unit} />
        <datalist id="boq-unit-options">{units.map((u) => <option key={u} value={u} />)}</datalist>
      </Field>
    </div>
  );
}
