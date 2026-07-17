"use client";

import { useState } from "react";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function LevelsPanel() {
  const { levels, toggleLevel, hiddenByLevel } = useBimViewer();
  const [expanded, setExpanded] = useState(true);

  if (levels.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold text-gray-200 hover:text-white"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Layers className="h-4 w-4" />
        Levels
      </button>
      {expanded && (
        <div className="mt-2 ml-2 space-y-0.5 text-xs">
          {levels.map((level) => {
            const isHidden = hiddenByLevel.has(level.name);
            return (
              <div
                key={level.expressId}
                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-700 cursor-pointer"
                onClick={() => toggleLevel(level.name)}
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleLevel(level.name)}
                  className="h-3 w-3 rounded border-gray-600"
                />
                <span className={cn("truncate", isHidden ? "text-gray-500" : "text-gray-300")}>
                  {level.name}
                </span>
                <span className="ml-auto text-gray-600">
                  {level.elevation.toFixed(1)}m
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
