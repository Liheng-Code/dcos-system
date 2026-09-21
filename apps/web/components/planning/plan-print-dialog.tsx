"use client";

import { useState } from "react";
import { Printer, X } from "lucide-react";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import {
  printGanttSchedule,
  type GanttPrintOptions,
  type PrintMarginSize,
  type PrintOrientation,
  type PrintPaperSize,
} from "@/lib/planning/gantt-print";
import type { SheetRow } from "./sheet-types";

interface Props {
  projectName: string;
  defaultScheduleName: string;
  dataDate: string | null;
  tree: SheetRow[];
  float: Map<string, TaskFloat>;
  wbsCodeByRowId: Map<string, string>;
  /** Formats a task's Start/Finish for the printed table, per the user's date-format preference. */
  formatDate: (iso: string) => string;
  onClose: () => void;
}

const PAPER_SIZES: PrintPaperSize[] = ["A4", "A3", "Letter", "Legal", "Tabloid"];

export function PlanPrintDialog({
  projectName,
  defaultScheduleName,
  dataDate,
  tree,
  float,
  wbsCodeByRowId,
  formatDate,
  onClose,
}: Props) {
  const [scheduleName, setScheduleName] = useState(defaultScheduleName || "Live Schedule");
  const [paperSize, setPaperSize] = useState<PrintPaperSize>("A3");
  const [orientation, setOrientation] = useState<PrintOrientation>("landscape");
  const [margin, setMargin] = useState<PrintMarginSize>("normal");
  const [rangeMode, setRangeMode] = useState<"whole" | "custom">("whole");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [showBaseline, setShowBaseline] = useState(true);
  const [highlightCritical, setHighlightCritical] = useState(true);
  const [showProgress, setShowProgress] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);

  const customRangeInvalid = rangeMode === "custom" && (!rangeStart || !rangeEnd || rangeStart > rangeEnd);

  function handlePrint() {
    const options: GanttPrintOptions = {
      paperSize,
      orientation,
      margin,
      dateRange: rangeMode === "custom" && !customRangeInvalid ? { start: rangeStart, end: rangeEnd } : null,
      showBaseline,
      highlightCritical,
      showProgress,
      showMilestones,
      showDependencies,
    };
    printGanttSchedule(
      { projectName, scheduleName: scheduleName || "Schedule", dataDate, tree, float, wbsCodeByRowId, formatDate },
      options,
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Printer className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Print / Export PDF</h2>
            <p className="text-[11px] text-white/70">Paginated programme printout for client or record submission</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 text-xs">
          <label className="block">
            <span className="font-semibold">Schedule / programme name</span>
            <input
              type="text"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder="e.g. Construction Programme Rev C"
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-semibold">Paper size</span>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PrintPaperSize)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              >
                {PAPER_SIZES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-semibold">Margin</span>
              <select
                value={margin}
                onChange={(e) => setMargin(e.target.value as PrintMarginSize)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              >
                <option value="narrow">Narrow (8mm)</option>
                <option value="normal">Normal (15mm)</option>
                <option value="wide">Wide (25mm)</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1 font-semibold">Orientation</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={orientation === "landscape"} onChange={() => setOrientation("landscape")} /> Landscape
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={orientation === "portrait"} onChange={() => setOrientation("portrait")} /> Portrait
              </label>
            </div>
          </div>

          <div>
            <div className="mb-1 font-semibold">Date range</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={rangeMode === "whole"} onChange={() => setRangeMode("whole")} /> Whole programme
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={rangeMode === "custom"} onChange={() => setRangeMode("custom")} /> Custom range
              </label>
            </div>
            {rangeMode === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
            )}
            {customRangeInvalid && (
              <p className="mt-1 text-[11px] text-red-600">Pick a start and finish date, with start before finish.</p>
            )}
          </div>

          <div>
            <div className="mb-1 font-semibold">Include</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} /> Baseline bars
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={highlightCritical} onChange={(e) => setHighlightCritical(e.target.checked)} /> Highlight critical path
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showProgress} onChange={(e) => setShowProgress(e.target.checked)} /> % complete fill
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showMilestones} onChange={(e) => setShowMilestones(e.target.checked)} /> Milestones
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} /> Dependency links
              </label>
            </div>
          </div>

          <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            The timeline is scaled to fit the chosen paper width; rows continue onto further pages automatically with the header repeated on each page.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={customRangeInvalid}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
