"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { WbsTemplateNodeRecord } from "@/components/wbs/wbs-types";

const NODE_TYPES = [
  { value: "location", label: "Location" },
  { value: "building", label: "Building / Area" },
  { value: "level", label: "Level / Floor" },
  { value: "zone", label: "Zone" },
  { value: "room", label: "Room / Space" },
  { value: "element", label: "Element" },
  { value: "phase", label: "Phase" },
  { value: "discipline", label: "Discipline" },
  { value: "task_group", label: "Task Group" },
];

interface TemplateNodeEditSheetProps {
  node: WbsTemplateNodeRecord | null;
  templateId: string;
  parentId: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function TemplateNodeEditSheet({ node, templateId, parentId, onClose, onSave }: TemplateNodeEditSheetProps) {
  const [form, setForm] = useState({
    wbs_code: node?.wbs_code ?? "",
    wbs_name: node?.wbs_name ?? "",
    node_type: node?.node_type ?? "building",
    sort_order: node?.sort_order?.toString() ?? "0",
    source_library_type: node?.source_library_type ?? "",
    source_library_id: node?.source_library_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.wbs_code.trim() || !form.wbs_name.trim()) {
      toast.error("WBS Code and Name are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    if (node) {
      const { error } = await supabase
        .from("wbs_template_nodes")
        .update({
          wbs_code: form.wbs_code.trim().toUpperCase(),
          wbs_name: form.wbs_name.trim(),
          node_type: form.node_type,
          sort_order: parseInt(form.sort_order) || 0,
          source_library_type: form.source_library_type || null,
          source_library_id: form.source_library_id || null,
        })
        .eq("id", node.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Node updated");
    } else {
      const { error } = await supabase.from("wbs_template_nodes").insert({
        template_id: templateId,
        parent_id: parentId,
        wbs_code: form.wbs_code.trim().toUpperCase(),
        wbs_name: form.wbs_name.trim(),
        node_type: form.node_type,
        sort_order: parseInt(form.sort_order) || 0,
        source_library_type: form.source_library_type || null,
        source_library_id: form.source_library_id || null,
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Node added");
    }

    setSaving(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900">{node ? "Edit Template Node" : "Add Template Node"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">WBS Code *</Label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="e.g. BLD-TA"
                value={form.wbs_code}
                onChange={(e) => update("wbs_code", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort Order</Label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={form.sort_order}
                onChange={(e) => update("sort_order", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Node Name *</Label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="e.g. Tower A"
              value={form.wbs_name}
              onChange={(e) => update("wbs_name", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Node Type</Label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={form.node_type}
              onChange={(e) => update("node_type", e.target.value)}
            >
              {NODE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Source Library Type</Label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="e.g. element"
                value={form.source_library_type}
                onChange={(e) => update("source_library_type", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source Library ID</Label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="Optional UUID"
                value={form.source_library_id}
                onChange={(e) => update("source_library_id", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="rounded-xl bg-slate-900" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
