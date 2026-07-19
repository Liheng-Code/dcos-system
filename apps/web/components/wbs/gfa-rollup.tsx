"use client";

import { cn } from "@/lib/utils";

interface GfaRollupProps {
  totalGfa: number | null;
  childCount: number;
}

export function GfaRollup({ totalGfa, childCount }: GfaRollupProps) {
  if (totalGfa == null || totalGfa === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 font-mono text-[11px] tabular-nums",
        "text-blue-600",
      )}
      title={`Roll-up from ${childCount} floor${childCount !== 1 ? "s" : ""}`}
    >
      <span className="font-semibold">
        {totalGfa.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      </span>
      <span className="text-[9px] text-muted-foreground">m²</span>
    </div>
  );
}
