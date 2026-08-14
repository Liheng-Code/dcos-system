"use client";

import { useState } from "react";

interface GanttMilestoneProps {
  left: number;
  name?: string;
  date?: string;
  onClick?: () => void;
}

export function GanttMilestone({ left, name, date, onClick }: GanttMilestoneProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-pointer z-10 group/milestone"
      style={{ left: left - 8 }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="h-4 w-4 rotate-45 rounded-sm bg-amber-400 border-2 border-amber-600 shadow-sm transition-transform duration-150 group-hover/milestone:scale-125" />

      {/* Tooltip */}
      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md text-[11px] whitespace-nowrap">
            <div className="font-semibold">{name || "Milestone"}</div>
            {date && <div className="text-muted-foreground">{date}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
