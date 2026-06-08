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
import { type ApprovalSummaryRow } from "@/lib/insights-service";

interface Props {
  approvals: ApprovalSummaryRow[];
  loading: boolean;
}

export function ApprovalPipelineTable({ approvals, loading }: Props) {
  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  }

  if (approvals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-muted-foreground">
        No approval data for this project.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 text-xs">
            <TableHead className="w-36 font-semibold text-slate-700">Module</TableHead>
            <TableHead className="text-center font-semibold text-violet-700">Pending Review</TableHead>
            <TableHead className="text-center font-semibold text-indigo-700">Pending Approval</TableHead>
            <TableHead className="text-center font-semibold text-emerald-700">Approved / Closed</TableHead>
            <TableHead className="text-center font-semibold text-red-700">Rejected / Cancelled</TableHead>
            <TableHead className="text-center font-semibold text-slate-700">Total in Pipeline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((row) => {
            const total =
              Number(row.pending_review) +
              Number(row.pending_approval) +
              Number(row.approved) +
              Number(row.rejected);

            return (
              <TableRow key={row.discipline} className="text-xs hover:bg-slate-50/60">
                <TableCell className="font-semibold text-slate-800">{row.discipline}</TableCell>
                <TableCell className="text-center">
                  <Cell value={Number(row.pending_review)} className="text-violet-700 bg-violet-50" />
                </TableCell>
                <TableCell className="text-center">
                  <Cell value={Number(row.pending_approval)} className="text-indigo-700 bg-indigo-50" />
                </TableCell>
                <TableCell className="text-center">
                  <Cell value={Number(row.approved)} className="text-emerald-700 bg-emerald-50" />
                </TableCell>
                <TableCell className="text-center">
                  <Cell value={Number(row.rejected)} className="text-red-700 bg-red-50" />
                </TableCell>
                <TableCell className="text-center font-medium">{total}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Cell({ value, className }: { value: number; className: string }) {
  if (value === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>
      {value}
    </span>
  );
}
