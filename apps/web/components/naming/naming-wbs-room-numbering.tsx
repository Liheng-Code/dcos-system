"use client";

import { Hash } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { GeneratedLevel, WbsConfigState } from "./naming-wbs-types";

interface WbsRoomNumberingProps {
  startRoom: number;
  levels: GeneratedLevel[];
  config: WbsConfigState;
  onStartRoomChange: (v: number) => void;
}

export function WbsRoomNumbering({
  startRoom,
  levels,
  config,
  onStartRoomChange,
}: WbsRoomNumberingProps) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <details open>
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
          <Hash className="h-4 w-4 text-primary" />
          Room Numbering
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Start Room No.</Label>
            <input
              type="number" min="1" max="999"
              value={startRoom}
              onChange={(e) => onStartRoomChange(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pattern</Label>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm font-mono text-muted-foreground">
              [Building].[Seq].[Level]-R[NNN]
            </div>
          </div>
        </div>
        {levels.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Sample room codes:</p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {levels.slice(0, 3).map((l) => {
                const seqStr = String(l.seq).padStart(2, "0");
                const levelCode = l.code.split("-")[2];
                return (
                  <span key={l.code} className="inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-1 text-xs font-mono">
                    {config.buildingCode}.{seqStr}.{levelCode}-R{String(startRoom).padStart(3, "0")}
                  </span>
                );
              })}
              {levels.length > 3 && (
                <span className="inline-flex items-center text-xs text-muted-foreground">
                  +{levels.length - 3} more levels
                </span>
              )}
            </div>
          </div>
        )}
      </details>
    </div>
  );
}
