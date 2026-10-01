"use client";

import { useEffect, useState } from "react";
import { listLeaveRequestsByStartDateToAndEndDateFromWithStatusApproved } from "@/lib/hr/hr-queries";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { UserRound } from "lucide-react";
import Link from "next/link";

const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

interface OnLeaveRecord {
  id: string;
  start_date: string;
  end_date: string;
  full_name: string;
  department: string;
  leave_name: string;
  color: string;
}

interface Props {
  compact?: boolean;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function WhoIsOnLeaveToday({ compact = false }: Props) {
  const [records, setRecords] = useState<OnLeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");

    listLeaveRequestsByStartDateToAndEndDateFromWithStatusApproved(today, today)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data || []).map((r: any) => ({
          id: r.id,
          start_date: r.start_date,
          end_date: r.end_date,
          full_name: r.profiles?.full_name ?? "Unknown",
          department: r.profiles?.department ?? "",
          leave_name: r.leave_types?.leave_name ?? "Leave",
          color: r.leave_types?.color ?? "blue",
        }));
        setRecords(rows);
        setLoading(false);
      });
  }, []);

  const displayed = compact ? records.slice(0, 5) : records;

  return (
    <Card className="rounded-xl">
      <CardContent className="pt-5 pb-5 px-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Who&apos;s on Leave Today</h3>
          </div>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              {records.length === 0
                ? "Everyone&apos;s in"
                : `${records.length} ${records.length === 1 ? "person" : "people"} on leave`}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading...</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No one is on leave today.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {displayed.map((r) => {
              const hex = COLOR_HEX[r.color] ?? COLOR_HEX.blue;
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: hex }}
                  >
                    {initials(r.full_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize truncate">{r.department}</p>
                  </div>

                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: hex }}
                  >
                    {r.leave_name}
                  </span>

                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(r.start_date), "d MMM")}
                    {r.start_date !== r.end_date && ` – ${format(new Date(r.end_date), "d MMM")}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {compact && records.length > 5 && (
          <div className="mt-3 text-right">
            <Link href="/dashboard/hr/leave" className="text-xs text-primary hover:underline">
              See all {records.length} →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
