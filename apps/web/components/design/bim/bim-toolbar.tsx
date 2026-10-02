"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { useBimComponents, useBimWorld, useBimItemData } from "@/components/design/bim/ifc-viewer";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Eye, EyeOff, Scissors, Ruler, Maximize2, Grid3X3, Camera,
  Settings, RotateCcw, Ghost, Layers, ArrowUpFromLine,
  Orbit, Hand, MousePointer2, Pencil, Trash2, Footprints,
  ClipboardList, Loader2, ListChecks,
} from "lucide-react";
import { Clipper, Hider } from "@thatopen/components";
import { BimEditDialog } from "./bim-edit-dialog";
import { BimDeleteDialog } from "./bim-delete-dialog";
import { BimReviewPromoteDialog } from "./bim-review-promote-dialog";
import { extractBoqFieldsFromItemData } from "@/lib/design/bim/ifc-helpers";
import type { BimModel } from "@/lib/design/bim/bim-types";

function ClipboardListIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} />;
}
function SpinningLoaderIcon({ className }: { className?: string }) {
  return <Loader2 className={`${className ?? ""} animate-spin`} />;
}

interface BimToolbarProps {
  modelId: string;
  model?: BimModel | null;
  onModelUpdated?: () => void;
}

const ToolBtn = ({ icon: Icon, label, active, onClick, variant = "ghost" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  variant?: "ghost" | "outline";
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant={active ? "outline" : variant}
          size="sm"
          onClick={onClick}
          className={active ? "bg-blue-600 text-white hover:bg-blue-700" : "text-gray-300 hover:text-white hover:bg-gray-700"}
        />
      }
    >
      <Icon className="h-4 w-4" />
    </TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
);

