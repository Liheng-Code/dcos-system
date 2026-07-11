"use client";

import { Building2, Layers, Grid3X3, DoorOpen, Puzzle, Wrench, FolderTree, CalendarRange, ChevronRight, ChevronDown, Pencil, Trash2, Plus, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { WbsTemplateNodeRecord } from "@/components/wbs/wbs-types";

const NODE_ICONS: Record<string, typeof Building2> = {
  location: MapPinned,
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
  location: "text-fuchsia-600",
  phase: "text-violet-500",
  building: "text-blue-500",
  level: "text-emerald-500",
  zone: "text-amber-500",
  room: "text-purple-500",
  element: "text-cyan-500",
  discipline: "text-rose-500",
  task_group: "text-gray-500",
};

function buildTree(nodes: WbsTemplateNodeRecord[]): WbsTemplateNodeRecord[] {
  const map = new Map<string, WbsTemplateNodeRecord>();
  const roots: WbsTemplateNodeRecord[] = [];
  for (const n of nodes) map.set(n.id, { ...n, children: [] });
  for (const n of nodes) {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function NodeRow({
  node,
  depth,
  editable,
  onAdd,
  onEdit,
  onDelete,
}: {
  node: WbsTemplateNodeRecord;
  depth: number;
  editable: boolean;
  onAdd?: (parentId: string) => void;
  onEdit?: (node: WbsTemplateNodeRecord) => void;
  onDelete?: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const Icon = NODE_ICONS[node.node_type] ?? FolderTree;
  const colorClass = NODE_COLORS[node.node_type] ?? "text-gray-500";
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50 cursor-pointer"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => setOpen((v) => !v)}
      >
        <button
          className="flex h-4 w-4 items-center justify-center flex-shrink-0 text-slate-400"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {hasChildren ? (
            open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", colorClass)} />
        <span className="text-xs font-mono text-slate-500 ml-0.5">{node.wbs_code}</span>
        <span className="text-xs text-slate-700 ml-1 flex-1 truncate">{node.wbs_name}</span>
        {editable && (
          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
            <button
              className="rounded p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              onClick={(e) => { e.stopPropagation(); onAdd?.(node.id); }}
              title="Add child node"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              className="rounded p-0.5 hover:bg-slate-200 text-slate-400 hover:text-blue-600"
              onClick={(e) => { e.stopPropagation(); onEdit?.(node); }}
              title="Edit node"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="rounded p-0.5 hover:bg-slate-200 text-slate-400 hover:text-red-600"
              onClick={(e) => { e.stopPropagation(); onDelete?.(node.id); }}
              title="Delete node"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {open && node.children?.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          editable={editable}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface TemplateNodeTreeProps {
  nodes: WbsTemplateNodeRecord[];
  editable?: boolean;
  onAdd?: (parentId: string | null) => void;
  onEdit?: (node: WbsTemplateNodeRecord) => void;
  onDelete?: (id: string) => void;
}

export function TemplateNodeTree({ nodes, editable = false, onAdd, onEdit, onDelete }: TemplateNodeTreeProps) {
  const tree = buildTree(nodes);

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <FolderTree className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No nodes yet</p>
        {editable && onAdd && (
          <button
            className="mt-3 text-xs text-blue-600 hover:underline"
            onClick={() => onAdd(null)}
          >
            + Add root node
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="select-none">
      {editable && onAdd && (
        <div className="px-2 pb-1">
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => onAdd(null)}
          >
            + Add root node
          </button>
        </div>
      )}
      {tree.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          depth={0}
          editable={editable}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
