"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { DWL_SPEC_REVISION_STATUS, type DwlMaterialSpec } from "@/components/qs/dwl-types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resourceCode: string;
  tenantId: string;
  userId: string | null;
  /** null => create a new specification + revision R01; set => add a revision to this spec. */
  spec: DwlMaterialSpec | null;
  /** revisions already on `spec` (used to suggest the next revision number). */
  existingRevisionCount: number;
  onSaved: () => void;
}

export function DwlMaterialSpecDialog({
  open,
  onOpenChange,
  resourceId,
  resourceCode,
  tenantId,
  userId,
  spec,
  existingRevisionCount,
  onSaved,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const isNewSpec = spec === null;
  const [saving, setSaving] = useState(false);

  const suggestedRev = useMemo(() => {
    const n = isNewSpec ? 1 : existingRevisionCount + 1;
    return `R${String(n).padStart(2, "0")}`;
  }, [isNewSpec, existingRevisionCount]);

  const [form, setForm] = useState({
    spec_code: "",
    spec_name: "",
    discipline: "",
    revision_no: suggestedRev,
    standard: "",
    grade: "",
    strength_performance: "",
    dimension: "",
    thickness: "",
    density: "",
    unit: "",
    manufacturer: "",
    brand: "",
    technical_req: "",
    installation_req: "",
    testing_req: "",
    approval_req: "",
    effective_date: todayIso(),
    expiry_date: "",
    status: "active" as (typeof DWL_SPEC_REVISION_STATUS)[number],
    source_document: "",
  });

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => ({
      ...f,
      spec_code: isNewSpec ? `SPEC-${resourceCode.replace(/^M-/, "")}-001` : spec!.spec_code,
      spec_name: isNewSpec ? "" : spec!.spec_name,
      discipline: isNewSpec ? "" : spec!.discipline ?? "",
      revision_no: suggestedRev,
      standard: "", grade: "", strength_performance: "", dimension: "", thickness: "",
      density: "", unit: "", manufacturer: "", brand: "",
      technical_req: "", installation_req: "", testing_req: "", approval_req: "",
      effective_date: todayIso(), expiry_date: "", status: "active", source_document: "",
    }));
  }, [open, isNewSpec, spec, resourceCode, suggestedRev]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!tenantId) { toast.error("No tenant assigned to your profile"); return; }
    if (isNewSpec && !form.spec_name.trim()) { toast.error("Specification name is required"); return; }
    if (!form.revision_no.trim()) { toast.error("Revision number is required"); return; }
    if (!form.effective_date) { toast.error("Effective date is required"); return; }

    setSaving(true);
    try {
      let specId = spec?.id;

      if (isNewSpec) {
        const { data, error } = await supabase
          .from("dwl_material_specs")
          .insert({
            tenant_id: tenantId,
            spec_code: form.spec_code.trim(),
            resource_id: resourceId,
            spec_name: form.spec_name.trim(),
            discipline: form.discipline.trim() || null,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error || !data) {
          throw new Error(error?.message ?? "Failed to create specification");
        }
        specId = data.id as string;
      }

      const { error: revError } = await supabase.from("dwl_material_spec_revisions").insert({
        tenant_id: tenantId,
        spec_id: specId,
        revision_no: form.revision_no.trim(),
        standard: form.standard.trim() || null,
        grade: form.grade.trim() || null,
        strength_performance: form.strength_performance.trim() || null,
        dimension: form.dimension.trim() || null,
        thickness: form.thickness.trim() || null,
        density: form.density.trim() || null,
        unit: form.unit.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        brand: form.brand.trim() || null,
        technical_req: form.technical_req.trim() || null,
        installation_req: form.installation_req.trim() || null,
        testing_req: form.testing_req.trim() || null,
        approval_req: form.approval_req.trim() || null,
        effective_date: form.effective_date,
        expiry_date: form.expiry_date || null,
        status: form.status,
        source_document: form.source_document.trim() || null,
        created_by: userId,
      });
      if (revError) {
        if (revError.code === "23505" || /unique/i.test(revError.message)) {
          throw new Error(`Revision ${form.revision_no} already exists for this specification`);
        }
        throw new Error(revError.message);
      }

      toast.success(isNewSpec ? "Specification created" : `Revision ${form.revision_no} added`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save specification");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isNewSpec ? "New Specification" : `New Revision — ${spec!.spec_code}`}
          </DialogTitle>
          <DialogDescription>
            {isNewSpec
              ? "Create a specification for this material and its first revision. Revisions are append-only — a change is always a new revision, never an edit."
              : `Add revision ${suggestedRev} to ${spec!.spec_name}. The previous revision stays in history; set it to "superseded" separately if needed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isNewSpec && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Specification ID *</Label>
                <Input value={form.spec_code} onChange={(e) => set("spec_code", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Specification Name *</Label>
                <Input value={form.spec_name} onChange={(e) => set("spec_name", e.target.value)}
                  placeholder="e.g. Standard Gypsum Suspended System" />
              </div>
              <div className="space-y-1">
                <Label>Discipline</Label>
                <Input value={form.discipline} onChange={(e) => set("discipline", e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Revision *</Label>
              <Input value={form.revision_no} onChange={(e) => set("revision_no", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Effective Date *</Label>
              <Input type="date" value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Standard</Label>
              <Input value={form.standard} onChange={(e) => set("standard", e.target.value)} placeholder="EN 520 / EN 13964" />
            </div>
            <div className="space-y-1">
              <Label>Grade</Label>
              <Input value={form.grade} onChange={(e) => set("grade", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as (typeof DWL_SPEC_REVISION_STATUS)[number])}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {DWL_SPEC_REVISION_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Strength / Performance</Label>
              <Input value={form.strength_performance} onChange={(e) => set("strength_performance", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Dimension</Label>
              <Input value={form.dimension} onChange={(e) => set("dimension", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Thickness</Label>
              <Input value={form.thickness} onChange={(e) => set("thickness", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Density</Label>
              <Input value={form.density} onChange={(e) => set("density", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brand</Label>
              <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Technical Requirements</Label>
            <Input value={form.technical_req} onChange={(e) => set("technical_req", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Installation Requirements</Label>
            <Input value={form.installation_req} onChange={(e) => set("installation_req", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Testing Requirements</Label>
              <Input value={form.testing_req} onChange={(e) => set("testing_req", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Approval Requirements</Label>
              <Input value={form.approval_req} onChange={(e) => set("approval_req", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Source Document</Label>
            <Input value={form.source_document} onChange={(e) => set("source_document", e.target.value)}
              placeholder="Datasheet reference / file name" />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isNewSpec ? "Create Specification" : "Add Revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
