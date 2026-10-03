"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TreeApi } from "react-arborist";
import { useIsWbsManager } from "@/hooks/use-is-wbs-manager";
import { WbsBuilderGrid } from "./wbs-builder-grid";
import { WbsBuilderToolbar } from "./wbs-builder-toolbar";
import { WbsVersionsDialog } from "./wbs-versions-dialog";
import { ApplyLevelTemplateDialog } from "@/components/project/wbs/levels/apply-level-template-dialog";
import { ApplyWbsTemplateDialog } from "@/components/project/wbs/templates/apply-wbs-template-dialog";
import { SaveAsWbsTemplateDialog } from "@/components/project/wbs/templates/save-as-wbs-template-dialog";
import { MasterWbsImportDialog } from "@/components/project/wbs/master-wbs-import-dialog";
import { useWbsBuilderData } from "./use-wbs-builder-data";
import { DEFAULT_VIEW, WBS_BUILDER_COLUMNS, type BuilderProject, type WbsBuilderNode, type WbsBuilderRow, type WbsViewPrefs } from "./wbs-builder-types";
import { useWbsActivities, useWbsCodeMask } from "./use-wbs-activities";
import { WbsBuilderViewMenu } from "./wbs-builder-view-menu";

const VIEW_KEY = "dcos_wbs_builder_view";

export interface WbsBuilderApi {
  reload: () => Promise<void>;
  getNodeById: (id: string) => WbsBuilderNode | null;
}

interface WbsBuilderProps {
  projectId: string;
  /** The globally-selected project — shown as the always-present top row. */
  project?: BuilderProject | null;
  /** Open the detail panel (schedule / activities / cost) for a node — details button, # double-click, activity row. */
  onOpenDetails: (nodeId: string, node?: WbsBuilderNode) => void;
  /** A row was selected; the detail panel follows it while open. */
  onRowSelected?: (nodeId: string, node?: WbsBuilderNode) => void;
  /** Handed a stable API for the parent to reload / look up nodes. */
  registerApi?: (api: WbsBuilderApi) => void;
  /** Fired after any structural change (create / delete / move / restore). */
  onDataChanged?: () => void;
}

