"use client";

import { useState } from "react";
import { insertWbsTemplateReturning, updateWbsTemplateById } from "@/lib/project/wbs/wbs-queries";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { WbsTemplateRecord } from "@/components/project/wbs/wbs-types";

const CATEGORIES = [
  { value: "building", label: "Building" },
  { value: "residential", label: "Residential" },
  { value: "industrial", label: "Industrial / Factory" },
  { value: "hospital", label: "Hospital / Healthcare" },
  { value: "infrastructure", label: "Infrastructure / Civil" },
  { value: "other", label: "Other" },
];

interface TemplateUpsertDialogProps {
  template: WbsTemplateRecord | null;
  onClose: () => void;
  onSave: (id: string) => void;
}

export function TemplateUpsertDialog({ template, onClose, onSave }: TemplateUpsertDialogProps) {
  const [form, setForm] = useState({
    template_name: template?.template_name ?? "",
    template_desc: template?.template_desc ?? "",
    template_category: template?.template_category ?? "building",
    is_active: template?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.template_name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSaving(true);

    const payload = {
      template_name: form.template_name.trim(),
      template_desc: form.template_desc.trim() || null,
      template_category: form.template_category,
      is_active: form.is_active,
    };

    if (template) {
      const { error } = await updateWbsTemplateById(payload, template.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Template updated");
      onSave(template.id);
    } else {
      const { data, error } = await insertWbsTemplateReturning({
          ...payload,
          node_type_chain: ["phase", "building", "level", "zone", "room", "element", "discipline", "task_group"],
          generator_config: {
            supports_variables: true,
            default_basement_count: 1,
            default_floor_count: 3,
            default_zone_count: 2,
            default_room_count: 2,
          },
        });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Template created");
      onSave(data.id);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900">{template ? "Edit Template" : "New Template"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Template Name *</Label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="e.g. High-Rise Building"
              value={form.template_name}
              onChange={(e) => update("template_name", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={form.template_category}
              onChange={(e) => update("template_category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
              rows={3}
              placeholder="Brief description of this template's typical use"
              value={form.template_desc}
              onChange={(e) => update("template_desc", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="is_active" className="text-xs cursor-pointer">Active (available for use)</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="rounded-xl bg-slate-900" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            {template ? "Save Changes" : "Create Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
