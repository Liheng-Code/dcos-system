"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { deleteWbsNodeById, listWbsNodeQuantitiesByWbsNodeIds, listWbsNodeQuantitiesByWbsNodeIdsWithMetricCodeGFA, listWbsNodesByProjectIdNullsLast } from "@/lib/project/wbs/wbs-queries";
import { Tree, type NodeApi } from "react-arborist";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Layers,
  Grid3X3,
  DoorOpen,
  Puzzle,
  Wrench,
  FolderTree,
  CalendarRange,
  AlertCircle,
  Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { WbsNodeEditSheet, type WbsNodeRecord } from "@/components/project/wbs/wbs-node-edit-sheet";
import { ProjectSiteAreaDialog } from "@/components/project/wbs/project-site-area-dialog";
import { GfaInlineEditor } from "@/components/project/wbs/gfa-inline-editor";
import { GfaRollup } from "@/components/project/wbs/gfa-rollup";
import { ApplyLevelTemplateDialog } from "@/components/project/wbs/levels/apply-level-template-dialog";

interface WbsNodeData {
  id: string;
  wbs_code: string;
  wbs_name: string;
  node_type: string;
  full_path: string | null;
  sort_order: number;
  progress_percent: number;
  status: string;
  is_below_ground: boolean;
  is_external_works: boolean;
  gfa_value?: number | null;
  gfa_source?: string | null;
  children: WbsNodeData[];
}

const NODE_ICONS: Record<string, typeof Building2> = {
  phase: CalendarRange,
  building: Building2,
  level: Layers,
  zone: Grid3X3,
  room: DoorOpen,
  element: Puzzle,
  discipline: Wrench,
  task_group: FolderTree,
};

const NODE_COLORS: Record<string, string> = {
  phase: "text-violet-600",
  building: "text-blue-500",
  level: "text-emerald-500",
  zone: "text-amber-500",
  room: "text-purple-500",
  element: "text-cyan-500",
  discipline: "text-rose-500",
  task_group: "text-gray-500",
};

