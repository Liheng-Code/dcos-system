"use client";

import { useState, useCallback } from "react";
import * as THREE from "three";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { useBimComponents, useBimWorld, useBimFragments } from "./ifc-viewer";
import { FragmentsManager } from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import { ChevronDown, ChevronRight, Eye, EyeOff, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LevelInfo, SpatialTreeNode } from "@/lib/design/bim/bim-types";

export function SpatialTree() {
  const { spatialTree } = useBimViewer();
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold text-gray-200 hover:text-white"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Box className="h-4 w-4" />
        Model Tree
      </button>
      {expanded && (
        <div className="mt-2 ml-2 space-y-0.5 text-xs">
          {spatialTree.length === 0 ? (
            <p className="text-gray-500 py-2">Loading spatial tree...</p>
          ) : (
            spatialTree.map((node) => (
              <TreeNode key={node.id} node={node} depth={0} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function collectLocalIds(node: SpatialTreeNode): number[] {
  const ids: number[] = [];
  if (node.expressId !== undefined && node.type === "element") {
    ids.push(node.expressId);
  }
  for (const child of node.children) {
    ids.push(...collectLocalIds(child));
  }
  return ids;
}

function findFragModel(fragments: FragmentsManager | null, modelId: string) {
  if (!fragments?.initialized) return null;
  for (const [key, fragModel] of fragments.list) {
    if (fragModel.modelId === modelId || key === modelId) return fragModel;
  }
  return null;
}

// Storey nodes in the model tree reflect the IFC file's own spatial-containment
// relations, not real-world position. Structural/foundation exports routinely
// contain elements (e.g. bored piles) under the wrong storey — they show up as
// children of "L1" in the file even though their actual geometry sits down at
// "UG". Cross-check each candidate element's true vertical position against the
// level's own elevation before including it, so hiding/picking a storey doesn't
// sweep up elements that only *look* like they belong to it on paper.
async function filterIdsByNearestLevel(
  localIds: number[],
  fragModel: FRAGS.FragmentsModel,
  levels: LevelInfo[],
  levelName: string,
): Promise<number[]> {
  if (levels.length < 2) return localIds;
  const boxes = await fragModel.getBoxes(localIds);
  return localIds.filter((id, i) => {
    const box = boxes[i];
    if (!box) return true;
    const centerY = (box.min.y + box.max.y) / 2;
    let nearest = levels[0];
    let nearestDist = Math.abs(centerY - nearest.elevation);
    for (const lvl of levels) {
      const dist = Math.abs(centerY - lvl.elevation);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = lvl;
      }
    }
    return nearest.name === levelName;
  });
}

function TreeNode({ node, depth }: { node: SpatialTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const components = useBimComponents();
  const world = useBimWorld();
  const fragments = useBimFragments();
  const {
    selectedTreeId, setSelectedTreeId,
    setSelectedItems, setElementProperties,
    hiddenItems, toggleItemVisibility,
    selectionColor, levels,
  } = useBimViewer();

  const isSelected = selectedTreeId === node.id;
  const isHidden = node.expressId !== undefined && node.modelId
    ? (hiddenItems.get(node.modelId) ?? []).includes(node.expressId)
    : false;

  const handlePick = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!components || !world || !node.modelId || node.expressId === undefined) return;

    const fragmentsManager = components.get(FragmentsManager);
    const fragModel = findFragModel(fragmentsManager, node.modelId);
    if (!fragModel) return;

    // Toggle off if clicking same node
    if (isSelected) {
      for (const [, fm] of fragmentsManager.list) {
        await fm.resetHighlight();
      }
      setSelectedTreeId(null);
      setSelectedItems(new Map());
      setElementProperties(null);
      return;
    }

    // Collect all localIds under this node
    let localIds = node.children.length > 0 ? collectLocalIds(node) : [node.expressId];
    if (localIds.length === 0) return;
    if (node.type === "storey") {
      localIds = await filterIdsByNearestLevel(localIds, fragModel, levels, node.name);
    }

    // Reset all highlights
    for (const [, fm] of fragmentsManager.list) {
      await fm.resetHighlight();
    }

    // Highlight
    await fragModel.highlight(localIds, {
      color: new THREE.Color(selectionColor),
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    });

    setSelectedTreeId(node.id);
    setSelectedItems(new Map([[node.modelId, localIds]]));

    // Fetch properties for the first element
    const [itemData] = await fragModel.getItemsData([localIds[0]], {
      attributesDefault: true,
      relationsDefault: { attributes: true, relations: true },
    });
    const { extractPropertiesFromItemData } = await import("@/lib/design/bim/ifc-helpers");
    setElementProperties(extractPropertiesFromItemData(itemData as Record<string, unknown>));

    // Zoom to the element(s)
    try {
      const box = await fragModel.getMergedBox(localIds);
      if (box) {
        const controls = world.camera.controls as any;
        await controls.fitToBox(box, true);
      }
    } catch {
      // Some nodes may not have geometry (e.g. IFCPROJECT root)
    }
  }, [components, world, node, isSelected, selectionColor, levels, setSelectedTreeId, setSelectedItems, setElementProperties]);

  const handleToggleVisibility = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!components || !node.modelId || node.expressId === undefined) return;

    const fragmentsManager = components.get(FragmentsManager);
    const fragModel = findFragModel(fragmentsManager, node.modelId);
    if (!fragModel) return;

    let localIds = node.children.length > 0 ? collectLocalIds(node) : [node.expressId];
    if (localIds.length === 0) return;
    if (node.type === "storey") {
      localIds = await filterIdsByNearestLevel(localIds, fragModel, levels, node.name);
      if (localIds.length === 0) return;
    }

    // Determine current hidden state and toggle
    const anyHidden = localIds.some((id) => (hiddenItems.get(node.modelId!) ?? []).includes(id));
    await fragModel.setVisible(localIds, anyHidden);
    toggleItemVisibility(node.modelId, localIds);
  }, [components, node, hiddenItems, toggleItemVisibility, levels]);

  const handleRowClick = useCallback(() => {
    if (node.children.length > 0) {
      setExpanded((prev) => !prev);
    } else {
      handlePick();
    }
  }, [node, handlePick]);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer group",
          isSelected ? "bg-blue-600/30 text-white" : "hover:bg-gray-700 text-gray-300",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleRowClick}
      >
        {node.children.length > 0 ? (
          expanded
            ? <ChevronDown className="h-3 w-3 shrink-0 text-gray-500" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-gray-500" />
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate">{node.name}</span>
        {node.expressId !== undefined && (
          <div className="ml-auto shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handlePick}
              className={cn(
                "p-0.5 rounded hover:bg-gray-600",
                isSelected ? "text-blue-400" : "text-gray-400",
              )}
              title={isSelected ? "Deselect" : "Pick element"}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              onClick={handleToggleVisibility}
              className={cn(
                "p-0.5 rounded hover:bg-gray-600",
                isHidden ? "text-gray-600" : "text-gray-400",
              )}
              title={isHidden ? "Show element" : "Hide element"}
            >
              {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>
      {expanded && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
