"use client";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Diamond,
  Folder,
  GripVertical,
  Lock,
  Pin,
  TriangleAlert,
} from "lucide-react";
import type { NodeApi } from "react-arborist";
import type { WorkCalendar } from "@/lib/planning/work-calendar";
import { depsFromArrays } from "@/lib/planning/schedule-engine";
import { formatPredecessors } from "@/lib/planning/predecessor-syntax";
import { cn } from "@/lib/utils";
import { SheetCell } from "./sheet-cell";
import { useRowCtx } from "./sheet-grid-context";
import {
  ID_COL_WIDTH,
  PROJECT_NODE_TYPE,
  type SheetField,
  type SheetRow as SheetRowT,
} from "./sheet-types";
import { diffDaysInclusive, durationOf } from "./sheet-utils";
import { getDeadlineFlag } from "./task-status";

interface SheetRowProps {
  node: NodeApi<SheetRowT>;
  dragHandle?: (el: HTMLDivElement | null) => void;
}

function cellFor(
  row: SheetRowT,
  field: SheetField,
  cal: WorkCalendar,
  rowNumberByTaskId: Map<string, number>,
  wbsCode: string,
): { value: string; display?: string; editable: boolean } {
  if (row.kind === "task") {
    const t = row.task;
    switch (field) {
      case "mode":
        return { value: "", editable: false };
      case "wbs":
        return { value: wbsCode, editable: true };
      case "code":
        return { value: t.task_code, editable: true };
      case "name":
        return { value: t.task_name, editable: true };
      case "duration": {
        const d = durationOf(t, cal);
        return { value: d != null ? String(d) : "", editable: true };
      }
      case "start":
        return { value: t.start_date ?? "", editable: true };
      case "finish":
        return { value: t.end_date ?? "", editable: true };
      case "predecessors": {
        const deps = depsFromArrays(
          t.dependency_task_ids,
          t.dependency_types,
          t.dependency_lag_days,
        );
        return { value: formatPredecessors(deps, rowNumberByTaskId), editable: true };
      }
      case "progress":
        return { value: String(t.progress ?? 0), display: `${t.progress ?? 0}%`, editable: true };
      case "status":
        return { value: t.status, editable: true };
      case "priority":
        return { value: t.priority, editable: false };
      case "owner":
        return { value: t.owner_name ?? "", editable: false };
    }
  }
  // node (summary) row — client-computed rollup, read-only except name.
  // The synthetic project row is fully read-only.
  const n = row.node;
  const r = row.rollup;
  const nameEditable = n.node_type !== PROJECT_NODE_TYPE;
  switch (field) {
    case "mode":
      return { value: "", editable: false };
    case "wbs":
      return { value: wbsCode, editable: nameEditable };
    case "code":
      return { value: n.wbs_code, editable: false };
    case "name":
      return { value: n.wbs_name, editable: nameEditable };
    case "duration":
      return {
        value: r.start && r.end ? String(diffDaysInclusive(r.start, r.end)) : "",
        editable: false,
      };
    case "start":
      return { value: r.start ?? "", editable: false };
    case "finish":
      return { value: r.end ?? "", editable: false };
    case "predecessors":
      return { value: "", editable: false };
    case "progress":
      return {
        value: String(r.progress),
        display: r.taskCount ? `${r.progress}%` : "",
        editable: false,
      };
    case "status":
      return { value: "", editable: false };
    case "priority":
      return { value: "", editable: false };
    case "owner":
      return { value: "", editable: false };
  }
}

