"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ExternalLink,
  ListChecks,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  FolderTree,
  Grid3X3,
  Info,
  Layers,
  Lock,
  LockOpen,
  Puzzle,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { NodeApi } from "react-arborist";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/planning/work-calendar";
import { WbsBuilderCell, type CellNav } from "./wbs-builder-cell";
import type { NodeGfa, NodeLock } from "./use-wbs-builder-data";
import {
  ID_COL_WIDTH,
  shortDate,
  statusLabel,
  type ActivityRollup,
  type ColWidths,
  type WbsActivitySummary,
  type WbsBuilderColumn,
  type WbsBuilderField,
  type WbsBuilderNode,
  type WbsBuilderRow as WbsBuilderRowT,
} from "./wbs-builder-types";

const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n))}%`);

/** Read-only activity row ("Show activities"): opens its package's panel; edited there or on the task page. */
function ActivityRowView({
  task, code, level, columns, colWidths, rowWidth, onOpen,
}: {
  task: WbsActivitySummary;
  code: string;
  level: number;
  columns: WbsBuilderColumn[];
  colWidths: ColWidths;
  rowWidth: number;
  onOpen: () => void;
}) {
  const text = (field: WbsBuilderColumn["field"]): React.ReactNode => {
    switch (field) {
      case "wbs_code": return <span className="font-mono">{code || task.task_code || ""}</span>;
      case "node_type": return "Activity";
      case "discipline": return task.discipline ?? "";
      case "status": return task.status ? statusLabel(task.status) : "";
      case "progress": return pct(task.progress);
      case "duration": return task.is_milestone ? "Milestone" : formatDuration(task.duration_days, task.duration_unit);
      case "start": return shortDate(task.start_date);
      case "finish": return shortDate(task.end_date);
      default: return "";
    }
  };
  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); onOpen(); }}
      className="group flex h-full cursor-pointer items-stretch border-b border-border/40 bg-muted/20 text-xs text-muted-foreground hover:bg-muted/50"
      style={{ width: rowWidth }}
      title="Activity — opens its package panel"
    >
      <div className="flex shrink-0 items-center justify-center border-r border-border/60 text-[10px]" style={{ width: ID_COL_WIDTH }}>·</div>
      {columns.map((col) => (
        <div
          key={col.field}
          className={cn("flex h-full items-center border-r border-border/60 px-1.5", col.align === "right" && "justify-end tabular-nums")}
          style={{ width: colWidths[col.field] }}
        >
          {col.field === "wbs_name" ? (
            <span className="flex min-w-0 items-center gap-1" style={{ paddingLeft: level * 14 }}>
              <ListChecks className="h-3.5 w-3.5 shrink-0 text-sky-500/80" />
              <span className="truncate">{task.task_name}</span>
            </span>
          ) : col.field === "action" ? (
            <Link
              href={`/dashboard/tasks/${task.id}`}
              onMouseDown={(e) => e.stopPropagation()}
              className="mx-auto rounded p-1 hover:bg-muted hover:text-foreground"
              title="Open activity"
              aria-label={`Open ${task.task_name}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="truncate">{text(col.field)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

const NODE_ICONS: Record<string, typeof Building2> = {
  project: Building2,
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

const fmtGfa = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function cellValue(node: WbsBuilderNode, field: WbsBuilderField): string {
  switch (field) {
    case "wbs_code":
      return node.wbs_code;
    case "node_type":
      return node.node_type;
    case "wbs_name":
      return node.wbs_name;
    case "discipline":
      return node.discipline ?? "";
    case "area_label":
      return node.area_label ?? "";
    case "cost_code":
      return node.cost_code ?? "";
    case "status":
      return node.status;
  }
}

// ---------------------------------------------------------------------------
// GFA cell — self-contained inline number editor (not part of the grid's
// keyboard-nav / edit machinery, which is keyed on WbsBuilderField).
// ---------------------------------------------------------------------------
function GfaCell({
  gfa,
  editable,
  onSet,
  onClear,
}: {
  gfa: NodeGfa;
  editable: boolean;
  onSet: (value: number) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    setDraft(gfa.own != null ? String(gfa.own) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t === "") {
      if (gfa.own != null) onClear();
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a GFA value ≥ 0");
      return;
    }
    if (n !== gfa.own) onSet(n);
  };

  if (editable && editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        onBlur={commit}
        onMouseDown={(e) => e.stopPropagation()}
        className="h-full w-full rounded-[3px] bg-white px-1.5 text-right text-xs tabular-nums outline-none ring-2 ring-primary/60"
      />
    );
  }

  return (
    <div
      role="gridcell"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={editable ? (e) => { e.stopPropagation(); start(); } : undefined}
      onDoubleClick={editable ? (e) => { e.stopPropagation(); start(); } : undefined}
      title={
        gfa.mismatch
          ? `Manual ${fmtGfa(gfa.own ?? 0)} m² — rolls up to ${fmtGfa(gfa.rollup ?? 0)} m²`
          : gfa.own == null && gfa.rollup != null
            ? "Rolled up from children"
            : undefined
      }
      className={cn(
        "flex h-full items-center justify-end gap-1 px-1.5 text-xs tabular-nums",
        editable ? "cursor-cell" : "cursor-default",
        gfa.own == null && gfa.rollup != null && "text-blue-600",
      )}
    >
      {gfa.mismatch && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" />}
      {gfa.display != null ? (
        <>
          <span>{fmtGfa(gfa.display)}</span>
          <span className="text-[9px] text-muted-foreground">m²</span>
        </>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </div>
  );
}

interface WbsBuilderRowProps {
  node: NodeApi<WbsBuilderRowT>;
  rowNumber: number;
  selected: boolean;
  readOnly?: boolean;
  colWidths: ColWidths;
  rowWidth: number;
  activeCell: { rowId: string; field: WbsBuilderField } | null;
  editing: boolean;
  editSeed?: string;
  editKey: number;
  gfa: NodeGfa;
  lock: NodeLock;
  isManager: boolean;
  onActivateCell: (rowId: string, field: WbsBuilderField) => void;
  onStartEdit: (rowId: string, field: WbsBuilderField) => void;
  onCommitCell: (raw: string, nav: CellNav) => void;
  onCancelEdit: () => void;
  onSelectRow: (rowId: string) => void;
  onDeleteRow: (nodeId: string) => void;
  onSetGfa: (nodeId: string, value: number) => void;
  onClearGfa: (nodeId: string) => void;
  onToggleLock: (nodeId: string, locked: boolean) => void;
  /** Columns to render (View › Columns). */
  columns: WbsBuilderColumn[];
  /** Activities under this node (count + % complete). */
  rollup?: ActivityRollup;
  /** An activity row was clicked. */
  onOpenActivity: (task: WbsActivitySummary, packageNodeId: string) => void;
  /** Open this node's detail panel (details button / double-click on #). */
  onOpenDetails: (nodeId: string) => void;
  /** Full WBS code (override or code mask), shown in the WBS Code column. */
  displayCode: string;
}

export function WbsBuilderRowView({
  node,
  rowNumber,
  selected,
  readOnly = false,
  colWidths,
  rowWidth,
  activeCell,
  editing,
  editSeed,
  editKey,
  gfa,
  lock,
  isManager,
  onActivateCell,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onSelectRow,
  onDeleteRow,
  onSetGfa,
  onClearGfa,
  onToggleLock,
  columns,
  rollup,
  onOpenActivity,
  onOpenDetails,
  displayCode,
}: WbsBuilderRowProps) {
  const row = node.data;
  if (row.task) {
    const task = row.task;
    return (
      <ActivityRowView
        task={task}
        code={displayCode}
        level={node.level}
        columns={columns}
        colWidths={colWidths}
        rowWidth={rowWidth}
        onOpen={() => onOpenActivity(task, row.node.id)}
      />
    );
  }
  const data = row.node;
  const isProjectRow = data.node_type === "project";
  const Icon = NODE_ICONS[data.node_type] ?? FolderTree;
  const iconColor = NODE_COLORS[data.node_type] ?? "text-gray-500";
  const gfaEditable = gfa.editable && !readOnly && !lock.locked;

  return (
    <div
      onMouseDown={() => onSelectRow(row.id)}
      className={cn(
        "group relative flex h-full items-stretch border-b border-border/60 text-xs",
        isProjectRow ? "bg-slate-50 font-semibold" : "bg-background",
        lock.locked && !isProjectRow && "bg-amber-50/50",
        selected && "bg-primary/5",
        node.isDragging && "opacity-40",
        node.willReceiveDrop && "ring-1 ring-inset ring-primary/60",
      )}
      style={{ width: rowWidth }}
    >
      <div
        className="flex shrink-0 items-center justify-center border-r border-border/60 text-[10px] text-muted-foreground tabular-nums"
        style={{ width: ID_COL_WIDTH }}
        onDoubleClick={isProjectRow ? undefined : () => onOpenDetails(data.id)}
        title={isProjectRow ? undefined : "Double-click for details"}
      >
        {isProjectRow ? <Building2 className="h-3.5 w-3.5 text-slate-500" /> : rowNumber}
      </div>

      {columns.map((col) => {
        const active =
          activeCell?.rowId === row.id && activeCell.field === (col.field as WbsBuilderField);
        const editable = !readOnly;

        if (col.field === "gfa") {
          return (
            <div
              key={col.field}
              className="h-full border-r border-border/60"
              style={{ width: colWidths[col.field] }}
            >
              <GfaCell
                gfa={gfa}
                editable={gfaEditable}
                onSet={(v) => onSetGfa(data.id, v)}
                onClear={() => onClearGfa(data.id)}
              />
            </div>
          );
        }

        if (col.field === "action") {
          return (
            <div
              key={col.field}
              className="flex h-full items-center justify-center gap-0.5 border-r border-border/60"
              style={{ width: colWidths[col.field] }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {!isProjectRow && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetails(data.id);
                    }}
                    title="Details: schedule, activities, cost"
                    aria-label={`Details of ${data.wbs_name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                  {lock.locked && !lock.self ? (
                    <span
                      className="p-1 text-amber-500/70"
                      title="Locked by a parent node — unlock that node"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!isManager}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(data.id, !lock.self);
                      }}
                      title={
                        !isManager
                          ? "Admin / project manager only"
                          : lock.self
                            ? "Unlock this subtree"
                            : "Lock this subtree (Planning backbone)"
                      }
                      aria-label={lock.self ? "Unlock WBS subtree" : "Lock WBS subtree"}
                      className={cn(
                        "rounded p-1",
                        lock.self
                          ? "text-amber-600 hover:bg-amber-100"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        !isManager && "cursor-not-allowed opacity-40 hover:bg-transparent",
                      )}
                    >
                      {lock.self ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <LockOpen className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={lock.locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRow(data.id);
                    }}
                    title={lock.locked ? "Unlock first" : `Delete ${data.wbs_name}`}
                    aria-label={`Delete ${data.wbs_name}`}
                    className={cn(
                      "rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                      lock.locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        }

        if (col.field === "duration" || col.field === "start" || col.field === "finish") {
          // Rolled up from the activities below; calculated by Schedule, not typed.
          const v = col.field === "duration"
            ? (rollup?.days != null ? String(rollup.days) : "")
            : shortDate(col.field === "start" ? rollup?.start : rollup?.finish);
          return (
            <div
              key={col.field}
              className="flex h-full items-center justify-end border-r border-border/60 px-1.5 text-xs tabular-nums text-muted-foreground"
              style={{ width: colWidths[col.field] }}
              title={col.field === "duration" && v ? `${v} working days (from the activities below)` : undefined}
            >
              {v || <span className="text-muted-foreground/40">—</span>}
            </div>
          );
        }

        if (col.field === "progress" || col.field === "activities") {
          const content = col.field === "progress"
            ? pct(data.progress_percent)
            : rollup && rollup.count > 0
              ? <><span>{rollup.count}</span><span className="text-muted-foreground"> · {pct(rollup.progress)}</span></>
              : <span className="text-muted-foreground/40">—</span>;
          return (
            <div
              key={col.field}
              className="flex h-full items-center justify-end border-r border-border/60 px-1.5 text-xs tabular-nums"
              style={{ width: colWidths[col.field] }}
              title={col.field === "activities" && rollup?.count ? `${rollup.count} activities below · ${pct(rollup.progress)} complete` : undefined}
            >
              {content}
            </div>
          );
        }

        const field = col.field as WbsBuilderField;
        const value = cellValue(data, field);

        if (col.field === "wbs_name") {
          return (
            <div
              key={col.field}
              className="flex h-full items-center border-r border-border/60"
              style={{ width: colWidths[col.field] }}
            >
              <span
                className="flex h-full shrink-0 items-center gap-0.5"
                style={{ paddingLeft: 6 + node.level * 14 }}
              >
                {node.isInternal ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      node.toggle();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                    aria-label={node.isOpen ? "Collapse" : "Expand"}
                  >
                    {node.isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="h-4 w-4" />
                )}
                {lock.locked && (
                  <Lock
                    className={cn(
                      "h-3 w-3 shrink-0",
                      lock.self ? "text-amber-600" : "text-amber-500/60",
                    )}
                  />
                )}
                <Icon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
              </span>
              <span className="h-full min-w-0 flex-1">
                <WbsBuilderCell
                  column={col}
                  value={value}
                  editable={editable && !lock.locked}
                  active={active}
                  editing={editing && active}
                  seed={active ? editSeed : undefined}
                  editKey={editKey}
                  onActivate={() => onActivateCell(row.id, field)}
                  onStartEdit={() => onStartEdit(row.id, field)}
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
            className="h-full border-r border-border/60"
            style={{ width: colWidths[col.field] }}
          >
            <WbsBuilderCell
              column={col}
              value={value}
              // WBS Code shows the full code; editing changes only this row's own part.
              display={col.field === "wbs_code" && !isProjectRow ? displayCode || value : undefined}
              hint={col.field === "wbs_code" && !isProjectRow
                ? `${displayCode || value} · own part: ${value}${data.wbs_outline_code ? " · saved code (Planning)" : ""}`
                : undefined}
              editable={editable && !lock.locked}
              active={active}
              editing={editing && active}
              seed={active ? editSeed : undefined}
              editKey={editKey}
              onActivate={() => onActivateCell(row.id, field)}
              onStartEdit={() => onStartEdit(row.id, field)}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
            />
          </div>
        );
      })}
    </div>
  );
}
