"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type DisciplineSummary } from "@/lib/reporting/insights-service";

interface Props {
  disciplines: DisciplineSummary[];
  loading: boolean;
  onDrillDown?: (discipline: string) => void;
}

const STATUS_COLUMNS = [
  { key: "open",        label: "Open",       className: "text-slate-600 bg-slate-50" },
  { key: "in_progress", label: "In Progress", className: "text-blue-700 bg-blue-50" },
  { key: "paused",      label: "Paused",      className: "text-slate-500 bg-slate-50" },
  { key: "blocked",     label: "Blocked",     className: "text-amber-700 bg-amber-50" },
  { key: "review",      label: "Review",      className: "text-violet-700 bg-violet-50" },
  { key: "submitted",   label: "Submitted",   className: "text-indigo-700 bg-indigo-50" },
  { key: "completed",   label: "Completed",   className: "text-emerald-700 bg-emerald-50" },
  { key: "closed",      label: "Closed",      className: "text-emerald-800 bg-emerald-50" },
  { key: "cancelled",   label: "Cancelled",   className: "text-slate-400 bg-slate-50" },
  { key: "rejected",    label: "Rejected",    className: "text-red-700 bg-red-50" },
] as const;

function StatusBadge({ count, className }: { count: number; className: string }) {
  if (count === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>
      {count}
    </span>
  );
}

export function TaskStatusTable({ disciplines, loading, onDrillDown }: Props) {
  if (loading) {
    return (
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 text-xs">
            <TableHead className="w-36 font-semibold text-slate-700">Module</TableHead>
            {STATUS_COLUMNS.map((col) => (
              <TableHead key={col.key} className="text-center font-semibold text-slate-700">
                {col.label}
              </TableHead>
            ))}
            <TableHead className="text-center font-semibold text-slate-700">Total</TableHead>
            <TableHead className="text-center font-semibold text-slate-700">% Done</TableHead>
            <TableHead className="text-center font-semibold text-slate-700">Overdue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {disciplines.map((d) => {
            const doneCount =
              (d.statusCounts["completed"] ?? 0) + (d.statusCounts["closed"] ?? 0);
            const donePct =
              d.totalTasks > 0 ? Math.round((doneCount / d.totalTasks) * 100) : 0;

            return (
              <TableRow key={d.discipline} className={cn("text-xs hover:bg-slate-50/60", d.discipline && onDrillDown && "cursor-pointer")}>
                <TableCell
                  className="font-semibold text-slate-800"
                  onClick={() => onDrillDown?.(d.discipline)}
                >{d.discipline}</TableCell>
                {STATUS_COLUMNS.map((col) => (
                  <TableCell key={col.key} className="text-center">
                    <StatusBadge
                      count={d.statusCounts[col.key] ?? 0}
                      className={col.className}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-center font-medium">{d.totalTasks}</TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "font-semibold",
                    donePct >= 80 ? "text-emerald-600" : donePct >= 50 ? "text-blue-600" : "text-slate-600",
                  )}>
                    {donePct}%
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {d.overdueCount > 0 ? (
                    <span className="font-semibold text-red-600">{d.overdueCount}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
