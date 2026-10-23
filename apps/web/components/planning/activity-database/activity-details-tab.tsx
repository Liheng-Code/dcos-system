"use client";

import { useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTIVITY_TYPES } from "@/lib/planning/activity-library/activity-database-import";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
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
    division_id: z.string(),
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

/** Details tab: image, name, description and the Identity & Duration fields. */
export function ActivityDetailsTab({
  form, divisions, status, versionedEditable, canEdit, imageUrl, onUploadImage,
}: {
  form: UseFormReturn<DetailsValues>;
  divisions: Division[];
  status: string;
  versionedEditable: boolean;
  canEdit: boolean;
  imageUrl: string | null;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const { register, formState: { errors } } = form;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const lockV = !canEdit || !versionedEditable;
  const lockAny = !canEdit;
  const hint = !versionedEditable ? `Approved/active - create a new version to change this (status: ${status})` : undefined;

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          You can view this activity; only library managers can change it.
        </p>
      )}
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} disabled={lockV} title={hint} aria-invalid={!!errors.name} />
      </Field>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
              <img src={imageUrl} alt="Activity" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No image</span>
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
        <Field label="Description" error={errors.description?.message}>
          <textarea
            {...register("description")} disabled={lockV} title={hint} rows={6}
            className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
        </Field>
      </div>

      <section className="rounded-md border border-border">
        <h3 className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary">Identity and duration</h3>
        <div className="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Visible ID" error={errors.visible_code?.message}>
            <Input {...register("visible_code")} disabled={lockAny} placeholder="D04-001" className="font-mono" aria-invalid={!!errors.visible_code} />
          </Field>
          <Field label="Trade" error={errors.trade?.message}>
            <Input {...register("trade")} disabled={lockAny} placeholder="Finishes Works" />
          </Field>
          <Field label="Division" error={errors.division_id?.message}>
            <select {...register("division_id")} disabled={lockAny} className={SELECT_CLS}>
              <option value="">No division</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>Division {d.code} - {d.name}</option>)}
            </select>
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
          <div className="hidden lg:block" />
          <Field label="Min duration (%)" error={errors.min_pct?.message}>
            <Input type="number" step="any" min={0} max={100} {...register("min_pct")} disabled={lockV} title={hint} aria-invalid={!!errors.min_pct} />
          </Field>
          <Field label="Max duration (%)" error={errors.max_pct?.message}>
            <Input type="number" step="any" min={0} max={100} {...register("max_pct")} disabled={lockV} title={hint} aria-invalid={!!errors.max_pct} />
          </Field>
        </div>
        {!versionedEditable && (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Approved/active - create a new version to change name, description, unit, type and duration %. Division, visible ID, trade and image can still be edited.
          </p>
        )}
      </section>
    </div>
  );
}
