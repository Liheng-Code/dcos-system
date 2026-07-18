"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Plus,
  BellRing, UploadCloud, FolderTree,
  ChevronsDownUp, ChevronsUpDown, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { WbsNodeEditSheet } from "@/components/wbs/wbs-node-edit-sheet";
import { WbsImportDialog } from "@/components/wbs/wbs-import-dialog";
import { WbsNodeWorkspace } from "@/components/wbs/wbs-node-workspace";
import { type WbsNodeRecord, type WbsNodeData, type WbsTaskRecord, type WbsAuditLogRecord } from "@/components/wbs/wbs-types";
import { Tree, type NodeApi, type TreeApi } from "react-arborist";
import { cn } from "@/lib/utils";
import { Building2, Layers, Grid3X3, DoorOpen, Puzzle, Wrench, FolderTree as FolderTreeIcon, CalendarRange, AlertCircle, Pencil, Trash2, Copy } from "lucide-react";

const NODE_ICONS: Record<string, typeof Building2> = {
  project: Building2,
  phase: CalendarRange,
  building: Building2,
  level: Layers,
  zone: Grid3X3,
  room: DoorOpen,
  element: Puzzle,
  discipline: Wrench,
  task_group: FolderTreeIcon,
};

const NODE_COLORS: Record<string, string> = {
  project: "text-slate-700",
  phase: "text-violet-600",
  building: "text-blue-500",
  level: "text-emerald-500",
  zone: "text-amber-500",
  room: "text-purple-500",
  element: "text-cyan-500",
  discipline: "text-rose-500",
  task_group: "text-gray-500",
};

function buildTree(nodes: WbsNodeRecord[]): WbsNodeData[] {
  const map = new Map<string, WbsNodeData>();
  const roots: WbsNodeData[] = [];

  for (const n of nodes) {
    map.set(n.id, {
      id: n.id,
      wbs_code: n.wbs_code,
      wbs_name: n.wbs_name,
      node_type: n.node_type,
      full_path: n.full_path,
      progress_percent: n.progress_percent,
      status: n.status,
      budget_cost: n.budget_cost,
      actual_cost: n.actual_cost,
      planned_hours: n.planned_hours,
      actual_hours: n.actual_hours,
      children: [],
    });
  }

  for (const n of nodes) {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function buildProjectTree(
  nodes: WbsNodeRecord[],
  project: { id: string; project_code: string; project_name: string; project_status: string; progress_percentage?: number } | null,
): WbsNodeData[] {
  const roots = buildTree(nodes);
  if (!project) return roots;

  return [{
    id: getProjectRootId(project.id),
    wbs_code: project.project_code,
    wbs_name: project.project_name,
    node_type: "project",
    full_path: project.project_code,
    progress_percent: project.progress_percentage ?? 0,
    status: project.project_status,
    children: roots,
  }];
}

function NodeRow({ node, selectedId, onSelect, onEdit, onDelete, onDuplicate, dragHandle }: {
  node: NodeApi<WbsNodeData>;
  selectedId: string | null;
  onSelect: (d: WbsNodeData, id: string) => void;
  onEdit: (d: WbsNodeRecord) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  dragHandle?: (el: HTMLDivElement | null) => void;
}) {
  const data = node.data;
  const Icon = NODE_ICONS[data.node_type] ?? FolderTreeIcon;
  const iconColor = NODE_COLORS[data.node_type] ?? "text-gray-500";
  const active = selectedId === data.id;
  const projectRoot = isProjectRootId(data.id);

  return (
    <div
      ref={projectRoot ? undefined : dragHandle}
      style={{ paddingLeft: node.level * 16 }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors group cursor-pointer",
        active ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-700",
        node.isDragging && "opacity-50",
        node.willReceiveDrop && "bg-slate-100 ring-1 ring-slate-300",
      )}
      onClick={() => { node.select(); onSelect(data, node.id); }}
      title={projectRoot ? "Selected project" : "Drag to reorder or change WBS level"}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); node.toggle(); }}
        className="h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground"
        aria-label={node.isOpen ? `Collapse ${data.wbs_name}` : `Expand ${data.wbs_name}`}
      >
        {node.isInternal ? (
          <span className="text-[10px]">{node.isOpen ? "▼" : "▶"}</span>
        ) : (
          <span className="text-[10px] text-transparent">●</span>
        )}
      </button>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white" : iconColor)} />
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{data.wbs_code}</span>
      <span className="text-xs font-medium truncate flex-1 min-w-0" title={data.wbs_name}>{data.wbs_name}</span>
      {active && !projectRoot && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(data.id); }} className="p-0.5 rounded text-white/70 hover:text-white hover:bg-white/20" aria-label={`Duplicate ${data.wbs_name}`}><Copy className="h-3 w-3" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onEdit({ ...data, project_id: "", parent_id: null, sort_order: 0 } as WbsNodeRecord); }} className="p-0.5 rounded text-white/70 hover:text-white hover:bg-white/20" aria-label={`Edit ${data.wbs_name}`}><Pencil className="h-3 w-3" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(data.id); }} className="p-0.5 rounded text-red-300 hover:text-red-200 hover:bg-red-500/30" aria-label={`Delete ${data.wbs_name}`}><Trash2 className="h-3 w-3" /></button>
        </div>
      )}
      <span className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
        active ? "bg-white/20 text-white/80" : "bg-slate-100 text-slate-500",
      )}>
        {data.progress_percent}%
      </span>
    </div>
  );
}

