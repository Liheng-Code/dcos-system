"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getWbsNodeGfa, upsertWbsNodeGfa } from "@/lib/wbs-area-service";
import { LEVEL_TYPES } from "@/lib/level-library";
import { getLevelTemplateName } from "@/lib/level-library-queries";
import { insertWbsNode, listWbsNodesByProjectIdAndParentId, updateWbsNodeById } from "@/lib/project/wbs/wbs-queries";

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
  is_below_ground?: boolean;
  is_external_works?: boolean;
  // Level nodes only. A level copied from a Level Library template keeps the template as a
  // reference; editing the level here never changes the template.
  level_type?: string | null;
  floor_height_m?: number | null;
  source_level_template_id?: string | null;
  source_level_template_version?: number | null;
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
    is_below_ground: node?.is_below_ground ?? false,
    is_external_works: node?.is_external_works ?? false,
    level_type: node?.level_type ?? "",
    floor_height_m: node?.floor_height_m != null ? String(node.floor_height_m) : "",
  });
  const [saving, setSaving] = useState(false);
  const [sortOrderTouched, setSortOrderTouched] = useState(false);
  const [sourceTemplateName, setSourceTemplateName] = useState<string | null>(null);

  useEffect(() => {
    if (!node?.source_level_template_id) return;
    getLevelTemplateName(node.source_level_template_id).then(setSourceTemplateName);
  }, [node?.source_level_template_id]);

  // Level-only attributes; cleared when the node is not a level.
  const levelFields = form.node_type === "level"
    ? {
        level_type: form.level_type || null,
        floor_height_m: form.floor_height_m ? parseFloat(form.floor_height_m) : null,
        is_basement: form.level_type === "basement" || form.is_below_ground,
      }
    : { level_type: null, floor_height_m: null };

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggle(field: "is_below_ground" | "is_external_works") {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    if (node) {
      const { error } = await updateWbsNodeById({
          wbs_code: form.wbs_code,
          wbs_name: form.wbs_name,
          node_type: form.node_type,
          status: form.status,
          sort_order: parseInt(form.sort_order) || 0,
          is_below_ground: form.is_below_ground,
          is_external_works: form.is_external_works,
          ...levelFields,
        }, node.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("WBS node updated");
        onSave();
      }
    } else {
      // When creating a node, keep it in code order among its siblings unless the
      // user explicitly set a Sort Order. Without this, a new node falls back to
      // sort_order = 0 and jumps to the top of its parent.
      const sortOrder = sortOrderTouched
        ? parseInt(form.sort_order) || 0
        : await computeCreateSortOrder(supabase, projectId, parentId, form.wbs_code);

      const { error } = await insertWbsNode({
        project_id: projectId,
        parent_id: parentId,
        wbs_code: form.wbs_code,
        wbs_name: form.wbs_name,
        node_type: form.node_type,
        status: form.status,
        sort_order: sortOrder,
        is_below_ground: form.is_below_ground,
        is_external_works: form.is_external_works,
        ...levelFields,
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
                  onChange={(e) => { setSortOrderTouched(true); update("sort_order", e.target.value); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>
            {form.node_type === "level" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="level_type">Level Type</Label>
                    <select
                      id="level_type"
                      value={form.level_type}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev) => ({ ...prev, level_type: v, is_below_ground: v === "basement" ? true : prev.is_below_ground }));
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    >
                      <option value="">—</option>
                      {LEVEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="floor_height_m">Floor-to-floor height (m)</Label>
                    <input
                      id="floor_height_m"
                      type="number"
                      step="0.01"
                      value={form.floor_height_m}
                      onChange={(e) => update("floor_height_m", e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_below_ground}
                    onChange={() => toggle("is_below_ground")}
                    className="h-4 w-4 rounded border-border"
                  />
                  Basement level (below ground)
                </label>
                {node?.source_level_template_id && (
                  <p className="text-xs text-muted-foreground">
                    Copied from level template {sourceTemplateName ? `"${sourceTemplateName}"` : ""}
                    {node.source_level_template_version ? ` v${node.source_level_template_version}` : ""}. Changes here apply to this project only.
                  </p>
                )}
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_external_works}
                onChange={() => toggle("is_external_works")}
                className="h-4 w-4 rounded border-border"
              />
              External works branch (site roads, drainage, boundary, landscaping — cost divides by Site Area, not GFA)
            </label>
          </fieldset>
        </div>

        {node && form.node_type === "level" && (
          <div className="px-5 pb-5">
            <GfaFieldset wbsNodeId={node.id} />
          </div>
        )}

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

// GFA per level node (DCOS-QS-GDL-001 §3, §11). Kept as its own save action,
// separate from the node's plain-field Save above, since changing an existing
// GFA value requires a revision reason and is independently audit-logged
// (design doc §2.3/§2.5) — it isn't just another node attribute.
function GfaFieldset({ wbsNodeId }: { wbsNodeId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWbsNodeGfa(wbsNodeId).then((gfa) => {
      if (cancelled) return;
      if (gfa) {
        setHasExisting(true);
        setValue(String(gfa.value));
        setSource(gfa.source ?? "");
        setUpdatedAt(gfa.updatedAt);
      } else {
        setHasExisting(false);
        setValue("");
        setSource("");
        setUpdatedAt(null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [wbsNodeId]);

  async function handleSaveGfa() {
    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue) || numericValue < 0) {
      toast.error("Enter a valid GFA value (m²)");
      return;
    }
    if (!source.trim()) {
      toast.error("Drawing revision reference is required — GFA is entered from drawings, never derived");
      return;
    }
    if (hasExisting && !revisionReason.trim()) {
      toast.error("A reason is required when changing an existing GFA value");
      return;
    }
    setSaving(true);
    try {
      await upsertWbsNodeGfa({
        wbsNodeId,
        value: numericValue,
        source: source.trim(),
        revisionReason: hasExisting ? revisionReason.trim() : undefined,
      });
      toast.success("GFA saved");
      setHasExisting(true);
      setRevisionReason("");
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save GFA");
    }
    setSaving(false);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Ruler className="h-3.5 w-3.5" />
        GFA (per DCOS-QS-GDL-001 §3)
      </legend>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gfa_value">GFA (m²) *</Label>
              <input
                id="gfa_value"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 850"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gfa_source">Drawing Reference *</Label>
              <input
                id="gfa_source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. A-102 Rev C"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
          </div>
          {hasExisting && (
            <div className="space-y-1.5">
              <Label htmlFor="gfa_reason">Reason for change *</Label>
              <input
                id="gfa_reason"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="e.g. Added floor per Rev D drawings"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {updatedAt ? `Last updated ${new Date(updatedAt).toLocaleDateString()}` : "Not entered yet"}
            </span>
            <Button variant="outline" size="sm" onClick={handleSaveGfa} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save GFA
            </Button>
          </div>
        </>
      )}
    </fieldset>
  );
}

// Computes a sort_order that keeps a new sibling in code order among its
// existing siblings (same parent). The tree is ordered by sort_order first and
// falls back to wbs_code, so this interpolates the sort_order between the two
// code-neighbours instead of defaulting to 0 (which would push the node to the
// top of the parent).
function computeInsertSortOrder(
  siblings: Array<{ wbs_code: string; sort_order: number }>,
  newCode: string,
): number {
  if (siblings.length === 0) return 0;

  const byCode = [...siblings].sort((a, b) => a.wbs_code.localeCompare(b.wbs_code));
  let insertIndex = byCode.findIndex((s) => s.wbs_code.localeCompare(newCode) > 0);
  if (insertIndex === -1) insertIndex = byCode.length;

  const before = insertIndex > 0 ? byCode[insertIndex - 1] : null;
  const after = insertIndex < byCode.length ? byCode[insertIndex] : null;

  if (!before && !after) return 0;

  const sortValues = siblings.map((s) => s.sort_order ?? 0);
  if (!before) return Math.min(...sortValues) - 10;
  if (!after) return Math.max(...sortValues) + 10;

  const beforeSort = before.sort_order ?? 0;
  const afterSort = after.sort_order ?? 0;
  if (afterSort === beforeSort) return beforeSort;
  return Math.floor((beforeSort + afterSort) / 2);
}

async function computeCreateSortOrder(
  supabase: SupabaseClient,
  projectId: string,
  parentId: string | null,
  wbsCode: string,
): Promise<number> {
  const { data } = await listWbsNodesByProjectIdAndParentId(projectId, parentId);

  const siblings = (data ?? []) as Array<{ wbs_code: string; sort_order: number }>;
  return computeInsertSortOrder(siblings, wbsCode.toUpperCase());
}
