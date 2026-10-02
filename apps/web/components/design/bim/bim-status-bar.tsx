"use client";

import { useBimViewer, useBimFps } from "@/hooks/use-bim-viewer";

export function BimStatusBar() {
  const { modelName, revision, elementCount, loadingProgress, isLoading } = useBimViewer();
  const { fps } = useBimFps();

  return (
    <div className="flex items-center justify-between px-4 py-1.5 text-xs text-gray-400">
      <div className="flex items-center gap-4">
        <span className="font-medium text-gray-300">{modelName || "No model loaded"}</span>
        {revision && <span>Revision {revision}</span>}
        <span>{elementCount.toLocaleString()} elements</span>
      </div>
      <div className="flex items-center gap-4">
        {isLoading && <span>Loading {loadingProgress}%</span>}
        <span>FPS {fps}</span>
      </div>
    </div>
  );
}
