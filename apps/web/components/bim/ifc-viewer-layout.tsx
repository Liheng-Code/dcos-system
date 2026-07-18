"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { cn } from "@/lib/utils";
import { GripVertical, Loader2 } from "lucide-react";

interface IfcViewerLayoutProps {
  leftPanel: ReactNode;
  canvas: ReactNode;
  rightPanel: ReactNode;
  toolbar: ReactNode;
  statusBar: ReactNode;
}

const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 560;
const DEFAULT_LEFT_WIDTH = 288;
const DEFAULT_RIGHT_WIDTH = 320;

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function useResizablePanelWidth(storageKey: string, defaultWidth: number) {
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isNaN(parsed)) setWidth(clampPanelWidth(parsed));
  }, [storageKey]);

  const resizeBy = useCallback((deltaX: number) => {
    setWidth((prev) => {
      const next = clampPanelWidth(prev + deltaX);
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  return [width, resizeBy] as const;
}

function ViewSplitter({ onResize, side }: { onResize: (deltaX: number) => void; side: "left" | "right" }) {
  const draggingRef = useRef(false);
  const [active, setActive] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onResize(e.movementX);
  }, [onResize]);

  const stopDragging = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setActive(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      className="group relative z-10 flex w-2.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent"
    >
      <div
        className={cn(
          "h-full w-px bg-gray-700 transition-colors group-hover:bg-blue-500",
          active && "bg-blue-500",
        )}
      />
      <div
        className={cn(
          "absolute flex h-10 w-3.5 items-center justify-center rounded-sm bg-gray-700 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 group-hover:bg-blue-500 group-hover:text-white",
          active && "opacity-100 bg-blue-500 text-white",
        )}
      >
        <GripVertical className="h-3 w-3" />
      </div>
    </div>
  );
}

export function IfcViewerLayout({ leftPanel, canvas, rightPanel, toolbar, statusBar }: IfcViewerLayoutProps) {
  const { isLoading, loadingProgress } = useBimViewer();
  const [leftWidth, resizeLeft] = useResizablePanelWidth("dcos-bim-left-panel-width", DEFAULT_LEFT_WIDTH);
  const [rightWidth, resizeRight] = useResizablePanelWidth("dcos-bim-right-panel-width", DEFAULT_RIGHT_WIDTH);

  return (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-gray-700 bg-gray-800">{toolbar}</div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div style={{ width: leftWidth }} className="shrink-0 overflow-y-auto bg-gray-800">
          {leftPanel}
        </div>

        <ViewSplitter side="left" onResize={resizeLeft} />

        {/* 3D Canvas */}
        <div className="relative flex-1">
          {canvas}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
              <Loader2 className="h-10 w-10 animate-spin text-blue-400 mb-4" />
              <p className="text-sm text-gray-300 mb-2">Loading model...</p>
              <div className="w-64 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{loadingProgress}%</p>
            </div>
          )}
        </div>

        <ViewSplitter side="right" onResize={(deltaX) => resizeRight(-deltaX)} />

        {/* Right panel */}
        <div style={{ width: rightWidth }} className="shrink-0 overflow-y-auto bg-gray-800">
          {rightPanel}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t border-gray-700 bg-gray-800">{statusBar}</div>
    </div>
  );
}