export function WbsManagementPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject, loading: projectsLoading } = useProject();

  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [tasks, setTasks] = useState<WbsTaskRecord[]>([]);
  const [, setAuditLogs] = useState<WbsAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState<WbsNodeData[]>([]);
  const [selectedNode, setSelectedNode] = useState<WbsNodeData | null>(null);

  const [showNodeEdit, setShowNodeEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNodeRecord | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [movingNode, setMovingNode] = useState(false);
  const [treePanelCollapsed, setTreePanelCollapsed] = useState(false);

  const treeRef = useRef<TreeApi<WbsNodeData>>(null);

  const selectedRecord = useMemo(() => {
    if (!selectedNode) return null;
    if (isProjectRootId(selectedNode.id)) return null;
    return nodes.find((n) => n.id === selectedNode.id) ?? null;
  }, [selectedNode, nodes]);

  const filteredTasks = useMemo(() => {
    if (!selectedNode || isProjectRootId(selectedNode.id)) return [];
    return tasks.filter((t) => t.wbs_node_id === selectedNode.id);
  }, [tasks, selectedNode]);
  const selectedIsProjectRoot = !!selectedNode && isProjectRootId(selectedNode.id);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodes([]);
      setTreeData([]);
      setTasks([]);
      setAuditLogs([]);
      setLoading(false);
      return;
    }
    if (!selectedProject) return;

    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("wbs_nodes").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("wbs_tasks").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("wbs_audit_log").select("*").eq("project_id", selectedProjectId).order("created_at", { ascending: false }).limit(20),
    ]).then(([nodesRes, tasksRes, auditRes]) => {
      if (cancelled) return;
      const nodeRecords = (nodesRes.data ?? []) as WbsNodeRecord[];
      const taskRecords = (tasksRes.data ?? []) as WbsTaskRecord[];
      const auditRecords = (auditRes.data ?? []) as WbsAuditLogRecord[];
      setNodes(nodeRecords);
      setTreeData(buildProjectTree(nodeRecords, selectedProject));
      setTasks(taskRecords);
      setAuditLogs(auditRecords);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedProjectId, selectedProject, supabase]);

  const refreshAll = useCallback(async () => {
    if (!selectedProjectId) return [];
    const [nodesRes, tasksRes, auditRes] = await Promise.all([
      supabase.from("wbs_nodes").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("wbs_tasks").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("wbs_audit_log").select("*").eq("project_id", selectedProjectId).order("created_at", { ascending: false }).limit(20),
    ]);
    const nodeRecords = (nodesRes.data ?? []) as WbsNodeRecord[];
    const taskRecords = (tasksRes.data ?? []) as WbsTaskRecord[];
    const auditRecords = (auditRes.data ?? []) as WbsAuditLogRecord[];
    setNodes(nodeRecords);
    setTreeData(buildProjectTree(nodeRecords, selectedProject));
    setTasks(taskRecords);
    setAuditLogs(auditRecords);
    return nodeRecords;
  }, [selectedProjectId, selectedProject, supabase]);

  async function handleDeleteNode(id: string) {
    const count = countDescendants(treeData, id);
    if (!confirm(`Delete this node and all ${count} descendants?`)) return;
    const { error } = await supabase.from("wbs_nodes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Node deleted"); if (selectedNode?.id === id) setSelectedNode(null); refreshAll(); }
  }

  async function handleDuplicateNode(id: string) {
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return;

    const descendants = getDescendantRecords(nodes, id);
    const allNodes = [sourceNode, ...descendants];

    const idMap = new Map<string, string>();
    for (const n of allNodes) {
      idMap.set(n.id, crypto.randomUUID());
    }

    const existingCodes = new Set(nodes.map((n) => n.wbs_code));

    const newRecords = allNodes.map((n) => {
      const newCode = generateUniqueWbsCode(n.wbs_code, existingCodes);
      existingCodes.add(newCode);
      const isRoot = n.id === id;
      return {
        id: idMap.get(n.id)!,
        project_id: sourceNode.project_id,
        parent_id: n.parent_id ? (idMap.get(n.parent_id) ?? n.parent_id) : null,
        node_type: n.node_type,
        wbs_code: newCode,
        wbs_name: isRoot ? n.wbs_name + " (copy)" : n.wbs_name,
        sort_order: n.sort_order,
        progress_percent: 0,
        status: "active",
      };
    });

    const { error } = await supabase.from("wbs_nodes").insert(newRecords);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Duplicated ${allNodes.length} node${allNodes.length > 1 ? "s" : ""}`);
      const refreshedNodes = await refreshAll();
      const newRootId = idMap.get(id);
      if (newRootId) {
        const newRootRecord = refreshedNodes.find((n) => n.id === newRootId);
        if (newRootRecord) {
          setSelectedNode(toWbsNodeData(newRootRecord));
          setTimeout(() => treeRef.current?.openParents(newRootId));
        }
      }
    }
  }

  const handleSelectNode = useCallback((node: WbsNodeData, id: string) => {
    setSelectedNode(node);
    treeRef.current?.openParents(id);
  }, []);

  const persistHierarchyMove = useCallback(async (nodeId: string, move: WbsHierarchyMove, successMessage: string) => {
    setMovingNode(true);
    try {
      const { error: parentError } = await supabase
        .from("wbs_nodes")
        .update({ parent_id: move.parentId, sort_order: move.sortOrder })
        .eq("id", nodeId);

      if (parentError) throw parentError;

      const orderUpdates = move.reorderedSiblings.filter((node) => node.id !== nodeId);
      for (const node of orderUpdates) {
        const { error } = await supabase
          .from("wbs_nodes")
          .update({ sort_order: node.sortOrder })
          .eq("id", node.id);
        if (error) throw error;
      }

      const touchIds = [nodeId, ...getDescendantIds(nodes, nodeId)];
      const touchedAt = new Date().toISOString();
      for (const id of touchIds) {
        const { error } = await supabase
          .from("wbs_nodes")
          .update({ updated_at: touchedAt })
          .eq("id", id);
        if (error) throw error;
      }

      const refreshedNodes = await refreshAll();
      const movedRecord = refreshedNodes.find((node) => node.id === nodeId);
      if (movedRecord) {
        setSelectedNode(toWbsNodeData(movedRecord));
        setTimeout(() => treeRef.current?.openParents(movedRecord.id));
      }
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update WBS hierarchy");
    } finally {
      setMovingNode(false);
    }
  }, [nodes, refreshAll, supabase]);

  const handleTreeMove = useCallback(async ({ dragIds, parentId, index }: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => {
    if (!selectedProjectId || movingNode || dragIds.length === 0) return;

    const nodeId = dragIds[0];
    const move = getDragDropMove(nodes, nodeId, parentId, index);
    if (!move) {
      toast.error("Unable to move WBS node to that location");
      return;
    }

    await persistHierarchyMove(nodeId, move, "WBS node moved");
  }, [movingNode, nodes, persistHierarchyMove, selectedProjectId]);

  if (loading || projectsLoading) {
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
        <p className="text-sm">Select a project from the header to view its WBS</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {selectedProject?.project_type === "tender" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <FolderTree className="h-4 w-4 shrink-0" />
          <span>
            <strong>Preliminary structure — tender phase.</strong> This project hasn&apos;t been awarded yet.
            When it&apos;s assigned to a post-contract project, you&apos;ll be offered a one-time option to copy
            this structure into the new project — it does not happen automatically, and edits made here
            afterward will not sync to the post-contract project.
          </span>
        </div>
      )}
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm border border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / WBS Management</div>
          <h1 className="text-xl font-bold tracking-tight">Project Breakdown Control Center</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            {selectedRecord ? selectedRecord.full_path ?? "—" : "Select a WBS node"}
          </div>
          {selectedProject && (
            <div className="mt-2 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium text-slate-600 shrink-0">Project Progress</span>
              <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden max-w-48">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${selectedProject.progress_percentage ?? 0}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                {selectedProject.progress_percentage ?? 0}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl"><BellRing className="mr-1.5 h-3.5 w-3.5" /> Alerts</Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowImport(true)}><UploadCloud className="mr-1.5 h-3.5 w-3.5" /> Import WBS</Button>
          <Button size="sm" className="rounded-xl bg-slate-900" onClick={() => { setEditingNode(null); setAddingChild(false); setShowNodeEdit(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Node
          </Button>
        </div>
      </header>

      {/* Main 2-column layout */}
      <main className={cn("grid grid-cols-1 gap-4 flex-1 min-h-0", treePanelCollapsed ? "xl:grid-cols-[48px_minmax(0,1fr)]" : "xl:grid-cols-[55%_minmax(0,1fr)]")}>
        {/* Left: WBS Tree */}
        <aside className={cn("rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col", treePanelCollapsed ? "items-center p-2" : "p-3")}>
          <div className={cn("mb-2 flex items-center shrink-0", treePanelCollapsed ? "flex-col gap-2 px-0" : "justify-between px-1")}>
            {treePanelCollapsed ? (
              <FolderTree className="h-4 w-4 text-slate-500" />
            ) : (
              <div>
                <h2 className="text-sm font-semibold">WBS Tree</h2>
                <p className="text-[10px] text-slate-500">Location → Element → Task</p>
              </div>
            )}
            <div className={cn("flex items-center gap-0.5", treePanelCollapsed && "flex-col")}>
              {!treePanelCollapsed && (
                <>
                  <button
                    type="button"
                    onClick={() => treeRef.current?.openAll()}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Expand All"
                    aria-label="Expand all WBS nodes"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => treeRef.current?.closeAll()}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Collapse All"
                    aria-label="Collapse all WBS nodes"
                  >
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg h-7 w-7"
                onClick={() => setTreePanelCollapsed((collapsed) => !collapsed)}
                title={treePanelCollapsed ? "Expand WBS Tree panel" : "Collapse WBS Tree panel"}
                aria-label={treePanelCollapsed ? "Expand WBS Tree panel" : "Collapse WBS Tree panel"}
                aria-expanded={!treePanelCollapsed}
              >
                {treePanelCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          {!treePanelCollapsed && <div className="scrollbar-hidden flex-1 overflow-y-auto min-h-0">
            {treeData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <FolderTree className="h-8 w-8 mb-2" />
                <p className="text-xs">No nodes yet</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-lg text-xs" onClick={() => { setEditingNode(null); setShowNodeEdit(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> Create First Node
                </Button>
              </div>
            ) : (
              <Tree
                ref={treeRef}
                data={treeData}
                idAccessor="id"
                childrenAccessor={(d) => d.children}
                rowHeight={32}
                indent={0}
                padding={2}
                disableMultiSelection
                disableDrag={(data) => movingNode || isProjectRootId(data.id)}
                disableDrop={({ parentNode, dragNodes }) => {
                  const dragId = dragNodes[0]?.id;
                  const targetParentId = normalizeArboristParentId(parentNode.id);
                  return !!dragId && !!targetParentId && (targetParentId === dragId || getDescendantIds(nodes, dragId).includes(targetParentId));
                }}
                onMove={handleTreeMove}
                onSelect={(nodes) => {
                  if (nodes[0]) {
                    handleSelectNode(nodes[0].data, nodes[0].id);
                  }
                }}
                width="100%"
                className="scrollbar-hidden w-full"
              >
                {(props) => (
                  <NodeRow
                    node={props.node}
                    selectedId={selectedNode?.id ?? null}
                    onSelect={(d, id) => { handleSelectNode(d, id); }}
                    onEdit={(d) => { setEditingNode(d); setShowNodeEdit(true); }}
                    onDelete={handleDeleteNode}
                    onDuplicate={handleDuplicateNode}
                    dragHandle={props.dragHandle}
                  />
                )}
              </Tree>
            )}
          </div>}
        </aside>

        {/* Center: Main View */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0">
          {/* Tabs + Node Info */}
          <div className="border-b border-slate-200 p-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">
                  {selectedNode ? `${selectedNode.wbs_code} · ${selectedNode.wbs_name}` : "Select a WBS node"}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedNode ? `${selectedNode.node_type} workspace · roll-up progress ${selectedNode.progress_percent}%` : "Choose a node from the tree to view details"}
                </p>
              </div>
            </div>
            {selectedNode && !selectedIsProjectRoot && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="flex justify-between text-[10px]"><span>Progress</span><span className="font-semibold">{selectedNode.progress_percent}%</span></div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-900" style={{ width: `${selectedNode.progress_percent}%` }} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-[10px]">
                  <div className="text-slate-500">Health</div>
                  <div className="mt-0.5 flex items-center gap-1 font-semibold">
                    {selectedNode.status === "on_hold" ? <AlertCircle className="h-3 w-3 text-amber-500" /> : <AlertCircle className="h-3 w-3 text-emerald-500" />}
                    {selectedNode.status === "on_hold" ? "On hold" : "Active"}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-[10px]">
                  <div className="text-slate-500">Quick filters</div>
                  <div className="mt-0.5 flex gap-1.5">
                    <span className="text-slate-600">Critical</span>
                    <span className="text-slate-600">Due</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* View content */}
          <div className="flex-1 overflow-auto p-3 min-h-0">
            {!selectedNode ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <FolderTree className="h-10 w-10 mb-2" />
                <p className="text-xs">Select a node from the tree</p>
              </div>
            ) : selectedIsProjectRoot ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700">Project Overview</h3>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Overall Progress</span>
                        <span className="font-semibold text-slate-700">{selectedNode.progress_percent}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${selectedNode.progress_percent}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="font-semibold text-slate-700">{(treeData[0]?.children ?? []).length}</div>
                      <div className="text-slate-500">Root Nodes</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="font-semibold text-slate-700">{tasks.filter(t => t.status === 'completed').length}</div>
                      <div className="text-slate-500">Tasks Done</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="font-semibold text-slate-700">{tasks.length}</div>
                      <div className="text-slate-500">Total Tasks</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <WbsNodeWorkspace key={selectedNode.id} node={selectedNode} nodeRecord={selectedRecord} tasks={filteredTasks} onSave={refreshAll} />
            )}
          </div>
        </section>
      </main>

      {showNodeEdit && (
          <WbsNodeEditSheet
            node={editingNode}
            projectId={selectedProjectId}
          parentId={addingChild && selectedNode && !isProjectRootId(selectedNode.id) ? selectedNode.id : null}
          onClose={() => { setShowNodeEdit(false); setEditingNode(null); setAddingChild(false); }}
          onSave={() => { setShowNodeEdit(false); setEditingNode(null); setAddingChild(false); refreshAll(); }}
        />
      )}

      {showImport && (
        <WbsImportDialog
          projectId={selectedProjectId}
          onClose={() => setShowImport(false)}
          onImported={refreshAll}
        />
      )}
    </div>
  );
}

function countDescendants(nodes: WbsNodeData[], id: string): number {
  for (const n of nodes) {
    if (n.id === id) return countAll(n.children);
    const c = countDescendants(n.children, id);
    if (c > 0) return c;
  }
  return 0;
}

function countAll(nodes: WbsNodeData[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countAll(n.children);
  return c;
}

type WbsHierarchyMove = {
  parentId: string | null;
  sortOrder: number;
  reorderedSiblings: Array<{ id: string; sortOrder: number }>;
};

function toWbsNodeData(node: WbsNodeRecord): WbsNodeData {
  return {
    id: node.id,
    wbs_code: node.wbs_code,
    wbs_name: node.wbs_name,
    node_type: node.node_type,
    full_path: node.full_path,
    progress_percent: node.progress_percent,
    status: node.status,
    budget_cost: node.budget_cost,
    actual_cost: node.actual_cost,
    planned_hours: node.planned_hours,
    actual_hours: node.actual_hours,
    children: [],
  };
}

function getDragDropMove(nodes: WbsNodeRecord[], id: string, parentId: string | null, index: number): WbsHierarchyMove | null {
  const selected = nodes.find((node) => node.id === id);
  if (!selected) return null;

  const nextParentId = normalizeArboristParentId(parentId);
  if (nextParentId === id || (nextParentId && getDescendantIds(nodes, id).includes(nextParentId))) return null;

  const sourceSiblingUpdates = reindexNodes(getOrderedSiblings(nodes, selected.parent_id).filter((node) => node.id !== id));
  const targetSiblings = getOrderedSiblings(nodes, nextParentId).filter((node) => node.id !== id);
  const insertIndex = Math.max(0, Math.min(index, targetSiblings.length));
  const nextTargetOrder = [
    ...targetSiblings.slice(0, insertIndex),
    selected,
    ...targetSiblings.slice(insertIndex),
  ];
  const targetSiblingUpdates = reindexNodes(nextTargetOrder);
  const selectedUpdate = targetSiblingUpdates.find((node) => node.id === id);

  if (!selectedUpdate) return null;

  return {
    parentId: nextParentId,
    sortOrder: selectedUpdate.sortOrder,
    reorderedSiblings: dedupeOrderUpdates([...sourceSiblingUpdates, ...targetSiblingUpdates]),
  };
}

function normalizeArboristParentId(parentId: string | null): string | null {
  if (parentId === "__REACT_ARBORIST_INTERNAL_ROOT__") return null;
  if (parentId && isProjectRootId(parentId)) return null;
  return parentId;
}

function getProjectRootId(projectId: string): string {
  return `project:${projectId}`;
}

function isProjectRootId(id: string): boolean {
  return id.startsWith("project:");
}

function getOrderedSiblings(nodes: WbsNodeRecord[], parentId: string | null): WbsNodeRecord[] {
  return nodes
    .filter((node) => node.parent_id === parentId)
    .sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      const byCode = a.wbs_code.localeCompare(b.wbs_code);
      if (byCode !== 0) return byCode;
      return a.id.localeCompare(b.id);
    });
}

function reindexNodes(nodes: WbsNodeRecord[]): Array<{ id: string; sortOrder: number }> {
  return nodes.map((node, index) => ({ id: node.id, sortOrder: index * 10 }));
}

function dedupeOrderUpdates(updates: Array<{ id: string; sortOrder: number }>): Array<{ id: string; sortOrder: number }> {
  const byId = new Map<string, { id: string; sortOrder: number }>();
  for (const update of updates) byId.set(update.id, update);
  return Array.from(byId.values());
}

function getDescendantIds(nodes: WbsNodeRecord[], id: string): string[] {
  const children = getOrderedSiblings(nodes, id);
  return children.flatMap((node) => [node.id, ...getDescendantIds(nodes, node.id)]);
}

function getDescendantRecords(nodes: WbsNodeRecord[], id: string): WbsNodeRecord[] {
  const children = nodes.filter((n) => n.parent_id === id);
  return children.flatMap((child) => [child, ...getDescendantRecords(nodes, child.id)]);
}

function generateUniqueWbsCode(baseCode: string, existingCodes: Set<string>): string {
  const candidate = baseCode + "-copy";
  if (!existingCodes.has(candidate)) return candidate;
  let counter = 2;
  while (existingCodes.has(baseCode + `-copy-${counter}`)) {
    counter++;
  }
  return baseCode + `-copy-${counter}`;
}
