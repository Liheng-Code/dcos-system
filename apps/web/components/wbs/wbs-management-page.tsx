"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, FileSpreadsheet, FolderTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { MasterWbsImportDialog } from "@/components/wbs/master-wbs-import-dialog";
import { WbsNodeWorkspace } from "@/components/wbs/wbs-node-workspace";
import { WbsBuilder, type WbsBuilderApi } from "@/components/wbs/builder/wbs-builder";
import type { WbsBuilderNode } from "@/components/wbs/builder/wbs-builder-types";
import { type WbsNodeRecord, type WbsNodeData, type WbsTaskRecord } from "@/components/wbs/wbs-types";
import { cn } from "@/lib/utils";

function toWbsNodeData(n: WbsNodeRecord): WbsNodeData {
  return {
    id: n.id,
    wbs_code: n.wbs_code,
    wbs_name: n.wbs_name,
    node_type: n.node_type,
    full_path: n.full_path,
    sort_order: n.sort_order ?? 0,
    progress_percent: n.progress_percent,
    status: n.status,
    budget_cost: n.budget_cost,
    actual_cost: n.actual_cost,
    planned_hours: n.planned_hours,
    actual_hours: n.actual_hours,
    children: [],
  };
}

export function WbsManagementPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject, loading: projectsLoading } = useProject();

  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [tasks, setTasks] = useState<WbsTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMasterImport, setShowMasterImport] = useState(false);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // The builder's own copy of the clicked node — lets the panel render instantly
  // for a row the page's own fetch hasn't caught up with yet.
  const [pendingNode, setPendingNode] = useState<WbsBuilderNode | null>(null);

  const builderApiRef = useRef<WbsBuilderApi | null>(null);

  const refreshAll = useCallback(async () => {
    if (!selectedProjectId) return;
    const [nodesRes, tasksRes] = await Promise.all([
      supabase
        .from("wbs_nodes")
        .select("*")
        .eq("project_id", selectedProjectId)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("wbs_tasks")
        .select("*")
        .eq("project_id", selectedProjectId)
        .order("sort_order", { ascending: true, nullsFirst: false }),
    ]);
    setNodes((nodesRes.data ?? []) as WbsNodeRecord[]);
    setTasks((tasksRes.data ?? []) as WbsTaskRecord[]);
  }, [selectedProjectId, supabase]);

  useEffect(() => {
    if (!selectedProjectId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setNodes([]);
      setTasks([]);
      setDetailNodeId(null);
      setPanelOpen(false);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setLoading(true);
    refreshAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, refreshAll]);

  const handleOpenDetails = useCallback(
    (nodeId: string, node?: WbsBuilderNode) => {
      // Fired on every row click — show the panel instantly from data already in
      // memory and refresh node/task detail in the background (don't await).
      setDetailNodeId(nodeId);
      setPendingNode(node ?? null);
      setPanelOpen(true);
      void refreshAll();
    },
    [refreshAll],
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setDetailNodeId(null);
    setPendingNode(null);
  }, []);

  const selectedRecord = useMemo<WbsNodeRecord | null>(() => {
    const fromPage = nodes.find((n) => n.id === detailNodeId);
    if (fromPage) return fromPage;
    // Row not yet in the page's own fetch (e.g. just created in the builder) —
    // fall back to the builder's copy so the panel shows without a flash.
    if (pendingNode && pendingNode.id === detailNodeId) {
      return {
        id: pendingNode.id,
        project_id: pendingNode.project_id,
        parent_id: pendingNode.parent_id,
        node_type: pendingNode.node_type,
        wbs_code: pendingNode.wbs_code,
        wbs_name: pendingNode.wbs_name,
        full_path: pendingNode.full_path,
        sort_order: pendingNode.sort_order,
        progress_percent: pendingNode.progress_percent,
        status: pendingNode.status,
      };
    }
    return null;
  }, [nodes, detailNodeId, pendingNode]);
  const selectedNodeData = useMemo(
    () => (selectedRecord ? toWbsNodeData(selectedRecord) : null),
    [selectedRecord],
  );
  const filteredTasks = useMemo(
    () => tasks.filter((t) => t.wbs_node_id === detailNodeId),
    [tasks, detailNodeId],
  );

  // The detail node is "effectively locked" when it, or any ancestor, carries
  // is_locked — matches the DB helper wbs_node_effectively_locked().
  const detailLocked = useMemo(() => {
    if (!detailNodeId) return false;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    let cur = byId.get(detailNodeId);
    while (cur && !seen.has(cur.id)) {
      if (cur.is_locked) return true;
      seen.add(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return false;
  }, [nodes, detailNodeId]);

  if (projectsLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <FolderTree className="h-12 w-12" />
        <p className="text-sm">Select a project from the header to build its WBS</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedProject?.project_type === "tender" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <FolderTree className="h-4 w-4 shrink-0" />
          <span>
            <strong>Preliminary structure — tender phase.</strong> This project hasn&apos;t been
            awarded yet. When it&apos;s assigned to a post-contract project, you&apos;ll be offered a
            one-time option to copy this structure into the new project — it does not happen
            automatically, and edits made here afterward will not sync to the post-contract project.
          </span>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / WBS Management</div>
          <h1 className="text-xl font-bold tracking-tight">Project Breakdown Builder</h1>
          {selectedProject && (
            <div className="mt-2 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="shrink-0 text-xs font-medium text-slate-600">Project Progress</span>
              <div className="h-2 max-w-48 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${selectedProject.progress_percentage ?? 0}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-700">
                {selectedProject.progress_percentage ?? 0}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setShowMasterImport(true)}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Import Master WBS
          </Button>
        </div>
      </header>

      <main
        className={cn(
          "grid grid-cols-1 items-start gap-4",
          panelOpen && "xl:grid-cols-[minmax(0,1fr)_440px]",
        )}
      >
        <section className="flex min-w-0 flex-col overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <WbsBuilder
            projectId={selectedProjectId}
            project={selectedProject}
            onOpenDetails={handleOpenDetails}
            registerApi={(api) => {
              builderApiRef.current = api;
            }}
            onDataChanged={() => {
              if (panelOpen) refreshAll();
            }}
          />
        </section>

        {panelOpen && (
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <h2 className="text-sm font-semibold">Node details</h2>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close details panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {selectedNodeData ? (
                <WbsNodeWorkspace
                  key={selectedNodeData.id}
                  node={selectedNodeData}
                  nodeRecord={selectedRecord}
                  tasks={filteredTasks}
                  onSave={refreshAll}
                  locked={detailLocked}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <FolderTree className="mb-2 h-10 w-10" />
                  <p className="text-xs">That node is no longer available.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </main>

      {showMasterImport && (
        <MasterWbsImportDialog
          projectId={selectedProjectId}
          onClose={() => setShowMasterImport(false)}
          onImported={() => {
            refreshAll();
            builderApiRef.current?.reload();
          }}
        />
      )}
    </div>
  );
}
