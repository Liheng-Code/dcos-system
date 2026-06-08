"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface WbsNodeRecord {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  full_path: string | null;
  sort_order: number;
  progress_percent: number;
  status: string;
}

const NODE_TYPES = [
  { value: "phase", label: "Phase" },
  { value: "building", label: "Building / Area" },
  { value: "level", label: "Level" },
  { value: "zone", label: "Zone" },
  { value: "room", label: "Room / Space" },
  { value: "element", label: "Element" },
  { value: "discipline", label: "Discipline" },
  { value: "task_group", label: "Task Group" },
];

const STATUSES = ["active", "on_hold", "closed"];

interface WbsNodeEditSheetProps {
  node: WbsNodeRecord | null;
  projectId: string;
  parentId: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function WbsNodeEditSheet({ node, projectId, parentId, onClose, onSave }: WbsNodeEditSheetProps) {
  const [form, setForm] = useState({
    wbs_code: node?.wbs_code ?? "",
    wbs_name: node?.wbs_name ?? "",
    node_type: node?.node_type ?? "building",
    status: node?.status ?? "active",
    sort_order: node?.sort_order?.toString() ?? "0",
  });
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    if (node) {
      const { error } = await supabase
        .from("wbs_nodes")
        .update({
          wbs_code: form.wbs_code,
          wbs_name: form.wbs_name,
          node_type: form.node_type,
          status: form.status,
          sort_order: parseInt(form.sort_order) || 0,
        })
        .eq("id", node.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("WBS node updated");
        onSave();
      }
    } else {
      const { error } = await supabase.from("wbs_nodes").insert({
        project_id: projectId,
        parent_id: parentId,
        wbs_code: form.wbs_code,
        wbs_name: form.wbs_name,
        node_type: form.node_type,
        status: form.status,
        sort_order: parseInt(form.sort_order) || 0,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("WBS node created");
        onSave();
      }
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {node ? form.wbs_name : "New WBS Node"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {node ? form.wbs_code : `Parent: ${parentId ? "selected node" : "root"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Node Info
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wbs_code">WBS Code *</Label>
                <input
                  id="wbs_code"
                  value={form.wbs_code}
                  onChange={(e) => update("wbs_code", e.target.value.toUpperCase())}
                  placeholder="e.g. B01, L05, Z03"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node_type">Node Type *</Label>
                <select
                  id="node_type"
                  value={form.node_type}
                  onChange={(e) => update("node_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {NODE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wbs_name">Name *</Label>
              <input
                id="wbs_name"
                value={form.wbs_name}
                onChange={(e) => update("wbs_name", e.target.value)}
                placeholder="e.g. Building 01, Level 05"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Settings
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sort_order">Sort Order</Label>
                <input
                  id="sort_order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => update("sort_order", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.wbs_code.trim() || !form.wbs_name.trim()}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            {node ? "Save Changes" : "Create Node"}
          </Button>
        </div>
      </div>
    </div>
  );
}
