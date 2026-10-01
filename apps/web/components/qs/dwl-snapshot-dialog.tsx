"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { insertDwlProjectSnapshot } from "@/lib/qs/qs-queries";
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
import type { DwlProject, DwlSnapshotPayload } from "@/components/qs/dwl-types";

const snapshotFormSchema = z.object({
  label: z.string().trim().min(3, "Label is required — e.g. \"Tender submission rev A\""),
  confirmed: z.boolean().refine((v) => v === true, {
    message: "You must confirm this action is permanent",
  }),
});

type SnapshotFormValues = z.infer<typeof snapshotFormSchema>;

interface DwlSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  project: DwlProject | null;
  payload: DwlSnapshotPayload | null;
  onIssued: () => void;
}

export function DwlSnapshotDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  project,
  payload,
  onIssued,
}: DwlSnapshotDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SnapshotFormValues>({
    resolver: zodResolver(snapshotFormSchema),
    defaultValues: { label: "", confirmed: false },
  });

  useEffect(() => {
    if (open) {
      reset({ label: "", confirmed: false });
    }
  }, [open, reset]);

  async function onSubmit(values: SnapshotFormValues) {
    if (!project || !payload) return;
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot issue a snapshot");
      return;
    }

    setSubmitting(true);
    const { error } = await insertDwlProjectSnapshot({
      tenant_id: tenantId,
      project_id: project.id,
      label: values.label.trim(),
      snapped_by: userId,
      payload,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Snapshot "${values.label.trim()}" issued — this estimate is now frozen history`);
    onIssued();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" /> Issue Snapshot{project ? ` — ${project.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            This freezes the estimate exactly as it stands right now — quantities, rates, and the
            markups you set — into permanent history. The live estimate keeps moving as prices and
            factors change; this copy never will. There is no undo: snapshots cannot be edited or
            deleted once issued (append-only by design, enforced at the database level).
          </DialogDescription>
        </DialogHeader>

        {payload && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direct cost</span>
              <span className="font-mono">{payload.direct_cost.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Markups</span>
              <span className="font-mono">{payload.markup_amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
              <span>Total (this snapshot)</span>
              <span className="font-mono">{payload.total.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{payload.estimate_rows.length} elemental line(s)</div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="label">Snapshot Label *</Label>
            <Input id="label" placeholder="e.g. Tender submission rev A" {...register("label")} />
            {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input" {...register("confirmed")} />
            <span>I understand this snapshot is permanent and cannot be edited or deleted once issued.</span>
          </label>
          {errors.confirmed && <p className="text-xs text-destructive">{errors.confirmed.message}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !project || !payload}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Issue Snapshot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
