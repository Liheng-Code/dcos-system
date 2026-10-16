"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listWbsNodesByProjectIdNullsLast, listWbsTasksByProjectIdOrderedBySortOrder } from "@/lib/project/wbs/wbs-queries";
import { Loader2, FolderTree, X } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { WbsNodeWorkspace } from "@/components/project/wbs/wbs-node-workspace";
import { WbsBuilder, type WbsBuilderApi } from "@/components/project/wbs/builder/wbs-builder";
import type { WbsBuilderNode } from "@/components/project/wbs/builder/wbs-builder-types";
import { type WbsNodeRecord, type WbsNodeData, type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
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
  const { selectedProjectId, selectedProject, loading: projectsLoading } = useProject();

  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [tasks, setTasks] = useState<WbsTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // The builder's own copy of the clicked node — lets the panel render instantly
  // for a row the page's own fetch hasn't caught up with yet.
  const [pendingNode, setPendingNode] = useState<WbsBuilderNode | null>(null);

  const builderApiRef = useRef<WbsBuilderApi | null>(null);

  const refreshAll = useCallback(async () => {
    if (!selectedProjectId) return;
    const [nodesRes, tasksRes] = await Promise.all([
      listWbsNodesByProjectIdNullsLast(selectedProjectId),
      listWbsTasksByProjectIdOrderedBySortOrder(selectedProjectId),
    ]);
    setNodes((nodesRes.data ?? []) as WbsNodeRecord[]);
    setTasks((tasksRes.data ?? []) as WbsTaskRecord[]);
  }, [selectedProjectId]);

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

  // While the panel is open it follows the selected row; a closed panel stays closed.
  const handleRowSelected = useCallback(
    (nodeId: string, node?: WbsBuilderNode) => {
      if (!panelOpen) return;
      setDetailNodeId(nodeId);
      setPendingNode(node ?? null);
    },
    [panelOpen],
  );

  const handleOpenDetails = useCallback(
    (nodeId: string, node?: WbsBuilderNode) => {
      // Opened on request (details button, # double-click, activity row) — show the panel
      // instantly from data in memory and refresh node/task detail in the background.
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
    <div className="flex flex-col gap-2.5">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-sm font-bold tracking-tight text-slate-900">Project Breakdown Builder</h1>
          <span className="text-[11px] font-medium text-slate-400">DCOS / WBS Management</span>
        </div>
        {selectedProject && (
          <div className="flex items-center gap-2.5 rounded-md border border-slate-200/80 bg-slate-50 px-2.5 py-1">
            <span className="shrink-0 text-[11px] font-medium text-slate-600">Project Progress</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${selectedProject.progress_percentage ?? 0}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-slate-700">
              {selectedProject.progress_percentage ?? 0}%
            </span>
          </div>
        )}
      </header>

      <main
        className={cn(
          "grid grid-cols-1 items-start gap-3",
          panelOpen && "xl:grid-cols-[minmax(0,1fr)_440px]",
        )}
      >
        <section className="flex min-w-0 flex-col overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <WbsBuilder
            projectId={selectedProjectId}
            project={selectedProject}
            onOpenDetails={handleOpenDetails}
            onRowSelected={handleRowSelected}
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

    </div>
  );
}
