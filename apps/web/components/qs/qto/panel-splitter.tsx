"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical drag handle between two workspace columns. Dragging changes `width` of the panel on the
 * `side` it belongs to; arrow keys nudge it, double-click restores the default.
 */
export function PanelSplitter({ side, width, min, max, defaultWidth, onChange, label }: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  onChange: (w: number) => void;
  label: string;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      className={cn(
        "group relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none outline-none lg:block",
        "focus-visible:ring-2 focus-visible:ring-primary",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onChange(clamp(start.current.w + (side === "left" ? dx : -dx)));
      }}
      onPointerUp={(e) => {
        start.current = null;
        document.body.style.cursor = "";
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={() => onChange(defaultWidth)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") { e.preventDefault(); onChange(clamp(width + (side === "left" ? -step : step))); }
        if (e.key === "ArrowRight") { e.preventDefault(); onChange(clamp(width + (side === "left" ? step : -step))); }
      }}
    >
      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:w-[3px] group-hover:bg-primary/60 group-active:bg-primary" />
      <span className="absolute left-1/2 top-1/2 flex h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/70" />
    </div>
  );
}
