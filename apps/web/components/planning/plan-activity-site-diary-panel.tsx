"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CloudSun,
  ExternalLink,
  FileText,
  HardHat,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getTaskSiteDiaryHistory,
  type TaskSiteDiaryHistory,
} from "@/lib/site/public";
import { cn } from "@/lib/utils";

interface PlanActivitySiteDiaryPanelProps {
  taskId: string;
  taskCode?: string;
  taskName?: string;
}

export function PlanActivitySiteDiaryPanel({
  taskId,
  taskCode,
  taskName,
}: PlanActivitySiteDiaryPanelProps) {
  const [history, setHistory] = useState<TaskSiteDiaryHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!taskId) return;
      setLoading(true);
      try {
        const data = await getTaskSiteDiaryHistory(taskId);
        if (!cancelled) setHistory(data);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load site diary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Aggregate metrics
  const totalEntries = history.length;
  const totalHours = history.reduce((sum, h) => sum + (h.hours_total || 0), 0);
  const totalDelays = history.filter((h) => h.has_delay).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <HardHat className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold text-foreground">
            Site Diary & Field Actuals
          </h3>
          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
            {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
          </Badge>
        </div>

        <Link
          href="/dashboard/site/daily-reports"
          target="_blank"
          className="text-[11px] text-primary hover:underline flex items-center gap-1"
        >
          Daily Reports Hub
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center bg-muted/20">
          <FileText className="mx-auto h-7 w-7 text-muted-foreground/40 mb-1.5" />
          <p className="text-xs font-semibold text-foreground">No Site Diary Entries</p>
          <p className="text-[11px] text-muted-foreground max-w-xs mx-auto mt-0.5">
            When site engineers log daily progress, crew hours, or quantities for this activity in Construction Daily Reports, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Summary Pills */}
          <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded-lg border border-border/60 text-center">
            <div>
              <span className="text-[10px] text-muted-foreground block">Site Returns</span>
              <span className="text-xs font-bold tabular-nums text-foreground">
                {totalEntries} days
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Actual Crew Time</span>
              <span className="text-xs font-bold tabular-nums text-foreground">
                {totalHours.toFixed(1)} hrs
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Delays Flagged</span>
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  totalDelays > 0 ? "text-amber-600" : "text-muted-foreground"
                )}
              >
                {totalDelays} events
              </span>
            </div>
          </div>

          {/* Timeline of Site Logs */}
          <div className="space-y-2">
            {history.map((h, idx) => (
              <div
                key={`${h.daily_report_id}-${idx}`}
                className="rounded-lg border border-border bg-card p-3 shadow-xs space-y-2"
              >
                {/* Entry Top Row */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      {h.report_date ? new Date(h.report_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </span>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 capitalize",
                        h.activity_status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : h.activity_status === "hindered"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : h.activity_status === "stopped"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      )}
                    >
                      {h.activity_status?.replace("_", " ")}
                    </Badge>
                  </div>

                  {/* Progress change */}
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-muted-foreground">{h.progress_before}%</span>
                    <span className="text-muted-foreground">➔</span>
                    <span className="font-bold text-foreground">{h.progress_today}%</span>
                    {h.progress_today > h.progress_before && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1 rounded">
                        +{(h.progress_today - h.progress_before).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Weather & Conditions if recorded */}
                {h.weather_conditions && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CloudSun className="h-3 w-3 text-amber-500" />
                    <span>{h.weather_conditions}</span>
                  </div>
                )}

                {/* Output & Manpower */}
                <div className="flex flex-wrap items-center gap-3 bg-muted/20 px-2.5 py-1.5 rounded text-[11px]">
                  {h.quantity_done != null && (
                    <span className="font-medium text-foreground">
                      Output: <strong>{h.quantity_done} {h.quantity_unit || ""}</strong>
                    </span>
                  )}

                  {h.hours_total > 0 && (
                    <span className="text-muted-foreground">
                      Crew: {h.headcount ? `${h.headcount} workers · ` : ""}{h.hours_total} man-hrs
                      {h.trade_code ? ` (${h.trade_code})` : ""}
                    </span>
                  )}
                </div>

                {/* Delay banner if present */}
                {h.has_delay && (
                  <div className="rounded border border-amber-200 bg-amber-50/60 p-2 text-[11px] text-amber-800 space-y-0.5">
                    <div className="flex items-center gap-1 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Site Delay: {h.delay_hours_lost} hrs lost</span>
                    </div>
                    {h.delay_reason && <p className="italic text-[10px] pl-4">{h.delay_reason}</p>}
                  </div>
                )}

                {/* Field Notes / Work Description */}
                {h.work_description && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-1 border-l-2 border-primary/30">
                    {h.work_description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
