"use client";

import { createContext, useContext, type MouseEvent as ReactMouseEvent } from "react";
import type { WorkCalendar } from "@/lib/planning/work-calendar";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import type { CellNav } from "./sheet-cell";
import type { ColWidths, SheetColumn, SheetField, SheetRow } from "./sheet-types";

/**
 * Per-render state the grid rows need. Passed via context rather than through
 * the `<Tree>` children render-prop: react-arborist keys each row's subtree on
 * the identity of that render function, so an inline `{(props) => …}` remounts
 * every row on every keystroke — which detaches a cell mid-click and swallows
 * the `click` / `dblclick` the browser would otherwise fire. A stable render
 * prop + this context keeps the DOM nodes alive across re-renders.
 *
 * Split into two contexts on purpose:
 *  - `RowCtx` (this one) holds everything that only changes on real data /
 *    column / calendar changes. It is referentially stable across selection,
 *    active-cell and edit-mode changes, so the memoized row body ignores those.
 *  - `RowVolatileCtx` holds selection / active-cell / edit state. Only the thin
 *    `SheetRowView` wrapper subscribes to it; it derives per-row primitives and
 *    hands them to the memoized body, so a click re-renders ~2 rows, not all.
 */
export interface RowCtx {
  calendar: WorkCalendar;
  colWidths: ColWidths;
  rowWidth: number;
  /** "mode" first, then the user's visible/ordered columns — see `visibleOrderedColumns()`. */
  columns: SheetColumn[];
  /** Show the critical-path red highlight on Duration/Finish text. */
  showCritical: boolean;
  rowNumberById: Map<string, number>;
  rowNumberByTaskId: Map<string, number>;
  float: Map<string, TaskFloat>;
  violations: Map<string, string>;
  /** Row id → its MS-Project WBS code (computed or overridden). */
  wbsCodeByRowId: Map<string, string>;
  /** Row ids (`task:<id>` / `node:<id>`) under a locked WBS backbone — read-only. */
  lockedRowIds: Set<string>;
  /** Formats an ISO date for display (Start/Finish columns) per the user's date-format preference. */
  formatDate: (iso: string | null | undefined) => string;
  /** When provided, double-clicking a task row opens its detail drawer (called with the task's own id, not the row id) instead of the inline rename editor — Gantt Chart page only; Sheet keeps the rename gesture since it already shows details in its own docked panel. */
  onOpenTaskDetail?: (taskId: string) => void;
  onActivateCell: (
    rowId: string,
    field: SheetField,
    mods?: { additive?: boolean; range?: boolean },
  ) => void;
  onStartEdit: (rowId: string, field: SheetField) => void;
  onCommitCell: (raw: string, nav: CellNav) => void;
  onPickCell: (rowId: string, field: SheetField, value: string) => void;
  onCancelEdit: () => void;
  onSelectRow: (
    rowId: string,
    mods?: { additive?: boolean; range?: boolean },
  ) => void;
  onRowContextMenu: (e: ReactMouseEvent, row: SheetRow) => void;
  onToggleManual: (taskId: string) => void;
}

export interface RowVolatileCtx {
  /** Every selected row id (multi-select via Ctrl/Shift). */
  selectedRowIds: Set<string>;
  activeCell: { rowId: string; field: SheetField } | null;
  editing: boolean;
  editSeed?: string;
  editKey: number;
}

export const SheetRowContext = createContext<RowCtx | null>(null);
export const SheetRowVolatileContext = createContext<RowVolatileCtx | null>(null);

export function useRowCtx(): RowCtx {
  const v = useContext(SheetRowContext);
  if (!v) throw new Error("useRowCtx must be used inside <SheetRowContext.Provider>");
  return v;
}

export function useRowVolatile(): RowVolatileCtx {
  const v = useContext(SheetRowVolatileContext);
  if (!v) throw new Error("useRowVolatile must be used inside <SheetRowVolatileContext.Provider>");
  return v;
}