function buildTree(
  nodes: WbsNodeRecord[],
  gfaMap: Map<string, { value: number; source: string | null }>,
): WbsNodeData[] {
  const map = new Map<string, WbsNodeData>();
  const roots: WbsNodeData[] = [];

  for (const n of nodes) {
    const gfa = gfaMap.get(n.id);
    map.set(n.id, {
      id: n.id,
      wbs_code: n.wbs_code,
      wbs_name: n.wbs_name,
      node_type: n.node_type,
      full_path: n.full_path,
      sort_order: n.sort_order ?? 0,
      progress_percent: n.progress_percent,
      status: n.status,
      is_below_ground: n.is_below_ground ?? false,
      is_external_works: n.is_external_works ?? false,
      gfa_value: gfa?.value ?? null,
      gfa_source: gfa?.source ?? null,
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

  function sortNodes(list: WbsNodeData[]) {
    list.sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      return a.wbs_code.localeCompare(b.wbs_code);
    });
    for (const node of list) {
      sortNodes(node.children);
    }
  }
  sortNodes(roots);

  return roots;
}

function calculateRollups(nodes: WbsNodeData[]): void {
  for (const node of nodes) {
    calculateRollups(node.children);

    if (node.node_type === "building" && node.children.length > 0) {
      let totalGfa = 0;
      let hasAnyGfa = false;
      for (const child of node.children) {
        if (child.gfa_value != null && child.gfa_value > 0) {
          totalGfa += child.gfa_value;
          hasAnyGfa = true;
        }
      }
      if (hasAnyGfa) {
        node.gfa_value = totalGfa;
      }
    }
  }
}

function deleteFromTree(nodes: WbsNodeData[], id: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (deleteFromTree(nodes[i].children, id)) return true;
  }
  return false;
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

function updateNodeInTree(
  nodes: WbsNodeData[],
  id: string,
  updates: Partial<Pick<WbsNodeData, "gfa_value" | "gfa_source">>,
): boolean {
  for (const node of nodes) {
    if (node.id === id) {
      Object.assign(node, updates);
      return true;
    }
    if (updateNodeInTree(node.children, id, updates)) return true;
  }
  return false;
}

export function WbsTreePage() {
  const { selectedProjectId, loading: projectsLoading } = useProject();
  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState<WbsNodeData[]>([]);
  const [selectedNode, setSelectedNode] = useState<WbsNodeData | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNodeRecord | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [showSiteArea, setShowSiteArea] = useState(false);
  const [applyLevelsFor, setApplyLevelsFor] = useState<WbsNodeData | null>(null);

  const fetchGfaData = useCallback(async (nodeRecords: WbsNodeRecord[]): Promise<Map<string, { value: number; source: string | null }>> => {
    const gfaMap = new Map<string, { value: number; source: string | null }>();
    const levelNodes = nodeRecords.filter((n) => n.node_type === "level");
    if (levelNodes.length === 0) return gfaMap;

    try {
      const nodeIds = levelNodes.map((n) => n.id);

      // Try with metric_code filter first
      let { data, error } = await listWbsNodeQuantitiesByWbsNodeIdsWithMetricCodeGFA(nodeIds);

      // Fallback: try without metric_code filter
      if (error) {
        const retry = await listWbsNodeQuantitiesByWbsNodeIds(nodeIds);
        data = retry.data;
      }

      if (data) {
        for (const row of data) {
          gfaMap.set(row.wbs_node_id, {
            value: Number(row.value ?? 0),
            source: null,
          });
        }
      }
    } catch {
      // Table may not have expected schema yet — silently skip
    }
    return gfaMap;
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodes([]);
      setTreeData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listWbsNodesByProjectIdNullsLast(selectedProjectId).then(async ({ data }) => {
      const records = (data ?? []) as WbsNodeRecord[];
      setNodes(records);
      const gfaMap = await fetchGfaData(records);
      const tree = buildTree(records, gfaMap);
      calculateRollups(tree);
      setTreeData(tree);
      setLoading(false);
    });
  }, [selectedProjectId, fetchGfaData]);

  async function refreshTree() {
    if (!selectedProjectId) return;
    const { data } = await listWbsNodesByProjectIdNullsLast(selectedProjectId);
    const records = (data ?? []) as WbsNodeRecord[];
    setNodes(records);
    const gfaMap = await fetchGfaData(records);
    const tree = buildTree(records, gfaMap);
    calculateRollups(tree);
    setTreeData(tree);
  }

  const selectedRecord = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find((n) => n.id === selectedNode.id) ?? null;
  }, [selectedNode, nodes]);

  async function handleDelete(id: string) {
    const count = countDescendants(treeData, id);
    const msg = count > 0
      ? `Delete this node and all ${count} descendants?`
      : "Delete this node?";
    if (!confirm(msg)) return;

    const { error } = await deleteWbsNodeById(id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Node deleted");
      if (selectedNode?.id === id) setSelectedNode(null);
      refreshTree();
    }
  }

  function NodeRow({ node }: { node: NodeApi<WbsNodeData> }) {
    const data = node.data;
    const Icon = NODE_ICONS[data.node_type] ?? FolderTree;
    const iconColor = NODE_COLORS[data.node_type] ?? "text-gray-500";

    const childLevelCount = data.node_type === "building"
      ? data.children.filter((c) => c.node_type === "level").length
      : 0;

    return (
      <div
        style={{ paddingLeft: node.level * 20 }}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group",
          node.isSelected ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); node.toggle(); }}
          className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {node.isInternal ? (
            <span className="text-xs">{node.isOpen ? "▼" : "▶"}</span>
          ) : (
            <span className="text-xs text-transparent">●</span>
          )}
        </button>

        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />

        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {data.wbs_code}
        </span>

        <span className="text-sm font-medium truncate">
          {data.wbs_name}
        </span>

        <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-muted">
          {data.node_type}
        </span>

        {data.is_below_ground && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-600">Basement</span>
        )}
        {data.is_external_works && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-700">External Works</span>
        )}

        {data.status !== "active" && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full",
            data.status === "on_hold" ? "bg-amber-500/10 text-amber-600" : "bg-gray-500/10 text-gray-500",
          )}>
            <AlertCircle className="h-3 w-3" />
            {data.status.replace(/_/g, " ")}
          </span>
        )}

        {data.node_type === "level" && (
          <GfaInlineEditor
            wbsNodeId={data.id}
            nodeType={data.node_type}
            gfaValue={data.gfa_value}
            gfaSource={data.gfa_source}
            onSaved={(value, source) => {
              setTreeData((prev) => {
                const next = JSON.parse(JSON.stringify(prev)) as WbsNodeData[];
                updateNodeInTree(next, data.id, { gfa_value: value, gfa_source: source });
                calculateRollups(next);
                return next;
              });
            }}
          />
        )}

        {data.node_type === "building" && childLevelCount > 0 && (
          <GfaRollup totalGfa={data.gfa_value ?? null} childCount={childLevelCount} />
        )}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {selectedNode?.id === data.id && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditingNode(selectedRecord); setShowEdit(true); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAddingChild(true); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Add child"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {data.node_type === "building" && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setApplyLevelsFor(data); }}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Add levels from template"
                >
                  <Layers className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDelete(data.id); }}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading || projectsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedProjectId && (
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowSiteArea(true)}>
            <Ruler className="mr-1.5 h-3.5 w-3.5" />
            Site Area
          </Button>
        </div>
      )}
      {!selectedProjectId ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <FolderTree className="h-12 w-12" />
          <p className="text-sm">Select a project from the header to view its WBS</p>
        </div>
      ) : treeData.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
          <FolderTree className="h-12 w-12" />
          <p className="text-sm">No WBS nodes yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditingNode(null); setShowEdit(true); }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create First Node
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background">
          <div className="p-1">
            <Tree
              data={treeData}
              idAccessor="id"
              childrenAccessor={(d) => d.children}
              rowHeight={36}
              indent={0}
              padding={4}
              onSelect={(nodes) => {
                setSelectedNode(nodes[0]?.data ?? null);
              }}
              className="w-full"
            >
              {(props) => <NodeRow node={props.node} />}
            </Tree>
          </div>
        </div>
      )}

      {selectedNode && selectedProjectId && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{selectedNode.wbs_code}</span>
              <span className="font-medium">{selectedNode.wbs_name}</span>
              <span className="text-xs text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">
                {selectedNode.node_type}
              </span>
              <span className="text-xs text-muted-foreground">
                Path: {selectedNode.full_path ?? "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedNode.node_type === "building" && (
                <Button variant="outline" size="sm" onClick={() => setApplyLevelsFor(selectedNode)}>
                  <Layers className="mr-1 h-3.5 w-3.5" />
                  Add Levels from Template
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddingChild(true); }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Child
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {nodes.length} node{nodes.length !== 1 ? "s" : ""} in this project
      </p>

      {/* Edit / Create Sheet */}
      {(showEdit || addingChild) && (
        <WbsNodeEditSheet
          node={showEdit ? editingNode : null}
          projectId={selectedProjectId}
          parentId={addingChild && selectedNode ? selectedNode.id : null}
          onClose={() => { setShowEdit(false); setAddingChild(false); setEditingNode(null); }}
          onSave={() => { setShowEdit(false); setAddingChild(false); setEditingNode(null); refreshTree(); }}
        />
      )}

      {applyLevelsFor && (
        <ApplyLevelTemplateDialog
          buildings={nodes.filter((n) => n.node_type === "building")}
          initialBuildingId={applyLevelsFor.id}
          open
          onOpenChange={(open) => { if (!open) setApplyLevelsFor(null); }}
          onApplied={() => refreshTree()}
        />
      )}

      {showSiteArea && selectedProjectId && (
        <ProjectSiteAreaDialog
          projectId={selectedProjectId}
          onClose={() => setShowSiteArea(false)}
        />
      )}
    </div>
  );
}
