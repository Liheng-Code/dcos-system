"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Tree,
  type NodeRendererProps,
  type RowRendererProps,
  type TreeApi,
} from "react-arborist";
import {
  CalendarClock,
  EyeOff,
  FolderPlus,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Link2Off,
  Locate,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CellNav } from "./sheet-cell";
import { SheetCell } from "./sheet-cell";
import { SheetRowView } from "./sheet-row";
import { SheetRowContext, type RowCtx } from "./sheet-grid-context";
import { SheetRowContextMenu, type ContextMenuItem } from "./sheet-row-context-menu";
import {
  canHideColumn,
  DEFAULT_COL_WIDTHS,
  ID_COL_WIDTH,
  MIN_COL_WIDTH,
  PINNED_COLUMNS,
  ROW_HEIGHT,
  SCHEDULE_HEADER_H,
  rowWidthFrom,
  visibleOrderedColumns,
  type ColWidths,
  type ColumnOrder,
  type ColumnVisibility,
  type SheetField,
  type SheetRow,
} from "./sheet-types";
import type { UseSheetData } from "./use-sheet-data";

const BLANK = "__blank__";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Row wrapper that deliberately omits react-arborist's `node.handleClick`.
 * That handler runs `tree.select()` → `scrollToItem()` on every click, which
 * yanks the list (and, here, the timeline synced to it) out from under the
 * cursor. Selection is driven from the row's own `onMouseDown` instead.
 * `innerRef` is still applied — it is the drop target.
 */
