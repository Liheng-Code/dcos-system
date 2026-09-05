"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TreeApi } from "react-arborist";
import { useIsWbsManager } from "@/hooks/use-is-wbs-manager";
import { WbsBuilderGrid } from "./wbs-builder-grid";
import { WbsBuilderToolbar } from "./wbs-builder-toolbar";
import { WbsVersionsDialog } from "./wbs-versions-dialog";
import { useWbsBuilderData } from "./use-wbs-builder-data";
import type { BuilderProject, WbsBuilderNode, WbsBuilderRow } from "./wbs-builder-types";

export interface WbsBuilderApi {
  reload: () => Promise<void>;
  getNodeById: (id: string) => WbsBuilderNode | null;
}

interface WbsBuilderProps {
  projectId: string;
  /** The globally-selected project — shown as the always-present top row. */
  project?: BuilderProject | null;
  /** Open the detail panel (cost / GFA / permissions) for a node — fired on any row click. */
  onOpenDetails: (nodeId: string, node?: WbsBuilderNode) => void;
  /** Handed a stable API for the parent to reload / look up nodes. */
  registerApi?: (api: WbsBuilderApi) => void;
  /** Fired after any structural change (create / delete / move / restore). */
  onDataChanged?: () => void;
}

export function WbsBuilder({
  projectId,
  project,
  onOpenDetails,
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
        onExpandAll={() => treeApiRef.current?.openAll()}
        onCollapseAll={() => treeApiRef.current?.closeAll()}
        onRefresh={() => data.reload()}
        onSaveVersion={() => openVersions("save")}
        onOpenVersions={() => openVersions("list")}
      />
      <WbsBuilderGrid
        data={data}
        isManager={isManager}
        selectedRowId={selectedRowId}
        onSelectedRowChange={setSelectedRowId}
        registerTree={registerTree}
        registerAddRow={registerAddRow}
        onOpenDetails={onOpenDetails}
      />
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
