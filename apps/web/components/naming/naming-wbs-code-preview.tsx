"use client";

import { Eye, ChevronDown, ChevronRight } from "lucide-react";
import type { WbsConfigState, GeneratedLevel } from "./naming-wbs-types";

interface WbsCodePreviewProps {
  config: WbsConfigState;
  levels: GeneratedLevel[];
  zones: { levelCode: string; zoneCode: string }[];
  rooms: string[];
}

export function WbsCodePreview({ config, levels, zones, rooms }: WbsCodePreviewProps) {
  if (!config.buildingCode) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Select a building code to preview the generated WBS hierarchy
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Code Preview</span>
        <span className="text-xs text-muted-foreground">
          ({levels.length} levels, {zones.length} zones, {rooms.length} rooms)
        </span>
      </div>
      <div className="font-mono text-xs leading-relaxed">
        <div className="text-primary font-semibold">
          {config.buildingCode} — {config.buildingName || "Untitled Building"}
        </div>
        {levels.slice(0, 8).map((l) => (
          <div key={l.code} className="ml-4 text-muted-foreground">
            {l.code} <span className="text-[10px] text-muted-foreground/60">{l.label}</span>
            {zones.filter((z) => z.levelCode === l.code).slice(0, 3).map((z) => (
              <div key={z.zoneCode} className="ml-6 text-muted-foreground/70">
                {z.zoneCode}
              </div>
            ))}
            {zones.filter((z) => z.levelCode === l.code).length > 3 && (
              <div className="ml-6 text-[10px] text-muted-foreground/50">
                +{zones.filter((z) => z.levelCode === l.code).length - 3} more zones
              </div>
            )}
            {rooms.filter((r) => r.startsWith(l.code.split("-")[0] + ".")).slice(0, 1).map((r) => (
              <div key={r} className="ml-6 text-muted-foreground/50">
                {r}
              </div>
            ))}
          </div>
        ))}
        {levels.length > 8 && (
          <div className="ml-4 text-[10px] text-muted-foreground/60">
            ... and {levels.length - 8} more levels
          </div>
        )}
      </div>
    </div>
  );
}
