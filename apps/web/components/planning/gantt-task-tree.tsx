"use client";

import { ChevronRight, ChevronDown, Flag, GitBranch, GanttChartSquare } from "lucide-react";
import type { GanttTask, GanttGroupRow } from "./gantt-types";
import { getStatusLabel, getDelayBarColor, getPriorityColor, getStatusBadgeVariant } from "./gantt-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GanttTaskTreeProps {
  tasks: GanttTask[];
  groups: GanttGroupRow[];
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onSelectTask: (task: GanttTask) => void;
  selectedTaskId: string | null;
  searchQuery: string;
}

export function GanttTaskTree({
  tasks,
  groups,
  expandedGroups,
  onToggleGroup,
  onSelectTask,
  selectedTaskId,
  searchQuery,
}: GanttTaskTreeProps) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const groupRows = groups
    .filter((g) => expandedGroups.has(g.id))
    .flatMap((g) => {
      const childTasks = g.children
        .map((id) => taskMap.get(id))
        .filter((t): t is GanttTask => !!t)
        .filter(
          (t) =>
            !searchQuery ||
            t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.task_code.toLowerCase().includes(searchQuery.toLowerCase()),
        );
      return [g, ...childTasks] as (GanttGroupRow | GanttTask)[];
    });

  const ungroupedTasks = tasks.filter(
    (t) =>
      !groups.some((g) => g.children.includes(t.id)) &&
      (!searchQuery ||
        t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.task_code.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const allRows = [...groupRows, ...ungroupedTasks];

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <GanttChartSquare className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-xs">No tasks match your search</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {allRows.map((row) => {
        if ("type" in row && row.type === "wbs_group") {
          return (
            <GanttGroupRowView
              key={row.id}
              group={row}
              isExpanded={expandedGroups.has(row.id)}
              onToggle={() => onToggleGroup(row.id)}
            />
          );
        }
        const task = row as GanttTask;
        return (
          <GanttTaskRowView
            key={task.id}
            task={task}
            isSelected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task)}
          />
        );
      })}
    </div>
  );
}

function GanttGroupRowView({
  group,
  isExpanded,
  onToggle,
}: {
  group: GanttGroupRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors border-b border-border/20"
      style={{ paddingLeft: 12 + group.wbs_depth * 16 }}
    >
      {isExpanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-muted-foreground">{group.wbs_code}</span>
        <span className="text-xs font-medium truncate">{group.wbs_name}</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1">
          {group.task_count}
        </Badge>
      </div>
    </button>
  );
}

function GanttTaskRowView({
  task,
  isSelected,
  onSelect,
}: {
  task: GanttTask;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/20",
        isSelected && "bg-muted/30",
      )}
      style={{ paddingLeft: 12 + (task.wbs_depth + 1) * 16 }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {task.is_milestone && <Flag className="h-3 w-3 shrink-0 text-amber-500" />}
        {task.constraint_type && <GitBranch className="h-3 w-3 shrink-0 text-blue-400" />}
        {!task.is_milestone && !task.constraint_type && (
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              getDelayBarColor(task),
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">{task.task_code}</span>
            <span className="text-xs font-medium truncate">{task.task_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-[9px] font-medium", getPriorityColor(task.priority))}>
              {task.priority}
            </span>
            {task.owner_name && (
              <span className="text-[9px] text-muted-foreground truncate">{task.owner_name}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full", task.progress >= 100 ? "bg-green-500" : "bg-primary")}
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground w-6 text-right">{task.progress}%</span>
      </div>
    </button>
  );
}
