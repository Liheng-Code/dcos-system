"use client";

import { memo, useState } from "react";
import { Link2 } from "lucide-react";

interface GanttMilestoneProps {
  left: number;
  name?: string;
  date?: string;
  onClick?: () => void;
  /** Begin dragging a dependency link from this milestone */
  onStartLink?: (e: React.MouseEvent) => void;
}

function GanttMilestoneImpl({ left, name, date, onClick, onStartLink }: GanttMilestoneProps) {
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

      {/* Link handle */}
      {onStartLink && (
        <button
          type="button"
          aria-label="Drag to link to another task"
          title="Drag onto another task to create a Finish-to-Start link"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartLink(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1/2 right-0 z-30 hidden h-4 w-4 -translate-y-1/2 translate-x-2 cursor-crosshair items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow transition-transform hover:scale-110 group-hover/milestone:flex"
        >
          <Link2 className="h-2.5 w-2.5" />
        </button>
      )}

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

/**
 * Same reasoning as GanttBar's comparator (gantt-bar.tsx) — ScheduleTimeline
 * hands every milestone fresh `onClick`/`onStartLink` closures on every
 * unrelated task edit, so callbacks are compared by definedness, not
 * reference.
 */
function ganttMilestonePropsEqual(prev: Readonly<GanttMilestoneProps>, next: Readonly<GanttMilestoneProps>): boolean {
  return (
    prev.left === next.left &&
    prev.name === next.name &&
    prev.date === next.date &&
    !!prev.onClick === !!next.onClick &&
    !!prev.onStartLink === !!next.onStartLink
  );
}

export const GanttMilestone = memo(GanttMilestoneImpl, ganttMilestonePropsEqual);
