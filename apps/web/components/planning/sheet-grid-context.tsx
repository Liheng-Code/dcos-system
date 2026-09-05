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
 */
export interface RowCtx {
  selectedRowId: string | null;
  /** Every selected row id (multi-select via Ctrl/Shift). */
  selectedRowIds: Set<string>;
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
  activeCell: { rowId: string; field: SheetField } | null;
  editing: boolean;
  editSeed?: string;
  editKey: number;
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

export const SheetRowContext = createContext<RowCtx | null>(null);

export function useRowCtx(): RowCtx {
  const v = useContext(SheetRowContext);
  if (!v) throw new Error("useRowCtx must be used inside <SheetRowContext.Provider>");
  return v;
}