export function WbsBuilder({
  projectId,
  project,
  onOpenDetails,
  onRowSelected,
  registerApi,
  onDataChanged,
}: WbsBuilderProps) {
  const isManager = useIsWbsManager();
  const data = useWbsBuilderData(projectId, project, isManager);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsMode, setVersionsMode] = useState<"save" | "list">("list");
  const treeApiRef = useRef<TreeApi<WbsBuilderRow> | null>(null);

  const registerTree = useCallback((api: TreeApi<WbsBuilderRow> | null) => {
    treeApiRef.current = api;
  }, []);

  // The grid owns "add a row + edit it"; keep a handle so the toolbar can call it.
  const addRowRef = useRef<() => void>(() => {});
  const registerAddRow = useCallback((fn: () => void) => {
    addRowRef.current = fn;
  }, []);

  // "Add levels": open for any building; default to the selected building, or the building
  // above a selected level/zone, else the first building.
  const [levelsFor, setLevelsFor] = useState<string | null>(null);
  const [wbsTemplateDialog, setWbsTemplateDialog] = useState<"apply" | "save" | "import" | null>(null);
  const buildings = useMemo(() => data.nodes.filter((n) => n.node_type === "building"), [data.nodes]);
  const defaultBuildingId = useMemo(() => {
    // Row ids are "node:<uuid>"; getNodeById takes the bare id.
    let node = selectedRowId?.startsWith("node:") ? data.getNodeById(selectedRowId.slice(5)) : null;
    while (node && node.node_type !== "building") node = node.parent_id ? data.getNodeById(node.parent_id) : null;
    return node?.id ?? buildings[0]?.id ?? null;
  }, [selectedRowId, data, buildings]);

  const { reload, getNodeById } = data;
  useEffect(() => {
    registerApi?.({ reload, getNodeById });
  }, [registerApi, reload, getNodeById]);

  // Notify the parent whenever the node set changes size or identity — via a ref
  // so an unstable callback prop can't retrigger the effect.
  const onDataChangedRef = useRef(onDataChanged);
  useEffect(() => {
    onDataChangedRef.current = onDataChanged;
  });
  const changeKey = useMemo(
    () => data.nodes.map((n) => n.id).join(",") + "|" + data.nodes.length,
    [data.nodes],
  );
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onDataChangedRef.current?.();
  }, [changeKey]);

  // View settings (depth, activity rows, columns), remembered per user in this browser.
  // Start from the default so SSR and the first client render match, then hydrate.
  const [view, setView] = useState<WbsViewPrefs>(DEFAULT_VIEW);
  const [depthNonce, setDepthNonce] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<WbsViewPrefs>;
        // Drop columns that no longer exist (e.g. the removed Level Breakdown).
        const known = new Set(WBS_BUILDER_COLUMNS.map((c) => c.field));
        const columns = Array.isArray(saved.columns) ? saved.columns.filter((c) => known.has(c)) : DEFAULT_VIEW.columns;
        /* eslint-disable-next-line react-hooks/set-state-in-effect */
        setView({ ...DEFAULT_VIEW, ...saved, columns });
      }
    } catch {
      /* ignore — private mode, blocked storage, bad JSON */
    }
  }, []);
  const changeView = useCallback((next: WbsViewPrefs) => {
    setView(next);
    setDepthNonce((n) => n + 1);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);
  // Activities for the roll-up column / activity rows; reloaded when the node set changes.
  const activities = useWbsActivities(projectId, changeKey);
  const codeMask = useWbsCodeMask(projectId);

  const openVersions = useCallback((mode: "save" | "list") => {
    setVersionsMode(mode);
    setVersionsOpen(true);
  }, []);

  if (data.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <WbsBuilderToolbar
        nodeCount={data.nodeCount}
        selectedRowId={selectedRowId}
        onAddRow={() => addRowRef.current()}
        onMoveUp={() => selectedRowId && data.actions.moveRowUp(selectedRowId)}
        onMoveDown={() => selectedRowId && data.actions.moveRowDown(selectedRowId)}
        onIndent={() => selectedRowId && data.actions.indentRow(selectedRowId)}
        onOutdent={() => selectedRowId && data.actions.outdentRow(selectedRowId)}
        onExpandAll={() => changeView({ ...view, depth: "all" })}
        onCollapseAll={() => changeView({ ...view, depth: 1 })}
        viewMenu={<WbsBuilderViewMenu view={view} onChange={changeView} />}
        onSaveVersion={() => openVersions("save")}
        onOpenVersions={() => openVersions("list")}
        onAddLevels={defaultBuildingId ? () => setLevelsFor(defaultBuildingId) : undefined}
        onApplyWbsTemplate={() => setWbsTemplateDialog("apply")}
        onSaveWbsTemplate={() => setWbsTemplateDialog("save")}
        onImportFile={() => setWbsTemplateDialog("import")}
      />
      {wbsTemplateDialog === "apply" && (
        <ApplyWbsTemplateDialog
          projectId={projectId}
          open
          onOpenChange={(open) => { if (!open) setWbsTemplateDialog(null); }}
          onApplied={() => {
            data.reload();
            onDataChanged?.();
          }}
        />
      )}
      {wbsTemplateDialog === "import" && (
        <MasterWbsImportDialog
          projectId={projectId}
          onClose={() => setWbsTemplateDialog(null)}
          onImported={() => {
            data.reload();
            onDataChanged?.();
          }}
        />
      )}
      {wbsTemplateDialog === "save" && (
        <SaveAsWbsTemplateDialog
          projectId={projectId}
          projectName={project?.project_name}
          open
          onOpenChange={(open) => { if (!open) setWbsTemplateDialog(null); }}
        />
      )}
      <WbsBuilderGrid
        data={data}
        isManager={isManager}
        selectedRowId={selectedRowId}
        onSelectedRowChange={setSelectedRowId}
        registerTree={registerTree}
        registerAddRow={registerAddRow}
        onOpenDetails={onOpenDetails}
        onRowSelected={onRowSelected}
        view={view}
        depthNonce={depthNonce}
        codeMask={codeMask}
        activities={activities}
      />
      {levelsFor && (
        <ApplyLevelTemplateDialog
          buildings={buildings}
          initialBuildingId={levelsFor}
          open
          onOpenChange={(open) => { if (!open) setLevelsFor(null); }}
          onApplied={() => {
            data.reload();
            onDataChanged?.();
          }}
        />
      )}
      {versionsOpen && (
        <WbsVersionsDialog
          onClose={() => setVersionsOpen(false)}
          projectId={projectId}
          initialMode={versionsMode}
          onChanged={() => {
            data.reload();
            onDataChanged?.();
          }}
        />
      )}
    </div>
  );
}
