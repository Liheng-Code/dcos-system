"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SubmittalCreateDialogProps {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface WbsNode {
  id: string;
  wbs_code: string;
  wbs_name: string;
  full_path: string | null;
}

const SUBMITTAL_TYPES = [
  { value: "shop_drawing", label: "Shop Drawing (SD)", codePrefix: "SD" },
  { value: "material_approval", label: "Material Approval Request (MRA)", codePrefix: "MRA" },
  { value: "method_statement", label: "Method Statement & Risk Assessment (MSRA)", codePrefix: "MSRA" },
  { value: "prequal", label: "Prequalification Submittal (PQ)", codePrefix: "PQ" },
  { value: "test_commissioning", label: "Testing & Commissioning (T&C)", codePrefix: "TC" },
  { value: "sample", label: "Physical Material Sample", codePrefix: "SMP" },
];

const DISCIPLINES = [
  { value: "ARC", label: "Architecture" },
  { value: "STR", label: "Structure" },
  { value: "MEP", label: "MEP" },
  { value: "CVL", label: "Civil / Geotech" },
  { value: "GEO", label: "Geotechnical" },
  { value: "QS", label: "Quantity Surveying" },
  { value: "HSE", label: "HSE" },
  { value: "QA", label: "QA/QC" },
  { value: "GEN", label: "General" },
];

export function SubmittalCreateDialog({ projectId, onClose, onCreated }: SubmittalCreateDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectCode, setProjectCode] = useState("");
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([]);
  const [nextSeq, setNextSeq] = useState(1);

  const [form, setForm] = useState({
    submittal_type: "shop_drawing",
    discipline: "ARC",
    package_code: "P01",
    submittal_number: "",
    title: "",
    wbs_node_id: "",
    sla_days: 14,
    target_submission_date: new Date().toISOString().split("T")[0],
    remarks: "",
  });

  useEffect(() => {
    if (!projectId) return;

    Promise.all([
      supabase.from("projects").select("project_code").eq("id", projectId).single(),
      supabase.from("wbs_nodes").select("id, wbs_code, wbs_name, full_path").eq("project_id", projectId).order("full_path", { ascending: true }),
      supabase.from("submittal_packages").select("submittal_number").eq("project_id", projectId),
    ]).then(([projRes, wbsRes, subRes]) => {
      if (projRes.data) setProjectCode(projRes.data.project_code);
      if (wbsRes.data) setWbsNodes(wbsRes.data as WbsNode[]);
      if (subRes.data) {
        setNextSeq(subRes.data.length + 1);
      }
      setLoading(false);
    });
  }, [projectId, supabase]);

  // Generate suggested number
  const suggestedNumber = useMemo(() => {
    const pCode = projectCode || "P001";
    const typeObj = SUBMITTAL_TYPES.find((t) => t.value === form.submittal_type);
    const prefix = typeObj ? typeObj.codePrefix : "SUB";
    const pkg = form.package_code ? form.package_code.toUpperCase() : "P01";
    const seqStr = String(nextSeq).padStart(3, "0");
    return `${pCode}-CMED-${pkg}-${prefix}.${seqStr}-R00`;
  }, [projectCode, form.submittal_type, form.package_code, nextSeq]);

  useEffect(() => {
    if (!form.submittal_number && suggestedNumber) {
      setForm((prev) => ({ ...prev, submittal_number: suggestedNumber }));
    }
  }, [suggestedNumber, form.submittal_number]);

  function update(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !form.title.trim() || !form.submittal_number.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (!userId) {
      toast.error("User authentication required");
      setSaving(false);
      return;
    }

    const payload = {
      project_id: projectId,
      submittal_number: form.submittal_number.trim(),
      title: form.title.trim(),
      submittal_type: form.submittal_type,
      discipline: form.discipline,
      package_code: form.package_code.trim() || null,
      wbs_node_id: form.wbs_node_id || null,
      originator_id: userId,
      contractor_qc_status: "pending",
      consultant_status: "draft",
      current_revision_code: "R00",
      target_submission_date: form.target_submission_date || null,
      sla_days: Number(form.sla_days) || 14,
      remarks: form.remarks.trim() || null,
      created_by: userId,
    };

    const { error } = await supabase.from("submittal_packages").insert(payload);

    if (error) {
      toast.error("Failed to create submittal: " + error.message);
      setSaving(false);
      return;
    }

    toast.success("Submittal package created successfully");
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-xl rounded-xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/30">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">New Submittal Package</h2>
            <p className="text-xs text-muted-foreground">
              Prepare a formal Shop Drawing, Material Approval (MRA), or Method Statement bundle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="submittal_type">Submittal Category *</Label>
                <select
                  id="submittal_type"
                  value={form.submittal_type}
                  onChange={(e) => update("submittal_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {SUBMITTAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="discipline">Discipline *</Label>
                <select
                  id="discipline"
                  value={form.discipline}
                  onChange={(e) => update("discipline", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {DISCIPLINES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label} ({d.value})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="submittal_number">Submittal Number *</Label>
                  <button
                    type="button"
                    onClick={() => update("submittal_number", suggestedNumber)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    Reset to standard
                  </button>
                </div>
                <input
                  id="submittal_number"
                  value={form.submittal_number}
                  onChange={(e) => update("submittal_number", e.target.value)}
                  placeholder="e.g. P001-CMED-P01-MRA.001-R00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="package_code">Package</Label>
                <input
                  id="package_code"
                  value={form.package_code}
                  onChange={(e) => update("package_code", e.target.value)}
                  placeholder="P01 / ARC"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Submittal Subject / Title *</Label>
              <input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. External Curtain Wall System Material Specs &amp; Test Certificates"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wbs_node">WBS Location (Optional)</Label>
                <select
                  id="wbs_node"
                  value={form.wbs_node_id}
                  onChange={(e) => update("wbs_node_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">— Entire Project / Not Node Specific —</option>
                  {wbsNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.full_path ?? n.wbs_code}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sla_days">Consultant Review SLA (Days)</Label>
                <input
                  id="sla_days"
                  type="number"
                  min={1}
                  max={60}
                  value={form.sla_days}
                  onChange={(e) => update("sla_days", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target_date">Target Submission Date</Label>
              <input
                id="target_date"
                type="date"
                value={form.target_submission_date}
                onChange={(e) => update("target_submission_date", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remarks">Initial Remarks &amp; Specification References</Label>
              <textarea
                id="remarks"
                value={form.remarks}
                onChange={(e) => update("remarks", e.target.value)}
                rows={2}
                placeholder="e.g. In compliance with Specification Section 08 44 00 Clause 2.1..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
              />
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                <Plus className="mr-1.5 h-4 w-4" />
                Create Submittal Package
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
