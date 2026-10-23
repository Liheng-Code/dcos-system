"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  BookmarkPlus,
  CalendarClock,
  FileSpreadsheet,
  History,
  LayoutTemplate,
  IndentDecrease,
  IndentIncrease,
  Layers,
  Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WbsBuilderToolbarProps {
  nodeCount: number;
  selectedRowId: string | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onOpenVersions: () => void;
  /** Set when the selected row is a building: opens "Add levels from template". */
  onAddLevels?: () => void;
  /** Opens "Chainage sections" (road / pipeline routes split into sections). */
  onAddChainage?: () => void;
  onApplyWbsTemplate: () => void;
  onSaveWbsTemplate: () => void;
  /** Import WBS + activities from an Excel / CSV file. */
  onImportFile: () => void;
  /** Calculate activity dates from the project start (durations + links). */
  onSchedule: () => void;
  /** View menu (depth, activities, columns). */
  viewMenu?: React.ReactNode;
}

export function WbsBuilderToolbar({
  nodeCount,
  selectedRowId,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  onExpandAll,
  onCollapseAll,
  onOpenVersions,
  onAddLevels,
  onAddChainage,
  onApplyWbsTemplate,
  onSaveWbsTemplate,
  onImportFile,
  onSchedule,
  viewMenu,
}: WbsBuilderToolbarProps) {
  const noSelection = !selectedRowId;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onAddLevels}
        disabled={!onAddLevels}
        title={onAddLevels ? "Add levels from a level template" : "Add a Building / Area row first"}
      >
        <Layers className="h-3.5 w-3.5" /> Levels from template
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={onAddChainage}
        disabled={!onAddChainage}
        title={onAddChainage ? "Split a road / pipeline route into chainage sections" : "Add a route row first"}
      >
        <Ruler className="h-3.5 w-3.5" /> Chainage sections
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

      <span className="mx-1 h-4 w-px bg-border" />

      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onOpenVersions} title="Save a snapshot of the WBS, or restore a saved one">
        <History className="h-3.5 w-3.5" /> Versions
      </Button>

      <span className="mx-1 h-4 w-px bg-border" />

      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onApplyWbsTemplate} title="Copy a company WBS template into this project">
        <LayoutTemplate className="h-3.5 w-3.5" /> Apply WBS template
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onSaveWbsTemplate} title="Save this WBS as a company template">
        <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onImportFile} title="Import WBS and activities from an Excel or CSV file">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Import Excel / CSV
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onSchedule} title="Calculate start and finish dates from durations and links">
        <CalendarClock className="h-3.5 w-3.5" /> Schedule
      </Button>

      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        {viewMenu}
        {nodeCount} node{nodeCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
