"use client";

interface GanttMilestoneProps {
  left: number;
  onClick?: () => void;
}

export function GanttMilestone({ left, onClick }: GanttMilestoneProps) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-pointer z-10 group/milestone"
      style={{ left: left - 8 }}
      onClick={onClick}
    >
      <div
        className="h-4 w-4 rotate-45 rounded-sm bg-amber-400 border-2 border-amber-600 shadow-sm transition-transform duration-150 group-hover/milestone:scale-125"
      />
    </div>
  );
}
