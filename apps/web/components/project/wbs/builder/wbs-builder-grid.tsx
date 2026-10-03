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
  PROJECT_NODE_TYPE,
  ROW_HEIGHT,
  activityRollup,
  countVisible,
  openMapFor,
  attachActivities,
  isActivityRowId,
  rowWidthFrom,
  visibleColumnsFor,
  wbsDisplayCodes,
  type ColWidths,
  type WbsActivitySummary,
  type WbsBuilderField,
  type WbsBuilderNode,
  type WbsBuilderRow,
  type WbsColumnKey,
  type WbsViewPrefs,
} from "./wbs-builder-types";
import type { UseWbsBuilderData } from "./use-wbs-builder-data";
import type { WbsCodeMask } from "@/lib/planning/wbs-code-mask";

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
  /** Open the detail panel for a node (details button, # double-click, activity row). */
  onOpenDetails: (nodeId: string, node?: WbsBuilderNode) => void;
  /** A node row was selected (the panel follows it while open). */
  onRowSelected?: (nodeId: string, node?: WbsBuilderNode) => void;
  /** View › Columns / depth / activities. */
  view: WbsViewPrefs;
  /** The project's activities (roll-up column and optional activity rows). */
  activities: WbsActivitySummary[];
  /** The project's WBS Code Definition (Planning) — the grid shows the same codes. */
  codeMask: WbsCodeMask;
  /** Bumped on every View change, so re-choosing the same depth (Expand / Collapse all) re-applies it. */
  depthNonce: number;
}

export function WbsBuilderGrid({
  data,
  isManager,
  selectedRowId,
  onSelectedRowChange,
  registerTree,
  registerAddRow,
  onOpenDetails,
  onRowSelected,
  view,
  activities,
  depthNonce,
  codeMask,
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

  // Columns, activity rows and the per-node activity roll-up (View settings).
  const columns = useMemo(() => visibleColumnsFor(view.columns), [view.columns]);
  const navColumns = useMemo(() => NAV_COLUMNS.filter((f) => columns.some((c) => c.field === f)), [columns]);
  const displayTree = useMemo(
    () => (view.showActivities ? attachActivities(tree, activities) : tree),
    [tree, activities, view.showActivities],
  );
  // Full WBS code per row, computed with activities attached so positions match Planning.
  const codes = useMemo(() => wbsDisplayCodes(attachActivities(tree, activities), codeMask), [tree, activities, codeMask]);
  const rollup = useMemo(() => {
    const nodes = flatRows.map((r) => r.node).filter((n) => n.node_type !== PROJECT_NODE_TYPE);
    const m = activityRollup(nodes, activities);
    const project = flatRows.find((r) => r.node.node_type === PROJECT_NODE_TYPE);
    if (project) {
      const all = activityRollup(nodes.map((n) => (n.parent_id ? n : { ...n, parent_id: project.node.id })), activities)
        .get(project.node.id);
      if (all) m.set(project.node.id, all);
    }
    return m;
  }, [flatRows, activities]);

  // No internal scrollbars — the list is sized to the rows currently shown (collapsed branches
  // take no space) so the grid grows with its content and the page does the scrolling.
  const [initialOpen] = useState(() => openMapFor(displayTree, view));
  const [visibleCount, setVisibleCount] = useState(() => countVisible(displayTree, initialOpen));
  const syncVisible = useCallback(() => {
    requestAnimationFrame(() => {
      const n = treeRef.current?.visibleNodes?.length;
      if (n != null) setVisibleCount(n);
    });
  }, []);
  useEffect(() => { syncVisible(); }, [displayTree, syncVisible]);

  // Depth / activities switch: open WBS levels above the chosen depth, close the rest.
  useEffect(() => {
    const api = treeRef.current;
    if (!api) return;
    const open = openMapFor(displayTree, view);
    for (const [id, isOpen] of Object.entries(open)) {
      if (isOpen) api.open(id);
      else api.close(id);
    }
    syncVisible();
    // Re-apply only when the depth or the activities switch changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.depth, view.showActivities, depthNonce]);

  const listHeight = Math.max(ROW_HEIGHT, visibleCount * ROW_HEIGHT) + 2;

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
  const rowWidth = rowWidthFrom(colWidths, columns);

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
    (rowId: string): boolean => !rowId.startsWith("node:project:") && !isActivityRowId(rowId),
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
        let i = navColumns.indexOf(cur.field);
        for (let k = i + step; k >= 0 && k < navColumns.length; k += step) {
          if (isEditableRow(cur.rowId)) {
            i = k;
            break;
          }
        }
        return { rowId: cur.rowId, field: navColumns[i] ?? cur.field };
      });
    },
    [visibleIds, firstEditableField, isEditableRow, navColumns],
  );

  // Selecting a row only selects it (like a spreadsheet). The detail panel opens on request —
  // the row's details button or a double-click on its # cell — and, while open, follows the selection.
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
        onRowSelected?.(id, getNodeById(id) ?? undefined);
      }
    },
    [onSelectedRowChange, onRowSelected, getNodeById],
  );

  const openDetailsFor = useCallback(
    (nodeId: string) => onOpenDetails(nodeId, getNodeById(nodeId) ?? undefined),
    [onOpenDetails, getNodeById],
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
      // Activity rows are read-only: no indent / move / edit from the keyboard.
      const structural = e.key === "Tab" || (e.altKey && e.key.startsWith("Arrow"));
      if (structural && isActivityRowId(activeCell.rowId)) {
        e.preventDefault();
        return;
      }

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
          {columns.map((c) => (
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
              data={displayTree}
              idAccessor="id"
              childrenAccessor={(r) => r.children}
              openByDefault
              initialOpenState={initialOpen}
              onToggle={syncVisible}
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
                  columns={columns}
                  rollup={rollup.get(props.node.data.node.id)}
                  onOpenActivity={(_task, packageNodeId) => {
                    if (!packageNodeId.startsWith("project:")) openDetailsFor(packageNodeId);
                  }}
                  onOpenDetails={openDetailsFor}
                  displayCode={codes.get(props.node.data.id) ?? ""}
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
          {columns.map((c) => {
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
