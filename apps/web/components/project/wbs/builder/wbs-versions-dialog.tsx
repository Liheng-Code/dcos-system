"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { nodeTypeLabel } from "./wbs-builder-types";
import {
  getWbsVersion,
  listWbsVersions,
  restoreWbsVersion,
  saveWbsVersion,
  type WbsVersionSnapshot,
  type WbsVersionSnapshotNode,
  type WbsVersionSummary,
} from "@/lib/wbs-version-service";
import { getProfileById } from "@/lib/project/wbs/wbs-queries";

interface WbsVersionsDialogProps {
  onClose: () => void;
  projectId: string;
  initialMode?: "save" | "list";
  /** Called after a successful save or restore so the grid can reload. */
  onChanged: () => void;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return d.toLocaleDateString();
}

/** Plain recursive indented preview of a snapshot's node list. */
function SnapshotTree({ nodes }: { nodes: WbsVersionSnapshotNode[] }) {
  const childrenByParent = useMemo(() => {
    const known = new Set(nodes.map((n) => n.id));
    const map = new Map<string | null, WbsVersionSnapshotNode[]>();
    for (const n of nodes) {
      const key = n.parent_id && known.has(n.parent_id) ? n.parent_id : null;
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.wbs_code.localeCompare(b.wbs_code));
    }
    return map;
  }, [nodes]);

  const render = (parentId: string | null, depth: number): React.ReactNode =>
    (childrenByParent.get(parentId) ?? []).map((n) => (
      <div key={n.id}>
        <div
          className="flex items-center gap-2 border-b border-border/40 py-1 text-xs"
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <span className="font-mono text-[11px] text-muted-foreground">{n.wbs_code}</span>
          <span className="truncate font-medium">{n.wbs_name}</span>
          <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {nodeTypeLabel(n.node_type)}
          </span>
        </div>
        {render(n.id, depth + 1)}
      </div>
    ));

  if (nodes.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">This version has no nodes.</p>;
  }
  return <div>{render(null, 0)}</div>;
}

export function WbsVersionsDialog({
  onClose,
  projectId,
  initialMode = "list",
  onChanged,
}: WbsVersionsDialogProps) {
  const [versions, setVersions] = useState<WbsVersionSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WbsVersionSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const [name, setName] = useState(() => `WBS as of ${new Date().toISOString().slice(0, 10)}`);
  const [saving, setSaving] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [deleteExtras, setDeleteExtras] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      setVersions(await listWbsVersions(projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load versions");
    } finally {
      setLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await listWbsVersions(projectId);
        if (!cancelled) setVersions(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load versions");
      } finally {
        if (!cancelled) setLoadingList(false);
      }

      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: profile } = await getProfileById(uid, "role");
      if (!cancelled) setIsAdmin((profile as { role?: string } | null)?.role === "admin");
    })();

    if (initialMode === "save") {
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }

    return () => {
      cancelled = true;
    };
  }, [projectId, initialMode]);

  const selectVersion = useCallback((id: string) => {
    setSelectedId(id);
    setSnapshot(null);
    setConfirming(false);
    setLoadingSnapshot(true);
    getWbsVersion(id)
      .then(setSnapshot)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load version"))
      .finally(() => setLoadingSnapshot(false));
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveWbsVersion(projectId, name);
      toast.success(`Version "${name.trim()}" saved`);
      onChanged();
      await refreshList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save version");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (!selectedId || !snapshot) return;
    setRestoring(true);
    try {
      const r = await restoreWbsVersion(projectId, selectedId, {
        deleteNodesNotInSnapshot: isAdmin && deleteExtras,
      });
      const parts: string[] = [];
      if (r.inserted) parts.push(`${r.inserted} added back`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.deleted) parts.push(`${r.deleted} deleted`);
      if (r.skippedExtra) parts.push(`${r.skippedExtra} left untouched`);
      toast.success(
        `Restored to "${snapshot.baseline_name}"${parts.length ? ` — ${parts.join(", ")}` : ""}`,
      );
      setConfirming(false);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restore version");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> WBS Versions
          </DialogTitle>
          <DialogDescription>
            Snapshot the current structure, or restore a saved one. Restore is non-destructive —
            nodes added since a snapshot are kept.
          </DialogDescription>
        </DialogHeader>

        {/* Save row */}
        <div className="flex items-end gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Save current structure as a new version
            </label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Version name"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        </div>

        {/* List + preview */}
        <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-3">
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No versions saved yet.</p>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVersion(v.id)}
                  className={cn(
                    "block w-full border-b border-border/50 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted",
                    selectedId === v.id && "bg-primary/5",
                  )}
                >
                  <div className="truncate font-medium">{v.baseline_name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {relTime(v.created_at)} · {v.node_count} node{v.node_count === 1 ? "" : "s"}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {!selectedId ? (
              <p className="p-4 text-xs text-muted-foreground">
                Select a version on the left to preview its structure.
              </p>
            ) : loadingSnapshot ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : snapshot ? (
              <SnapshotTree nodes={snapshot.nodes} />
            ) : null}
          </div>
        </div>

        {/* Restore */}
        {selectedId && snapshot && (
          <div className="rounded-lg border border-border p-3">
            {!confirming ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Restore the project structure to <strong>{snapshot.baseline_name}</strong>.
                </p>
                <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore…
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs">
                  This updates codes, names, parents and order of existing nodes to match the
                  snapshot, and recreates nodes deleted since (empty — their tasks were already
                  removed). Nodes added since are kept.
                </p>
                {isAdmin && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={deleteExtras}
                      onChange={(e) => setDeleteExtras(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Also delete nodes not in this version (removes their tasks &amp; costs)
                  </label>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                    disabled={restoring}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleRestore} disabled={restoring}>
                    {restoring && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Confirm restore
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