export function SheetRowView({ node, dragHandle }: SheetRowProps) {
  const {
    selectedRowIds,
    calendar,
    colWidths,
    rowWidth,
    columns,
    showCritical,
    rowNumberById,
    rowNumberByTaskId,
    float,
    violations,
    wbsCodeByRowId,
    lockedRowIds,
    activeCell,
    editing,
    editSeed,
    editKey,
    onActivateCell,
    onStartEdit,
    onCommitCell,
    onPickCell,
    onCancelEdit,
    onSelectRow,
    onRowContextMenu,
    onToggleManual,
  } = useRowCtx();

  const row = node.data;
  const isNode = row.kind === "node";
  const isProjectRow = isNode && row.node.node_type === PROJECT_NODE_TYPE;
  const task = row.kind === "task" ? row.task : null;
  const selected = selectedRowIds.has(row.id);
  const locked = lockedRowIds.has(row.id); // under a locked WBS backbone
  const rowNumber = rowNumberById.get(row.id) ?? 0;
  const taskFloat = task ? float.get(task.id) : undefined;
  const violation = task ? violations.get(task.id) : undefined;
  const critical = !isNode && taskFloat?.critical === true;
  const deadlineFlag = task ? getDeadlineFlag(task) : null;

  // Double-clicking anywhere that a specific cell didn't already claim (the
  // row-number, the indent gutter, the icons) drops you into the Task Name
  // editor — MS-Project style. A cell that handles its own double-click stops
  // propagation, so this only fires for the "everything else" areas.
  const handleRowDoubleClick =
    isProjectRow || locked ? undefined : () => onStartEdit(row.id, "name");

  return (
    <div
      onMouseDown={(e) =>
        onSelectRow(row.id, {
          additive: e.ctrlKey || e.metaKey,
          range: e.shiftKey,
        })
      }
      onContextMenu={(e) => onRowContextMenu(e, row)}
      onDoubleClick={handleRowDoubleClick}
      className={cn(
        "group relative flex h-full items-stretch border-b border-border/60 text-xs",
        isNode ? "bg-muted/40 font-medium" : "bg-background",
        isProjectRow && "bg-muted/70 font-semibold",
        locked && !isProjectRow && "bg-amber-50/50",
        selected && "bg-primary/5",
        node.isDragging && "opacity-40",
        node.willReceiveDrop && "ring-1 ring-inset ring-primary/60",
      )}
      style={{ width: rowWidth }}
    >
      {/* Row number, or a building glyph for the project row. */}
      <div
        className="flex shrink-0 items-center justify-center border-r border-border/60 text-[10px] text-muted-foreground tabular-nums"
        style={{ width: ID_COL_WIDTH }}
      >
        {isProjectRow ? <Building2 className="h-3.5 w-3.5 text-slate-500" /> : rowNumber}
      </div>

      {columns.map((col) => {
        const width = colWidths[col.field] ?? col.width;
        const cf = cellFor(
          row,
          col.field,
          calendar,
          rowNumberByTaskId,
          wbsCodeByRowId.get(row.id) ?? "",
        );
        const { value, display } = cf;
        const editable = cf.editable && !locked;
        const active = activeCell?.rowId === row.id && activeCell.field === col.field;

        // Task-mode column: a pin toggle, not an editable cell.
        if (col.field === "mode") {
          return (
            <div
              key={col.field}
              className="flex h-full shrink-0 items-center justify-center border-r border-border/60"
              style={{ width }}
            >
              {task && !locked && (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleManual(task.id);
                  }}
                  title={
                    task.manually_scheduled
                      ? "Manually scheduled — click to auto-schedule"
                      : "Auto-scheduled — click to pin these dates"
                  }
                  aria-label={task.manually_scheduled ? "Auto-schedule task" : "Pin task dates"}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-muted",
                    task.manually_scheduled
                      ? "text-amber-600"
                      : "text-muted-foreground/30 hover:text-muted-foreground",
                  )}
                >
                  <Pin className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        }

        if (col.field === "name") {
          return (
            <div
              key={col.field}
              className="flex h-full shrink-0 items-center border-r border-border/60"
              style={{ width }}
              onDoubleClick={
                editable
                  ? (e) => {
                      e.stopPropagation();
                      onStartEdit(row.id, col.field);
                    }
                  : undefined
              }
            >
              <span
                className="flex h-full shrink-0 items-center gap-0.5"
                style={{ paddingLeft: 4 + node.level * 14 }}
              >
                {isProjectRow ? (
                  <span className="h-4 w-4" />
                ) : (
                  <div
                    ref={dragHandle}
                    className="flex h-4 w-4 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100"
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-3 w-3" />
                  </div>
                )}
                {node.isInternal ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      node.toggle();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                    aria-label={node.isOpen ? "Collapse" : "Expand"}
                  >
                    {node.isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="h-4 w-4" />
                )}
                {isProjectRow ? (
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                ) : (
                  isNode && <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                {task?.is_milestone && (
                  <Diamond className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
                )}
                {deadlineFlag && (
                  <span
                    className="shrink-0"
                    title={
                      deadlineFlag === "overdue"
                        ? `Overdue — was due ${task?.end_date}`
                        : `Due soon — due ${task?.end_date}`
                    }
                  >
                    <Clock
                      className={cn("h-3 w-3", deadlineFlag === "overdue" ? "text-red-600" : "text-amber-500")}
                      aria-label={deadlineFlag === "overdue" ? "Overdue" : "Due soon"}
                    />
                  </span>
                )}
                {locked && (
                  <Lock
                    className="h-3 w-3 shrink-0 text-amber-600"
                    aria-label="Locked — WBS backbone"
                  />
                )}
                {violation && (
                  <TriangleAlert
                    className="h-3 w-3 shrink-0 text-amber-500"
                    aria-label={violation}
                  />
                )}
              </span>
              <span className="h-full min-w-0 flex-1">
                <SheetCell
                  column={col}
                  value={value}
                  display={display}
                  editable={editable}
                  active={active}
                  editing={editing && active}
                  seed={active ? editSeed : undefined}
                  editKey={editKey}
                  onActivate={(mods) => onActivateCell(row.id, col.field, mods)}
                  onStartEdit={() => onStartEdit(row.id, col.field)}
                  onCommit={onCommitCell}
                  onCancel={onCancelEdit}
                />
              </span>
            </div>
          );
        }

        return (
          <div
            key={col.field}
            className="h-full shrink-0 border-r border-border/60"
            style={{ width }}
            onDoubleClick={
              editable && col.variant !== "icon"
                ? (e) => {
                    e.stopPropagation();
                    onStartEdit(row.id, col.field);
                  }
                : undefined
            }
          >
            <SheetCell
              column={col}
              value={value}
              display={display}
              editable={editable}
              active={active}
              editing={editing && active}
              seed={active ? editSeed : undefined}
              editKey={editKey}
              className={cn(
                critical && showCritical && (col.field === "duration" || col.field === "finish") && "text-red-600",
              )}
              onPickValue={
                col.variant === "date"
                  ? (v) => onPickCell(row.id, col.field, v)
                  : undefined
              }
              onActivate={(mods) => onActivateCell(row.id, col.field, mods)}
              onStartEdit={() => onStartEdit(row.id, col.field)}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
            />
          </div>
        );
      })}
    </div>
  );
}
