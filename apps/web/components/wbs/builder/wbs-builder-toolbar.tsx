"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  History,
  IndentDecrease,
  IndentIncrease,
  Plus,
  RefreshCw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WbsBuilderToolbarProps {
  nodeCount: number;
  selectedRowId: string | null;
  onAddRow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
  onSaveVersion: () => void;
  onOpenVersions: () => void;
}

export function WbsBuilderToolbar({
  nodeCount,
  selectedRowId,
  onAddRow,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  onExpandAll,
  onCollapseAll,
  onRefresh,
  onSaveVersion,
  onOpenVersions,
}: WbsBuilderToolbarProps) {
  const noSelection = !selectedRowId;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAddRow}>
        <Plus className="h-3.5 w-3.5" /> Add row
      </Button>

      <span className="mx-1 h-4 w-px bg-border" />

      <Button
        size="sm"
        variant="outline"
        className="h-7 w-7 p-0"
        onClick={onMoveUp}
        disabled={noSelection}
        title="Move up (Alt+Up)"
        aria-label="Move row up"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 w-7 p-0"
        onClick={onMoveDown}
        disabled={noSelection}
        title="Move down (Alt+Down)"
        aria-label="Move row down"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>

      <span className="mx-1 h-4 w-px bg-border" />

      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onOutdent}
        disabled={noSelection}
        title="Outdent (Shift+Tab on the selected row)"
      >
        <IndentDecrease className="h-3.5 w-3.5" /> Outdent
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onIndent}
        disabled={noSelection}
        title="Indent (Tab on the selected row)"
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

      <span className="mx-1 h-4 w-px bg-border" />

      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onSaveVersion}>
        <Save className="h-3.5 w-3.5" /> Save Version
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onOpenVersions}>
        <History className="h-3.5 w-3.5" /> Versions
      </Button>

      <div className="ml-auto text-[11px] text-muted-foreground">
        {nodeCount} node{nodeCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