export function BimToolbar({ modelId, model, onModelUpdated }: BimToolbarProps) {
  const router = useRouter();
  const {
    activeTool, setActiveTool, ghostMode, setGhostMode,
    projectionMode, setProjectionMode, setShowGrid, showGrid,
    selectedItems, setSelectedItems, toggleItemVisibility,
  } = useBimViewer();
  const components = useBimComponents();
  const world = useBimWorld();
  const itemDataRef = useBimItemData();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const handleExtractTakeoff = async () => {
    if (extracting) return;
    if (!itemDataRef || itemDataRef.current.length === 0) {
      toast.error("Model not fully loaded yet");
      return;
    }
    setExtracting(true);
    try {
      const elements = itemDataRef.current
        .map((item) => extractBoqFieldsFromItemData(item))
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (elements.length === 0) {
        toast.error("No elements with a GlobalId were found to extract");
        return;
      }

      const missing = elements.filter((el) => el.quantity == null || !el.unit).length;

      const res = await fetch(`/api/bim/models/${modelId}/takeoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to extract takeoff data");

      toast.success(
        missing > 0
          ? `Extracted ${json.data.extracted} elements (${missing} missing quantity/unit)`
          : `Extracted ${json.data.extracted} elements`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract takeoff data");
    } finally {
      setExtracting(false);
    }
  };

  const toggleProjection = () => {
    if (!world) return;
    const newMode = projectionMode === "Perspective" ? "Orthographic" : "Perspective";
    setProjectionMode(newMode);
  };

  const handleFitAll = () => {
    if (!world) return;
    const cam = world.camera as import("@thatopen/components").SimpleCamera;
    cam.fitToItems();
  };

  const toggleSectionPlane = () => {
    if (!components || !world) return;
    const clipper = components.get(Clipper);
    if (activeTool === "section-plane") {
      clipper.enabled = false;
      setActiveTool(null);
    } else {
      clipper.enabled = true;
      setActiveTool("section-plane");
    }
  };

  const clearSections = () => {
    if (!components) return;
    const clipper = components.get(Clipper);
    clipper.list.forEach((_, key) => clipper.list.delete(key));
    clipper.enabled = false;
    setActiveTool(null);
  };

  // Isolate/Hide act on whatever's currently selected (pick with plain
  // click, Ctrl+click to add, Shift+click to remove — see ifc-viewer.tsx's
  // handleCanvasClick), rather than arming a separate click mode: select
  // first, then choose what to do with the selection.
  const selectionAsModelIdMap = (): Record<string, Set<number>> | null => {
    const modelIdMap: Record<string, Set<number>> = {};
    for (const [modelId, ids] of selectedItems) {
      if (ids.length > 0) modelIdMap[modelId] = new Set(ids);
    }
    return Object.keys(modelIdMap).length > 0 ? modelIdMap : null;
  };

  const handleIsolate = async () => {
    if (!components) return;
    const modelIdMap = selectionAsModelIdMap();
    if (!modelIdMap) return;
    const hider = components.get(Hider);
    await hider.isolate(modelIdMap);
  };

  const handleHide = async () => {
    if (!components) return;
    const modelIdMap = selectionAsModelIdMap();
    if (!modelIdMap) return;
    const hider = components.get(Hider);
    await hider.set(false, modelIdMap);
    for (const [modelId, ids] of selectedItems) {
      if (ids.length > 0) toggleItemVisibility(modelId, ids);
    }
    setSelectedItems(new Map());
  };

  const handleShowAll = () => {
    if (!components) return;
    const hider = components.get(Hider);
    hider.set(true);
  };

  const handleDeleteComplete = () => {
    router.push("/dashboard/design/bim");
  };

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2">
        <ToolBtn icon={Orbit} label="Orbit" active={activeTool === "orbit" || activeTool === null} onClick={() => setActiveTool("orbit")} />
        <ToolBtn icon={Hand} label="Pan" active={activeTool === "pan"} onClick={() => setActiveTool("pan")} />
        <ToolBtn icon={MousePointer2} label="Select" active={activeTool === "select"} onClick={() => setActiveTool("select")} />
        <ToolBtn
          icon={Footprints}
          label="Walkthrough (Arrow keys to move)"
          active={activeTool === "walkthrough"}
          onClick={() => setActiveTool(activeTool === "walkthrough" ? "orbit" : "walkthrough")}
        />
        <div className="w-px h-6 bg-gray-600 mx-1" />
        <ToolBtn icon={Maximize2} label="Fit All (F)" onClick={handleFitAll} />
        <div className="w-px h-6 bg-gray-600 mx-1" />
        <ToolBtn icon={Scissors} label="Section Plane" active={activeTool === "section-plane"} onClick={toggleSectionPlane} />
        <ToolBtn icon={RotateCcw} label="Clear Sections" onClick={clearSections} />
        <div className="w-px h-6 bg-gray-600 mx-1" />
        <ToolBtn icon={Ruler} label="Measure" active={activeTool === "measure"} onClick={() => setActiveTool(activeTool === "measure" ? null : "measure")} />
        <ToolBtn icon={Eye} label="Isolate selection" onClick={handleIsolate} />
        <ToolBtn icon={EyeOff} label="Hide selection" onClick={handleHide} />
        <ToolBtn icon={Layers} label="Show All" onClick={handleShowAll} />
        <ToolBtn icon={Ghost} label="Ghost Mode" active={ghostMode} onClick={() => setGhostMode(!ghostMode)} />
        <div className="w-px h-6 bg-gray-600 mx-1" />
        <ToolBtn icon={Grid3X3} label="Toggle Grid" active={showGrid} onClick={() => setShowGrid(!showGrid)} />
        <ToolBtn icon={ArrowUpFromLine} label="Perspective/Ortho" onClick={toggleProjection} />
        <div className="ml-auto" />
        {model && (
          <>
            <ToolBtn icon={Camera} label="Screenshot" onClick={() => {}} />
            <div className="w-px h-6 bg-gray-600 mx-1" />
            <ToolBtn
              icon={extracting ? SpinningLoaderIcon : ClipboardListIcon}
              label={extracting ? "Extracting..." : "Extract for Takeoff"}
              onClick={handleExtractTakeoff}
            />
            <ToolBtn icon={ListChecks} label="Review & Promote Takeoff" onClick={() => setPromoteOpen(true)} />
            <ToolBtn icon={Pencil} label="Edit Model" onClick={() => setEditOpen(true)} />
            <ToolBtn icon={Trash2} label="Delete Model" onClick={() => setDeleteOpen(true)} />
          </>
        )}
      </div>

      {model && (
        <>
          <BimEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            model={model}
            onComplete={() => onModelUpdated?.()}
          />
          <BimDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            model={model}
            onComplete={handleDeleteComplete}
          />
          <BimReviewPromoteDialog
            open={promoteOpen}
            onOpenChange={setPromoteOpen}
            modelId={modelId}
            projectId={model.project_id}
          />
        </>
      )}
    </>
  );
}
