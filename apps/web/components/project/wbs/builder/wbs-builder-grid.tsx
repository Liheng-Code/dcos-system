"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Tree, type RowRendererProps, type TreeApi } from "react-arborist";
import { cn } from "@/lib/utils";
import type { CellNav } from "./wbs-builder-cell";
import { WbsBuilderRowView } from "./wbs-builder-row";
import {
  DEFAULT_COL_WIDTHS,
  ID_COL_WIDTH,
  MIN_COL_WIDTH,
  NAV_COLUMNS,
  NODE_TYPE_OPTIONS,
  ROW_HEIGHT,
  WBS_BUILDER_COLUMNS,
  rowWidthFrom,
  type ColWidths,
  type WbsBuilderField,
  type WbsBuilderNode,
  type WbsBuilderRow,
  type WbsColumnKey,
} from "./wbs-builder-types";
import type { UseWbsBuilderData } from "./use-wbs-builder-data";

const BLANK = "__blank__";
const COL_WIDTHS_KEY = "dcos_wbs_builder_col_widths";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Row wrapper that deliberately omits react-arborist's `node.handleClick`.
 * That handler runs `tree.select()` → `scrollToItem()` on every click, which
 * yanks the list upward. We drive selection ourselves from the row's
 * `onMouseDown`. Drag-and-drop is disabled on this grid — rows are reordered
 * with the Move up / Move down buttons (or Alt+↑ / Alt+↓).
 */
