"use client";

import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderPlus,
  IndentDecrease,
  IndentIncrease,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SheetToolbarProps {
  taskCount: number;
  capped: boolean;
  selectedRowId: string | null;
  onAddTask: () => void;
  onAddSummary: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
}

export function SheetToolbar({
  taskCount,
  capped,
  selectedRowId,
  onAddTask,
  onAddSummary,
  onIndent,
  onOutdent,
  onExpandAll,
  onCollapseAll,
  onRefresh,
}: SheetToolbarProps) {
  const noSelection = !selectedRowId;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAddTask}>
        <Plus className="h-3.5 w-3.5" /> Task
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAddSummary}>
        <FolderPlus className="h-3.5 w-3.5" /> Summary row
      </Button>

      <span className="mx-1 h-4 w-px bg-border" />

      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onOutdent}
        disabled={noSelection}
        title="Outdent (Shift+Tab on a selected row)"
      >
        <IndentDecrease className="h-3.5 w-3.5" /> Outdent
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onIndent}
        disabled={noSelection}
        title="Indent (Tab on a selected row)"
      >
        <IndentIncrease className="h-3.5 w-3.5" /> Indent
      </Button>

      <span className="mx-1 h-4 w-px bg-border" />

      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onExpandAll} title="Expand all">
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCollapseAll} title="Collapse all">
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRefresh} title="Refresh">
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>

      <div className="ml-auto text-[11px] text-muted-foreground">
        {taskCount} task{taskCount === 1 ? "" : "s"}
        {capped && <span className="ml-1 text-amber-600">· showing first 1000 — use the Gantt for larger schedules</span>}
      </div>
    </div>
  );
}
