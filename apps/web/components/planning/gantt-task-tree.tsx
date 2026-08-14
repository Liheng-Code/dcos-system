"use client";

import { ChevronRight, ChevronDown, Flag, GanttChartSquare, GitBranch } from "lucide-react";
import type { GanttTask, GanttDisplayRow } from "./gantt-types";
import { ROW_HEIGHT } from "./gantt-types";
import { getStatusLabel, getDelayBarColor } from "./gantt-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GanttTaskTreeProps {
  displayRows: GanttDisplayRow[];
  expandedNodes: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onSelectTask: (task: GanttTask) => void;
  selectedTaskId: string | null;
}

export function GanttTaskTree({
  displayRows,
  expandedNodes,
  onToggleNode,
  onSelectTask,
  selectedTaskId,
}: GanttTaskTreeProps) {
  if (displayRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <GanttChartSquare className="h-8 w-8 opacity-30" />
        <p className="text-xs">No tasks to display</p>
        <p className="text-[10px]">Add tasks or assign them to a WBS node</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {displayRows.map((row) => {
        if (row.kind === "group") {
          return (
            <WbsNodeRowView
              key={row.id}
              code={row.data.wbs_code}
              name={row.data.wbs_name}
              depth={row.depth}
              taskCount={row.data.task_count}
              isExpanded={expandedNodes.has(row.id)}
              onToggle={() => onToggleNode(row.id)}
            />
          );
        }
        const task = row.data as GanttTask;
        return (
          <GanttTaskRowView
            key={row.id}
            task={task}
            depth={row.depth}
            isSelected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task)}
          />
        );
      })}
    </div>
  );
}

function WbsNodeRowView({
  code,
  name,
  depth,
  taskCount,
  isExpanded,
  onToggle,
}: {
  code: string;
  name: string;
  depth: number;
  taskCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 text-left hover:bg-muted/30 transition-colors border-b border-border/20"
      style={{ height: ROW_HEIGHT, paddingLeft: 12 + depth * 16 }}
    >
      {isExpanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs font-semibold text-muted-foreground">{code}</span>
        <span className="text-xs font-medium truncate">{name}</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1">
          {taskCount}
        </Badge>
      </div>
    </button>
  );
}

function GanttTaskRowView({
  task,
  depth,
  isSelected,
  onSelect,
}: {
  task: GanttTask;
  depth: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/20",
        isSelected && "bg-muted/30",
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: 12 + (depth + 1) * 16 }}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        {task.is_milestone && <Flag className="h-3 w-3 text-amber-500" />}
        {task.constraint_type && !task.is_milestone && <GitBranch className="h-3 w-3 text-blue-400" />}
        {!task.is_milestone && !task.constraint_type && (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", getDelayBarColor(task))} />
        )}
      </div>

      <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0 truncate">
        {task.task_code}
      </span>

      <span className="text-xs font-medium truncate min-w-0 flex-1">{task.task_name}</span>

      <Badge
        variant="outline"
        className={cn(
          "text-[9px] h-4 px-1 shrink-0",
          task.status === "completed" && "text-green-600 border-green-200 bg-green-50",
          task.status === "in_progress" && "text-blue-600 border-blue-200 bg-blue-50",
          task.status === "on_hold" && "text-amber-600 border-amber-200 bg-amber-50",
          task.status === "cancelled" && "text-slate-400 border-slate-200 bg-slate-50",
          task.status === "closed" && "text-slate-500 border-slate-200 bg-slate-50",
        )}
      >
        {getStatusLabel(task.status)}
      </Badge>

      <div className="flex items-center gap-1.5 shrink-0 w-20">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", task.progress >= 100 ? "bg-green-500" : "bg-primary")}
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">
          {task.progress}%
        </span>
      </div>

      {task.owner_name && (
        <span className="text-[10px] text-muted-foreground truncate w-16 shrink-0 text-right">
          {task.owner_name}
        </span>
      )}
    </button>
  );
}
