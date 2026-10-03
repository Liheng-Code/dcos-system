"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  FLOOR_BLOCK_LABELS,
  FLOOR_BLOCK_TYPES,
  floorTypeOf,
  nodeKeys,
  projectWbsToTemplate,
  suggestBlocks,
  type FloorBlockType,
  type SrcNode,
  type SrcTask,
  type ToTemplateOptions,
  type ToTemplateResult,
} from "@/lib/project/wbs/wbs-template";

const field = "h-8 rounded-md border border-border bg-background px-2 text-sm";

interface FloorBlockPickerProps {
  src: { nodes: SrcNode[]; tasks: SrcTask[] };
  value: ToTemplateOptions;
  onChange: (value: ToTemplateOptions) => void;
}

/** Converts a WBS into a template: choose the building node and which floor each block is copied from. */
export function FloorBlockPicker({ src, value, onChange }: FloorBlockPickerProps) {
  const keys = useMemo(() => nodeKeys(src.nodes), [src.nodes]);

  const children = useMemo(() => {
    const m = new Map<string, SrcNode[]>();
    for (const n of src.nodes) if (n.parent_id) m.set(n.parent_id, [...(m.get(n.parent_id) ?? []), n]);
    for (const list of m.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return m;
  }, [src.nodes]);

  // Activities under each node (including descendants).
  const taskCount = useMemo(() => {
    const direct = new Map<string, number>();
    for (const t of src.tasks) if (t.wbs_node_id) direct.set(t.wbs_node_id, (direct.get(t.wbs_node_id) ?? 0) + 1);
    const total = new Map<string, number>();
    const walk = (id: string): number => {
      const hit = total.get(id);
      if (hit !== undefined) return hit;
      const sum = (direct.get(id) ?? 0) + (children.get(id) ?? []).reduce((s, c) => s + walk(c.id), 0);
      total.set(id, sum);
      return sum;
    };
    for (const n of src.nodes) walk(n.id);
    return total;
  }, [src, children]);

  const candidates = useMemo(
    () => src.nodes
      .filter((n) => (children.get(n.id)?.length ?? 0) >= 2)
      .sort((a, b) => (keys.get(a.id) ?? "").localeCompare(keys.get(b.id) ?? "", undefined, { numeric: true })),
    [src.nodes, children, keys],
  );

  const floors = value.containerId ? children.get(value.containerId) ?? [] : [];
  const result: ToTemplateResult = useMemo(() => projectWbsToTemplate(src, value), [src, value]);

  function chooseContainer(id: string) {
    const containerId = id || null;
    onChange({ containerId, blocks: containerId ? suggestBlocks(children.get(containerId) ?? []) : {} });
  }

  function setRole(floorId: string, role: FloorBlockType | "") {
    const blocks = { ...value.blocks };
    for (const t of FLOOR_BLOCK_TYPES) if (blocks[t] === floorId) delete blocks[t];
    if (role) blocks[role] = floorId;
    onChange({ ...value, blocks });
  }

  const roleOf = (floorId: string) => FLOOR_BLOCK_TYPES.find((t) => value.blocks[t] === floorId) ?? "";
  const stats = result.doc;

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs font-medium">
        Building — the node whose children are the floors
        <select value={value.containerId ?? ""} onChange={(e) => chooseContainer(e.target.value)} className={cn(field, "w-full")}>
          <option value="">— None: keep the whole WBS as fixed sections —</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {keys.get(n.id)} · {n.wbs_name} ({children.get(n.id)?.length} children)
            </option>
          ))}
        </select>
      </label>

      {value.containerId && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Floor</th>
                <th className="px-3 py-2 text-right">Activities</th>
                <th className="w-52 px-3 py-2 text-left">Use as</th>
              </tr>
            </thead>
            <tbody>
              {floors.map((f) => {
                const role = roleOf(f.id);
                return (
                  <tr key={f.id} className={cn("border-t border-border", !role && "text-muted-foreground")}>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs">{f.wbs_code}</span> {f.wbs_name}
                      {floorTypeOf(f) === null && <span className="ml-2 text-[11px] text-amber-600">not a floor?</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{taskCount.get(f.id) ?? 0}</td>
                    <td className="px-3 py-1.5">
                      <select value={role} onChange={(e) => setRole(f.id, e.target.value as FloorBlockType | "")} className={cn(field, "w-full")}>
                        <option value="">Repeat — not stored</option>
                        {FLOOR_BLOCK_TYPES.map((t) => <option key={t} value={t}>{FLOOR_BLOCK_LABELS[t]} block</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
        <p>
          <span className="font-medium">Fixed sections:</span> {stats.sections.nodes.length} nodes · {stats.sections.tasks.length} activities
          {stats.building_anchor_key && <span className="text-muted-foreground"> · buildings go under {stats.building_anchor_key}</span>}
        </p>
        {FLOOR_BLOCK_TYPES.filter((t) => stats.floor_blocks[t]).map((t) => (
          <p key={t}>
            <span className="font-medium">{FLOOR_BLOCK_LABELS[t]} block:</span> {stats.floor_blocks[t]!.nodes.length} nodes · {stats.floor_blocks[t]!.tasks.length} activities
          </p>
        ))}
        {value.containerId && !stats.floor_blocks.typical && (
          <p className="text-amber-700 dark:text-amber-300 sm:col-span-2">Choose a Typical floors block: levels without their own block use it.</p>
        )}
        {(result.droppedFloors > 0 || result.droppedLinks > 0) && (
          <p className="text-muted-foreground sm:col-span-2">
            {result.droppedFloors} repeated floor{result.droppedFloors === 1 ? "" : "s"} not stored ({result.droppedTasks} activities)
            {result.droppedLinks > 0 && ` · ${result.droppedLinks} links that can't be repeated per floor were left out`}.
          </p>
        )}
      </div>
    </div>
  );
}
