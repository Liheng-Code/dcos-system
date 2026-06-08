"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { WbsNodeEditSheet, type WbsNodeRecord } from "@/components/wbs/wbs-node-edit-sheet";

interface WbsNodeData {
  id: string;
  wbs_code: string;
  wbs_name: string;
  node_type: string;
  full_path: string | null;
  progress_percent: number;
  status: string;
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
    // Keep DB sort_order; sort children recursively
    for (const node of list) {
      sortNodes(node.children);
    }
  }
  sortNodes(roots);

  return roots;
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

export function WbsTreePage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectsLoading } = useProject();
  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState<WbsNodeData[]>([]);
  const [selectedNode, setSelectedNode] = useState<WbsNodeData | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNodeRecord | null>(null);
  const [addingChild, setAddingChild] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodes([]);
      setTreeData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.from("wbs_nodes").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }).then(({ data }) => {
      const records = (data ?? []) as WbsNodeRecord[];
      setNodes(records);
      setTreeData(buildTree(records));
      setLoading(false);
    });
  }, [selectedProjectId, supabase]);

  function refreshTree() {
    if (!selectedProjectId) return;
    supabase.from("wbs_nodes").select("*").eq("project_id", selectedProjectId).order("sort_order", { ascending: true, nullsFirst: false }).then(({ data }) => {
      const records = (data ?? []) as WbsNodeRecord[];
      setNodes(records);
      setTreeData(buildTree(records));
    });
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

    const { error } = await supabase.from("wbs_nodes").delete().eq("id", id);
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

        {data.status !== "active" && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full",
            data.status === "on_hold" ? "bg-amber-500/10 text-amber-600" : "bg-gray-500/10 text-gray-500",
          )}>
            <AlertCircle className="h-3 w-3" />
            {data.status.replace(/_/g, " ")}
          </span>
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
    </div>
  );
}