function StaticRow({ attrs, innerRef, children }: RowRendererProps<SheetRow>) {
  return (
    <div {...attrs} ref={innerRef} onFocus={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/**
 * Stable node renderer. react-arborist keys each row's whole subtree on the
 * identity of this function — an inline `{(props) => …}` would remount every
 * row on every grid re-render, which detaches a cell between mousedown and
 * mouseup and eats the browser's `click` / `dblclick`. Everything volatile
 * comes from context (see sheet-grid-context.tsx).
 */
function NodeRenderer(props: NodeRendererProps<SheetRow>) {
  return <SheetRowView node={props.node} dragHandle={props.dragHandle} />;
}

interface SheetGridProps {
  data: UseSheetData;
  selectedRowId: string | null;
  /** Every selected row id (multi-select via Ctrl/Shift). Defaults to just `selectedRowId`. */
  selectedRowIds?: Set<string>;
  onSelectedRowChange: (
    id: string | null,
    mods?: { additive?: boolean; range?: boolean },
  ) => void;
  registerTree: (api: TreeApi<SheetRow> | null) => void;
  /** Mirrors arborist's collapse state up so the timeline can render the same rows. */
  onToggleRow: (rowId: string, open: boolean) => void;
  /** Number of rows currently visible — sizes the list so it never scrolls internally. */
  visibleCount: number;
  /** Header height — must match the Gantt timeline header so rows stay aligned.
   * Defaults to the standalone value when the grid renders without a timeline. */
  headerHeight?: number;
  // --- context-menu actions owned by the parent view ---
  /** Chain-link the current multi-selection Finish-to-Start. */
  onLinkSelected?: () => void;
  /** Remove every predecessor of one task row. */
  onUnlinkRow?: (rowId: string) => void;
  /** Scroll the Gantt timeline so this row's bar is visible. */
  onScrollToRow?: (rowId: string) => void;
  /** ≥2 task rows are selected → "Link selected" is meaningful. */
  canLinkSelected?: boolean;
  /** Show the critical-path red highlight on Duration/Finish text. */
  showCritical: boolean;
  /** Overrides the "No activities yet" copy — e.g. when a filter hid every row. */
  emptyState?: { title: string; hint: string };
  // --- Column preferences — owned by plan-schedule-view.tsx (see use-column-preferences.ts) ---
  columnOrder: ColumnOrder;
  columnVisibility: ColumnVisibility;
  colWidths: ColWidths;
  onColumnOrderChange: (order: ColumnOrder) => void;
  onColumnVisibilityChange: (visibility: ColumnVisibility) => void;
  onColWidthsChange: (widths: ColWidths | ((prev: ColWidths) => ColWidths)) => void;
}

export function SheetGrid({
  data,
  selectedRowId,
  selectedRowIds,
  onSelectedRowChange,
  registerTree,
  onToggleRow,
  visibleCount,
  headerHeight = SCHEDULE_HEADER_H,
  onLinkSelected,
  onUnlinkRow,
  onScrollToRow,
  canLinkSelected = false,
  showCritical,
  emptyState,
  columnOrder,
  columnVisibility,
  colWidths,
  onColumnOrderChange,
  onColumnVisibilityChange,
  onColWidthsChange,
}: SheetGridProps) {
  const {
    tree,
    flatRows,
    rowNumberById,
    nextCodePreview,
    calendar,
    float,
    violations,
    wbsCodeByRowId,
    lockedRowIds,
    actions,
  } = data;

  const treeRef = useRef<TreeApi<SheetRow> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeCell, setActiveCell] = useState<{ rowId: string; field: SheetField } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSeed, setEditSeed] = useState<string | undefined>(undefined);
  const [editNonce, setEditNonce] = useState(0);
  const [blankName, setBlankName] = useState("");

  // "mode" first, then the user's visible/ordered columns — drives every
  // `.map()` over the grid's columns (header, blank row, and each data row
  // via RowCtx) so hide/reorder preferences apply everywhere consistently.
  const columns = useMemo(
    () => visibleOrderedColumns(columnOrder, columnVisibility),
    [columnOrder, columnVisibility],
  );
  /** Columns navigable by keyboard, in on-screen order (row-number "#" and pinned columns excluded). */
  const navColumns = useMemo(
    () => columnOrder.filter((f) => columnVisibility[f] !== false),
    [columnOrder, columnVisibility],
  );

  const colWidthsRef = useRef(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  });
  const rowWidth = rowWidthFrom(colWidths, columns);

  // Row number per TASK id — the Predecessors cell renders "3FS+2d" from this.
  // Derived from the hook's unified numbering so it matches `parsePredecessors`.
  const rowNumberByTaskId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [rowId, num] of rowNumberById) {
      if (rowId.startsWith("task:")) m.set(rowId.slice(5), num);
    }
    return m;
  }, [rowNumberById]);

  const editingCellRef = useRef<{ rowId: string; field: SheetField } | null>(null);

  const openEditor = useCallback(
    (cell: { rowId: string; field: SheetField }, seed?: string) => {
      editingCellRef.current = cell;
      setActiveCell(cell);
      setEditSeed(seed);
      setEditNonce((n) => n + 1);
      setEditing(true);
    },
    [],
  );

  const setTreeApi = useCallback(
    (api: TreeApi<SheetRow> | null | undefined) => {
      treeRef.current = api ?? null;
      registerTree(api ?? null);
    },
    [registerTree],
  );

  const startResize = useCallback(
    (e: React.MouseEvent, field: SheetField) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = colWidthsRef.current[field] ?? DEFAULT_COL_WIDTHS[field];
      const onMove = (ev: MouseEvent) => {
        const next = Math.max(MIN_COL_WIDTH, Math.round(startW + (ev.clientX - startX)));
        // Local state updates every tick for smooth visual feedback; the
        // Supabase write inside onColWidthsChange is debounced separately —
        // see use-column-preferences.ts.
        onColWidthsChange((prev) => ({ ...prev, [field]: next }));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onColWidthsChange],
  );

  const resetColWidth = useCallback(
    (field: SheetField) => {
      onColWidthsChange((prev) => ({ ...prev, [field]: DEFAULT_COL_WIDTHS[field] }));
    },
    [onColWidthsChange],
  );

  const visibleIds = useCallback((): string[] => {
    const ids = treeRef.current?.visibleNodes?.map((n) => n.data.id) ?? flatRows.map((r) => r.id);
    return [...ids, BLANK];
  }, [flatRows]);

  const isEditableCell = useCallback(
    (rowId: string, field: SheetField): boolean => {
      if (field === "mode") return false;
      if (rowId === BLANK) return field === "name";
      if (rowId.startsWith("node:project:")) return false; // project row is read-only
      if (lockedRowIds.has(rowId)) return false; // under a locked WBS backbone
      const row = flatRows.find((r) => r.id === rowId);
      if (!row) return false;
      if (field === "wbs") return true; // hand-editable on tasks and summary rows
      return row.kind === "task" ? true : field === "name";
    },
    [flatRows, lockedRowIds],
  );

  const firstEditableField = useCallback(
    (rowId: string, preferred: SheetField): SheetField =>
      isEditableCell(rowId, preferred) ? preferred : "name",
    [isEditableCell],
  );

  const moveActive = useCallback(
    (nav: CellNav) => {
      setActiveCell((cur) => {
        if (!cur || nav === "none") return cur;
        const ids = visibleIds();
        const rowIdx = ids.indexOf(cur.rowId);
        if (rowIdx < 0) return cur;
        if (nav === "down" || nav === "up") {
          const nextIdx = clamp(rowIdx + (nav === "down" ? 1 : -1), 0, ids.length - 1);
          const nextRowId = ids[nextIdx];
          return { rowId: nextRowId, field: firstEditableField(nextRowId, cur.field) };
        }
        const step = nav === "right" ? 1 : -1;
        let i = navColumns.indexOf(cur.field);
        for (let k = i + step; k >= 0 && k < navColumns.length; k += step) {
          if (isEditableCell(cur.rowId, navColumns[k])) {
            i = k;
            break;
          }
        }
        return { rowId: cur.rowId, field: navColumns[i] };
      });
    },
    [visibleIds, firstEditableField, isEditableCell, navColumns],
  );

  const activateCell = useCallback(
    (
      rowId: string,
      field: SheetField,
      mods?: { additive?: boolean; range?: boolean },
    ) => {
      setActiveCell({ rowId, field });
      setEditing(false);
      setEditSeed(undefined);
      if (rowId !== BLANK) onSelectedRowChange(rowId, mods);
      containerRef.current?.focus();
    },
    [onSelectedRowChange],
  );

  const startEdit = useCallback(
    (rowId: string, field: SheetField) => {
      openEditor({ rowId, field });
    },
    [openEditor],
  );

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditSeed(undefined);
    editingCellRef.current = null;
    containerRef.current?.focus();
  }, []);

  const handleCommit = useCallback(
    async (raw: string, nav: CellNav) => {
      const cell = editingCellRef.current ?? activeCell;
      setEditing(false);
      setEditSeed(undefined);
      editingCellRef.current = null;
      if (!cell) return;

      if (cell.rowId === BLANK) {
        const name = raw.trim();
        setBlankName("");
        if (name) await actions.createTask(name, selectedRowId);
        setActiveCell({ rowId: BLANK, field: "name" });
        // Enter keeps the blank row open for continuous entry; a click elsewhere
        // (nav "none") must NOT steal focus back.
        if (nav === "down") {
          requestAnimationFrame(() => openEditor({ rowId: BLANK, field: "name" }));
        }
        return;
      }

      const row = flatRows.find((r) => r.id === cell.rowId);
      if (row) {
        if (cell.field === "wbs") {
          await actions.setWbsCode(row.id, raw);
        } else if (row.kind === "task") {
          await actions.updateTaskField(row.task.id, cell.field, raw);
        } else if (cell.field === "name") {
          await actions.renameNode(row.node.id, raw);
        }
      }
      if (nav !== "none") {
        moveActive(nav);
        containerRef.current?.focus();
      }
    },
    [activeCell, actions, flatRows, moveActive, openEditor, selectedRowId],
  );

  // --- Multi-select + right-click context menu -----------------------------
  const selectedIdSet = useMemo(
    () => selectedRowIds ?? new Set(selectedRowId ? [selectedRowId] : []),
    [selectedRowIds, selectedRowId],
  );

  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; row: SheetRow } | null
  >(null);

  const handleRowContextMenu = useCallback(
    (e: ReactMouseEvent, row: SheetRow) => {
      e.preventDefault();
      if (!selectedIdSet.has(row.id)) onSelectedRowChange(row.id);
      setContextMenu({ x: e.clientX, y: e.clientY, row });
    },
    [selectedIdSet, onSelectedRowChange],
  );

  // --- Column header: right-click to hide, drag to reorder -----------------
  const [headerContextMenu, setHeaderContextMenu] = useState<
    { x: number; y: number; field: SheetField } | null
  >(null);
  const [dragOverField, setDragOverField] = useState<SheetField | null>(null);
  const draggedFieldRef = useRef<SheetField | null>(null);

  const handleHeaderContextMenu = useCallback(
    (e: ReactMouseEvent, field: SheetField) => {
      if (PINNED_COLUMNS.includes(field)) return;
      e.preventDefault();
      setHeaderContextMenu({ x: e.clientX, y: e.clientY, field });
    },
    [],
  );

  const headerContextItems = useMemo<ContextMenuItem[]>(() => {
    if (!headerContextMenu) return [];
    const { field } = headerContextMenu;
    return [
      {
        label: "Hide Column",
        icon: <EyeOff />,
        disabled: !canHideColumn(field, columnVisibility),
        onClick: () => onColumnVisibilityChange({ ...columnVisibility, [field]: false }),
      },
    ];
  }, [headerContextMenu, columnVisibility, onColumnVisibilityChange]);

  const handleHeaderDragStart = useCallback((e: React.DragEvent, field: SheetField) => {
    if (PINNED_COLUMNS.includes(field)) return;
    draggedFieldRef.current = field;
    e.dataTransfer.effectAllowed = "move";
    // Firefox requires data to be set for the drag to start.
    e.dataTransfer.setData("text/plain", field);
  }, []);

  const handleHeaderDragOver = useCallback((e: React.DragEvent, field: SheetField) => {
    if (PINNED_COLUMNS.includes(field)) return;
    if (!draggedFieldRef.current || draggedFieldRef.current === field) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverField(field);
  }, []);

  const handleHeaderDragLeave = useCallback((field: SheetField) => {
    setDragOverField((cur) => (cur === field ? null : cur));
  }, []);

  const handleHeaderDrop = useCallback(
    (e: React.DragEvent, field: SheetField) => {
      e.preventDefault();
      setDragOverField(null);
      const dragged = draggedFieldRef.current;
      draggedFieldRef.current = null;
      if (PINNED_COLUMNS.includes(field) || !dragged || dragged === field) return;
      const withoutDragged = columnOrder.filter((f) => f !== dragged);
      const targetIdx = withoutDragged.indexOf(field);
      if (targetIdx < 0) return;
      const next = [
        ...withoutDragged.slice(0, targetIdx),
        dragged,
        ...withoutDragged.slice(targetIdx),
      ];
      onColumnOrderChange(next);
    },
    [columnOrder, onColumnOrderChange],
  );

  const handleHeaderDragEnd = useCallback(() => {
    draggedFieldRef.current = null;
    setDragOverField(null);
  }, []);

  const deleteSelected = useCallback(
    (clicked: SheetRow) => {
      const ids =
        selectedIdSet.has(clicked.id) && selectedIdSet.size > 1
          ? [...selectedIdSet]
          : [clicked.id];
      for (const id of ids) {
        if (id.startsWith("node:project:") || lockedRowIds.has(id)) continue;
        const row = flatRows.find((r) => r.id === id);
        if (!row) continue;
        if (row.kind === "task") actions.deleteTask(row.task.id);
        else actions.deleteNode(row.node.id);
      }
    },
    [selectedIdSet, flatRows, lockedRowIds, actions],
  );

  const buildContextItems = useCallback(
    (row: SheetRow): ContextMenuItem[] => {
      const isProject = row.id.startsWith("node:project:");
      const locked = lockedRowIds.has(row.id);
      const isTask = row.kind === "task";
      const task = isTask ? row.task : null;
      const parentNodeId =
        row.kind === "node" ? (isProject ? null : row.node.id) : row.task.wbs_node_id;
      const hasPreds = (task?.dependency_task_ids?.length ?? 0) > 0;
      const manual = task?.manually_scheduled ?? false;
      const multi = selectedIdSet.size > 1 && selectedIdSet.has(row.id);

      return [
        {
          label: "Add task below",
          icon: <Plus />,
          disabled: locked,
          onClick: () => actions.createTask("New task", row.id),
        },
        {
          label: "Add summary row",
          icon: <FolderPlus />,
          onClick: () => actions.createNode("New group", parentNodeId),
        },
        {
          label: "Indent",
          icon: <IndentIncrease />,
          separatorBefore: true,
          disabled: isProject || locked,
          onClick: () => actions.indentRow(row.id),
        },
        {
          label: "Outdent",
          icon: <IndentDecrease />,
          disabled: isProject || locked,
          onClick: () => actions.outdentRow(row.id),
        },
        {
          label: "Link selected",
          icon: <Link2 />,
          separatorBefore: true,
          disabled: !canLinkSelected || !onLinkSelected,
          onClick: () => onLinkSelected?.(),
        },
        {
          label: "Unlink",
          icon: <Link2Off />,
          disabled: !isTask || !hasPreds || !onUnlinkRow,
          onClick: () => onUnlinkRow?.(row.id),
        },
        {
          label: manual ? "Auto schedule" : "Manually schedule",
          icon: <CalendarClock />,
          separatorBefore: true,
          disabled: !isTask,
          onClick: () => task && actions.toggleManualSchedule(task.id),
        },
        {
          label: "Scroll to task",
          icon: <Locate />,
          disabled: !isTask || !onScrollToRow,
          onClick: () => onScrollToRow?.(row.id),
        },
        {
          label: multi
            ? `Delete ${selectedIdSet.size} rows`
            : isTask
              ? "Delete task"
              : "Delete summary row",
          icon: <Trash2 />,
          separatorBefore: true,
          danger: true,
          disabled: isProject || locked,
          onClick: () => deleteSelected(row),
        },
      ];
    },
    [
      lockedRowIds,
      actions,
      selectedIdSet,
      canLinkSelected,
      onLinkSelected,
      onUnlinkRow,
      onScrollToRow,
      deleteSelected,
    ],
  );

  /** Direct commit for a specific cell (hover calendar picker) — no edit mode. */
  const commitCell = useCallback(
    (rowId: string, field: SheetField, raw: string) => {
      const row = flatRows.find((r) => r.id === rowId);
      if (!row) return;
      if (row.kind === "task") actions.updateTaskField(row.task.id, field, raw);
      else if (field === "name") actions.renameNode(row.node.id, raw);
    },
    [actions, flatRows],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing || !activeCell) return;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "ArrowLeft":
        case "ArrowRight":
          e.preventDefault();
          if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
            if (activeCell.rowId !== BLANK) {
              if (e.key === "ArrowRight") actions.indentRow(activeCell.rowId);
              else actions.outdentRow(activeCell.rowId);
            }
            break;
          }
          moveActive(
            e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowUp"
                ? "up"
                : e.key === "ArrowLeft"
                  ? "left"
                  : "right",
          );
          break;
        case "Tab":
          e.preventDefault();
          moveActive(e.shiftKey ? "left" : "right");
          break;
        case "Enter":
        case "F2":
          e.preventDefault();
          if (isEditableCell(activeCell.rowId, activeCell.field)) openEditor(activeCell);
          break;
        case "Escape":
          setActiveCell(null);
          break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (isEditableCell(activeCell.rowId, activeCell.field)) {
              e.preventDefault();
              openEditor(activeCell, e.key);
            }
          }
      }
    },
    [editing, activeCell, moveActive, isEditableCell, openEditor, actions],
  );

  const blankActive = activeCell?.rowId === BLANK;
  const blankEditing = editing && blankActive;
  // No internal scrollbar — the list is sized to fit every visible row so the
  // pane wrapper scrolls and the timeline can mirror its scrollTop exactly.
  const listHeight = Math.max(ROW_HEIGHT, visibleCount * ROW_HEIGHT);

  // --- Stable <Tree> props. If any of these change identity per render,
  //     react-arborist bumps its DataUpdates counter and remounts rows. ---
  const childrenAccessor = useCallback((r: SheetRow) => r.children, []);
  const disableDrag = useCallback(
    (d: SheetRow) => d.id.startsWith("node:project:"),
    [],
  );
  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: { data?: SheetRow } | null;
      dragNodes: { data?: SheetRow }[];
    }) => {
      if (parentNode?.data?.kind === "task") return true;
      const dragId = dragNodes[0]?.data?.id;
      const parentId = parentNode?.data?.id;
      if (dragId?.startsWith("node:") && parentId?.startsWith("node:")) {
        return dragId === parentId;
      }
      return false;
    },
    [],
  );
  const onMoveRow = useCallback(
    ({ dragIds, parentId, index }: { dragIds: string[]; parentId: string | null; index: number }) => {
      if (dragIds[0]) actions.moveRow(dragIds[0], parentId, index);
    },
    [actions],
  );
  const onToggle = useCallback(
    (id: string) => {
      const isOpen = treeRef.current?.get(id)?.isOpen ?? true;
      onToggleRow(id, isOpen);
    },
    [onToggleRow],
  );

  const rowCtx = useMemo<RowCtx>(
    () => ({
      selectedRowId,
      selectedRowIds: selectedIdSet,
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
      editKey: editNonce,
      onActivateCell: activateCell,
      onStartEdit: startEdit,
      onCommitCell: handleCommit,
      onPickCell: commitCell,
      onCancelEdit: cancelEdit,
      onSelectRow: onSelectedRowChange,
      onRowContextMenu: handleRowContextMenu,
      onToggleManual: actions.toggleManualSchedule,
    }),
    [
      selectedRowId,
      selectedIdSet,
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
      editNonce,
      activateCell,
      startEdit,
      handleCommit,
      commitCell,
      cancelEdit,
      onSelectedRowChange,
      handleRowContextMenu,
      actions.toggleManualSchedule,
    ],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
      className="flex flex-col bg-background outline-none"
      style={{ width: rowWidth }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex shrink-0 items-stretch border-b border-border bg-muted text-[11px] font-semibold text-muted-foreground"
        style={{ height: headerHeight }}
      >
        <div
          className="flex items-center justify-center border-r border-border/60"
          style={{ width: ID_COL_WIDTH }}
        >
          #
        </div>
        {columns.map((c) => {
          const pinned = PINNED_COLUMNS.includes(c.field);
          return (
            <div
              key={c.field}
              draggable={!pinned}
              onDragStart={(e) => handleHeaderDragStart(e, c.field)}
              onDragOver={(e) => handleHeaderDragOver(e, c.field)}
              onDragLeave={() => handleHeaderDragLeave(c.field)}
              onDrop={(e) => handleHeaderDrop(e, c.field)}
              onDragEnd={handleHeaderDragEnd}
              onContextMenu={(e) => handleHeaderContextMenu(e, c.field)}
              className={cn(
                "relative flex shrink-0 items-center border-r border-border/60 px-1.5",
                c.align === "right" && "justify-end",
                !pinned && "cursor-grab",
                dragOverField === c.field && "bg-primary/10 ring-1 ring-inset ring-primary/50",
              )}
              style={{ width: colWidths[c.field] ?? c.width }}
            >
              {c.label}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${c.label || c.field} column`}
                draggable={false}
                onMouseDown={(e) => startResize(e, c.field)}
                onDoubleClick={() => resetColWidth(c.field)}
                className="absolute -right-[3px] top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                title="Drag to resize · double-click to reset"
              />
            </div>
          );
        })}
      </div>

      {/* Tree */}
      {tree.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-1 py-12 text-center text-xs text-muted-foreground"
          style={{ minHeight: listHeight }}
        >
          <p>{emptyState?.title ?? "No activities yet."}</p>
          <p>{emptyState?.hint ?? "Type a task name in the row below and press Enter."}</p>
        </div>
      ) : (
        <SheetRowContext.Provider value={rowCtx}>
          <Tree<SheetRow>
            ref={setTreeApi}
            data={tree}
            idAccessor="id"
            childrenAccessor={childrenAccessor}
            openByDefault
            rowHeight={ROW_HEIGHT}
            indent={0}
            padding={0}
            disableMultiSelection
            disableDrag={disableDrag}
            disableDrop={disableDrop}
            onMove={onMoveRow}
            onToggle={onToggle}
            renderRow={StaticRow}
            height={listHeight}
            width={rowWidth}
            rowClassName="outline-none"
          >
            {NodeRenderer}
          </Tree>
        </SheetRowContext.Provider>
      )}

      {/* Blank new-task row */}
      <div
        className={cn(
          "flex shrink-0 items-stretch border-t border-border bg-background text-xs",
          blankActive && "bg-primary/5",
        )}
        style={{ height: ROW_HEIGHT }}
      >
        <div
          className="flex items-center justify-center border-r border-border/60 text-[10px] text-muted-foreground"
          style={{ width: ID_COL_WIDTH }}
        >
          +
        </div>
        {columns.map((c) => {
          const width = colWidths[c.field] ?? c.width;
          if (c.field === "name") {
            return (
              <div
                key={c.field}
                className="h-full shrink-0 border-r border-border/60"
                style={{ width }}
                onMouseDown={() => activateCell(BLANK, "name")}
              >
                <SheetCell
                  column={c}
                  value={blankName}
                  editable
                  active={blankActive}
                  editing={blankEditing}
                  seed={blankActive ? editSeed : undefined}
                  editKey={editNonce}
                  onActivate={() => activateCell(BLANK, "name")}
                  onStartEdit={() => startEdit(BLANK, "name")}
                  onCommit={handleCommit}
                  onCancel={() => {
                    setBlankName("");
                    cancelEdit();
                  }}
                />
              </div>
            );
          }
          const ghost =
            c.field === "code" ? nextCodePreview : c.field === "duration" ? "1" : "";
          return (
            <div
              key={c.field}
              className={cn(
                "flex h-full shrink-0 items-center border-r border-border/60 px-1.5 text-muted-foreground/50",
                c.align === "right" && "justify-end",
              )}
              style={{ width }}
            >
              {ghost}
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <SheetRowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.row)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {headerContextMenu && (
        <SheetRowContextMenu
          x={headerContextMenu.x}
          y={headerContextMenu.y}
          items={headerContextItems}
          onClose={() => setHeaderContextMenu(null)}
        />
      )}
    </div>
  );
}