function StaticRow({ attrs, innerRef, children }: RowRendererProps<WbsBuilderRow>) {
  return (
    <div {...attrs} ref={innerRef} onFocus={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function loadColWidths(): ColWidths {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ColWidths>;
      return { ...DEFAULT_COL_WIDTHS, ...parsed };
    }
  } catch {
    /* ignore — private mode, blocked storage, bad JSON */
  }
  return DEFAULT_COL_WIDTHS;
}

interface WbsBuilderGridProps {
  data: UseWbsBuilderData;
  /** Current user may lock/unlock and edit a locked subtree. */
  isManager: boolean;
  selectedRowId: string | null;
  onSelectedRowChange: (id: string | null) => void;
  registerTree: (api: TreeApi<WbsBuilderRow> | null) => void;
  /** Hands the parent an "add a row + start editing it" callback for the toolbar. */
  registerAddRow?: (fn: () => void) => void;
  onOpenDetails: (nodeId: string, node?: WbsBuilderNode) => void;
}

export function WbsBuilderGrid({
  data,
  isManager,
  selectedRowId,
  onSelectedRowChange,
  registerTree,
  registerAddRow,
  onOpenDetails,
}: WbsBuilderGridProps) {
  const {
    tree,
    flatRows,
    rowNumberById,
    nextCodePreview,
    getNodeById,
    gfaFor,
    lockFor,
    actions,
  } = data;

  const treeRef = useRef<TreeApi<WbsBuilderRow> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // No internal scrollbars — the arborist list is sized to fit every row so the
  // whole grid grows with its content and the page does the scrolling.
  const listHeight = Math.max(ROW_HEIGHT, flatRows.length * ROW_HEIGHT) + 2;

  const [activeCell, setActiveCell] = useState<{ rowId: string; field: WbsBuilderField } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSeed, setEditSeed] = useState<string | undefined>(undefined);
  const [editNonce, setEditNonce] = useState(0);
  const [blankNodeType, setBlankNodeType] = useState("building");

  // User-resizable column widths. Start from defaults (so SSR and first client
  // render match), then hydrate from localStorage after mount.
  const [colWidths, setColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setColWidths(loadColWidths());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch {
      /* ignore */
    }
  }, [colWidths]);
  const colWidthsRef = useRef(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  });
  const rowWidth = rowWidthFrom(colWidths);

  const startResize = useCallback((e: React.MouseEvent, field: WbsColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidthsRef.current[field] ?? DEFAULT_COL_WIDTHS[field];

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_COL_WIDTH, Math.round(startW + (ev.clientX - startX)));
      setColWidths((prev) => ({ ...prev, [field]: next }));
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
  }, []);

  const resetColWidth = useCallback((field: WbsColumnKey) => {
    setColWidths((prev) => ({ ...prev, [field]: DEFAULT_COL_WIDTHS[field] }));
  }, []);

  // The cell the editor is bound to, captured when editing starts. `activeCell`
  // can change out from under a commit (e.g. an outside click lands on another
  // cell before the input's blur fires), so commits target this instead.
  const editingCellRef = useRef<{ rowId: string; field: WbsBuilderField } | null>(null);

  const openEditor = useCallback(
    (cell: { rowId: string; field: WbsBuilderField }, seed?: string) => {
      editingCellRef.current = cell;
      setEditSeed(seed);
      setEditNonce((n) => n + 1);
      setEditing(true);
    },
    [],
  );

  const setTreeApi = useCallback(
    (api: TreeApi<WbsBuilderRow> | null | undefined) => {
      treeRef.current = api ?? null;
      registerTree(api ?? null);
    },
    [registerTree],
  );

  const selectedParentId = useMemo(() => {
    const row = flatRows.find((r) => r.id === selectedRowId);
    return row?.node.parent_id ?? null;
  }, [flatRows, selectedRowId]);

  const ghostCode = nextCodePreview(blankNodeType, selectedParentId);

  const visibleIds = useCallback((): string[] => {
    return treeRef.current?.visibleNodes?.map((n) => n.data.id) ?? flatRows.map((r) => r.id);
  }, [flatRows]);

  // Every cell is editable except on the synthetic project row.
  const isEditableRow = useCallback(
    (rowId: string): boolean => !rowId.startsWith("node:project:"),
    [],
  );

  const firstEditableField = useCallback(
    (rowId: string, preferred: WbsBuilderField): WbsBuilderField =>
      isEditableRow(rowId) ? preferred : "wbs_name",
    [isEditableRow],
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
        let i = NAV_COLUMNS.indexOf(cur.field);
        for (let k = i + step; k >= 0 && k < NAV_COLUMNS.length; k += step) {
          if (isEditableRow(cur.rowId)) {
            i = k;
            break;
          }
        }
        return { rowId: cur.rowId, field: NAV_COLUMNS[i] };
      });
    },
    [visibleIds, firstEditableField, isEditableRow],
  );

  // Selecting a real row also opens its detail panel — clicking any cell is
  // enough, no separate "open details" click.
  const selectRow = useCallback(
    (rowId: string | null) => {
      onSelectedRowChange(rowId);
      if (
        rowId &&
        rowId !== BLANK &&
        rowId.startsWith("node:") &&
        !rowId.startsWith("node:project:") // the synthetic project row has no node detail
      ) {
        const id = rowId.slice(5);
        onOpenDetails(id, getNodeById(id) ?? undefined);
      }
    },
    [onSelectedRowChange, onOpenDetails, getNodeById],
  );

  const activateCell = useCallback(
    (rowId: string, field: WbsBuilderField) => {
      setActiveCell({ rowId, field });
      setEditing(false);
      setEditSeed(undefined);
      if (rowId !== BLANK) selectRow(rowId);
      containerRef.current?.focus();
    },
    [selectRow],
  );

  const startEdit = useCallback(
    (rowId: string, field: WbsBuilderField) => {
      setActiveCell({ rowId, field });
      openEditor({ rowId, field }, undefined);
    },
    [openEditor],
  );

  const cancelEdit = useCallback(() => {
    editingCellRef.current = null;
    setEditing(false);
    setEditSeed(undefined);
    containerRef.current?.focus();
  }, []);

  // Create a node after the current selection and drop straight into editing its
  // Name. Driven by the "+" strip at the bottom and the toolbar's "Add row".
  const addRow = useCallback(async () => {
    const newId = await actions.createRow("New node", selectedRowId, blankNodeType);
    if (!newId) return;
    const rowId = `node:${newId}`;
    onSelectedRowChange(rowId);
    setActiveCell({ rowId, field: "wbs_name" });
    requestAnimationFrame(() => openEditor({ rowId, field: "wbs_name" }, undefined));
  }, [actions, selectedRowId, blankNodeType, onSelectedRowChange, openEditor]);

  useEffect(() => {
    registerAddRow?.(addRow);
  }, [registerAddRow, addRow]);

  const handleCommit = useCallback(
    async (raw: string, nav: CellNav) => {
      const cell = editingCellRef.current;
      editingCellRef.current = null;
      setEditing(false);
      setEditSeed(undefined);
      if (!cell) return;

      const row = flatRows.find((r) => r.id === cell.rowId);
      if (row) await actions.updateNodeField(row.node.id, cell.field, raw);

      // A blur (nav "none") must not steal focus back from wherever the user
      // clicked; only keyboard commits keep navigating.
      if (nav === "none") return;

      // Enter on the last row's Name → chain straight into adding another row.
      if (nav === "down" && cell.field === "wbs_name") {
        const ids = visibleIds();
        const isLast = ids.indexOf(cell.rowId) === ids.length - 1;
        if (isLast && row && row.node.node_type !== "project") {
          addRow();
          containerRef.current?.focus();
          return;
        }
      }

      moveActive(nav);
      containerRef.current?.focus();
    },
    [actions, flatRows, moveActive, visibleIds, addRow],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing || !activeCell) return;

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          if (e.altKey) {
            if (e.key === "ArrowRight") actions.indentRow(activeCell.rowId);
            else actions.outdentRow(activeCell.rowId);
          } else {
            moveActive(e.key === "ArrowRight" ? "right" : "left");
          }
          break;
        }
        case "ArrowDown":
        case "ArrowUp":
          e.preventDefault();
          if (e.altKey) {
            if (e.key === "ArrowDown") actions.moveRowDown(activeCell.rowId);
            else actions.moveRowUp(activeCell.rowId);
          } else {
            moveActive(e.key === "ArrowDown" ? "down" : "up");
          }
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) actions.outdentRow(activeCell.rowId);
          else actions.indentRow(activeCell.rowId);
          break;
        case "Enter":
          e.preventDefault();
          if (isEditableRow(activeCell.rowId)) openEditor(activeCell);
          break;
        case "Escape":
          setActiveCell(null);
          break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (isEditableRow(activeCell.rowId)) {
              e.preventDefault();
              openEditor(activeCell, e.key);
            }
          }
      }
    },
    [editing, activeCell, moveActive, isEditableRow, openEditor, actions],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
      className="flex flex-col rounded-lg border border-border bg-background outline-none"
    >
      <div style={{ width: rowWidth }} className="flex flex-col">
        {/* Header */}
        <div className="flex h-8 shrink-0 items-stretch border-b border-border bg-muted text-[11px] font-semibold text-muted-foreground">
          <div
            className="flex items-center justify-center border-r border-border/60"
            style={{ width: ID_COL_WIDTH }}
          >
            #
          </div>
          {WBS_BUILDER_COLUMNS.map((c) => (
            <div
              key={c.field}
              className={cn(
                "relative flex items-center border-r border-border/60 px-1.5",
                c.align === "right" && "justify-end",
              )}
              style={{ width: colWidths[c.field] }}
            >
              {c.label}
              {c.variant !== "action" && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${c.label} column`}
                  onMouseDown={(e) => startResize(e, c.field)}
                  onDoubleClick={() => resetColWidth(c.field)}
                  className="absolute -right-[3px] top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                  title="Drag to resize · double-click to reset"
                />
              )}
            </div>
          ))}
        </div>

        {/* Tree */}
        <div>
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-12 text-center text-xs text-muted-foreground">
              <p>No WBS nodes yet.</p>
              <p>Type a name in the row below and press Enter to create the first one.</p>
            </div>
          ) : (
            <Tree<WbsBuilderRow>
              ref={setTreeApi}
              data={tree}
              idAccessor="id"
              childrenAccessor={(r) => r.children}
              openByDefault
              rowHeight={ROW_HEIGHT}
              indent={0}
              padding={0}
              disableMultiSelection
              disableDrag
              disableDrop
              renderRow={StaticRow}
              height={listHeight}
              width={rowWidth}
              rowClassName="outline-none"
            >
              {(props) => (
                <WbsBuilderRowView
                  node={props.node}
                  rowNumber={rowNumberById.get(props.node.data.id) ?? 0}
                  selected={selectedRowId === props.node.data.id}
                  readOnly={props.node.data.node.node_type === "project"}
                  colWidths={colWidths}
                  rowWidth={rowWidth}
                  activeCell={activeCell}
                  editing={editing}
                  editSeed={editSeed}
                  editKey={editNonce}
                  gfa={gfaFor(props.node.data.node.id)}
                  lock={lockFor(props.node.data.node.id)}
                  isManager={isManager}
                  onActivateCell={activateCell}
                  onStartEdit={startEdit}
                  onCommitCell={handleCommit}
                  onCancelEdit={cancelEdit}
                  onSelectRow={selectRow}
                  onDeleteRow={actions.deleteRow}
                  onSetGfa={actions.setGfa}
                  onClearGfa={actions.clearGfa}
                  onToggleLock={actions.toggleLock}
                />
              )}
            </Tree>
          )}
        </div>

        {/* Add-row strip — click the ⊕ (or the strip) to add a node and edit it */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => addRow()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              addRow();
            }
          }}
          className="group flex h-9 shrink-0 cursor-pointer items-stretch border-t border-border bg-background text-xs hover:bg-emerald-50/50"
          title="Add a new row"
        >
          <div
            className="flex items-center justify-center border-r border-border/60"
            style={{ width: ID_COL_WIDTH }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-emerald-500/50 bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
          {WBS_BUILDER_COLUMNS.map((c) => {
            if (c.field === "node_type") {
              return (
                <div
                  key={c.field}
                  className="flex h-full items-center border-r border-border/60 px-1"
                  style={{ width: colWidths[c.field] }}
                >
                  <select
                    value={blankNodeType}
                    onChange={(e) => setBlankNodeType(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-6 w-full rounded border border-border bg-background px-1 text-xs outline-none focus:border-primary"
                    aria-label="Node type for the next new row"
                  >
                    {NODE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            const content =
              c.field === "wbs_code" ? ghostCode : c.field === "wbs_name" ? "Add a row…" : "";
            return (
              <div
                key={c.field}
                className={cn(
                  "flex h-full items-center border-r border-border/60 px-1.5 text-muted-foreground/50",
                  c.mono && "font-mono",
                )}
                style={{ width: colWidths[c.field] }}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
