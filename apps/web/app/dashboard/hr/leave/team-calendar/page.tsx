"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Star, Users,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, isSameMonth,
} from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeaveEntry {
  employee_name: string;
  leave_type: string;
  leave_type_color: string;
  status: string;
}

interface HolidayEntry {
  holiday_name: string;
}

interface DayData {
  date: string;
  leaves: LeaveEntry[];
  holidays: HolidayEntry[];
}

// ── Day cell ─────────────────────────────────────────────────────────────────
function DayCell({
  day,
  dayData,
  isCurrentMonth,
}: {
  day: Date;
  dayData?: DayData;
  isCurrentMonth: boolean;
}) {
  const leaves = dayData?.leaves ?? [];
  const holidays = dayData?.holidays ?? [];
  const count = leaves.length;
  const hasHoliday = holidays.length > 0;

  const today = isToday(day);

  const countColor =
    count === 0 ? "" : count <= 2 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200";

  return (
    <div
      className={cn(
        "relative flex min-h-20 flex-col rounded-lg border p-1.5 text-left text-xs transition-all hover:shadow-sm",
        !isCurrentMonth && "opacity-40",
        today && "ring-2 ring-primary",
        hasHoliday && !today && "bg-indigo-50/60 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800",
        !hasHoliday && !today && "bg-card border-border",
      )}
    >
      {/* Day number */}
      <span
        className={cn(
          "mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold",
          today && "bg-primary text-primary-foreground",
          !today && "text-foreground",
        )}
      >
        {format(day, "d")}
      </span>

      {/* Holiday badge */}
      {hasHoliday && (
        <div className="mb-0.5 flex items-center gap-0.5 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          <Star className="size-2.5 shrink-0 fill-current" />
          <span className="truncate">{holidays[0].holiday_name}</span>
        </div>
      )}

      {/* Leave count badge */}
      {count > 0 && (
        <span
          className={cn(
            "mt-auto inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
            countColor,
          )}
        >
          <Users className="size-3" />
          {count}
        </span>
      )}
    </div>
  );
}

// ── Detail popover ────────────────────────────────────────────────────────────
function DayPopoverContent({
  day,
  dayData,
}: {
  day: Date;
  dayData?: DayData;
}) {
  const leaves = dayData?.leaves ?? [];
  const holidays = dayData?.holidays ?? [];

  return (
    <PopoverContent side="right" align="start" className="w-72 p-0">
      <div className="space-y-0">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <PopoverTitle className="text-base">
            {format(day, "EEEE, d MMMM yyyy")}
          </PopoverTitle>
          {holidays.length > 0 && (
            <PopoverDescription className="mt-1 flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <Star className="size-3 fill-current" />
              {holidays.map((h) => h.holiday_name).join(", ")}
            </PopoverDescription>
          )}
        </div>

        {/* Employee list */}
        {leaves.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No one on leave this day.
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            <ScrollAreaViewport className="p-1">
              <div className="space-y-0.5">
                {leaves.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.leave_type_color }}
                      />
                      <span className="font-medium">{entry.employee_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{entry.leave_type}</span>
                      <Badge
                        variant={entry.status === "approved" ? "default" : "secondary"}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {entry.status === "submitted" ? "Pending" : "Approved"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar>
              <ScrollAreaThumb />
            </ScrollAreaScrollbar>
          </ScrollArea>
        )}
      </div>
    </PopoverContent>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", userData.user.id)
        .single();

      // Fetch leave requests + public holidays in parallel
      let leaveQuery = supabase
        .from("leave_requests")
        .select("start_date, end_date, status, profiles!leave_requests_employee_id_fkey(full_name), leave_types(leave_name, color)")
        .in("status", ["submitted", "approved"])
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart);

      if (profile?.department) {
        const { data: deptMembers } = await supabase
          .from("profiles")
          .select("id")
          .eq("department", profile.department);
        const ids = (deptMembers || []).map((m: { id: string }) => m.id);
        if (ids.length > 0) leaveQuery = leaveQuery.in("employee_id", ids);
      }

      const [leaveRes, holidayRes] = await Promise.all([
        leaveQuery,
        supabase
          .from("leave_public_holidays")
          .select("holiday_date, holiday_name")
          .gte("holiday_date", monthStart)
          .lte("holiday_date", monthEnd)
          .eq("is_active", true),
      ]);

      // Build day data map
      const map: Record<string, DayData> = {};

      // Process holidays
      for (const row of holidayRes.data ?? []) {
        const key = row.holiday_date;
        if (!map[key]) map[key] = { date: key, leaves: [], holidays: [] };
        map[key].holidays.push({ holiday_name: row.holiday_name });
      }

      // Process leave requests
      for (const row of leaveRes.data ?? []) {
        const days = eachDayOfInterval({
          start: new Date(row.start_date),
          end: new Date(row.end_date),
        });
        const lt = row.leave_types as unknown as { leave_name: string; color: string } | null;
        const prof = row.profiles as unknown as { full_name: string } | null;
        const leaveTypeColor = COLOR_HEX[lt?.color as string] ?? COLOR_HEX.blue;

        for (const d of days) {
          const key = format(d, "yyyy-MM-dd");
          if (!map[key]) map[key] = { date: key, leaves: [], holidays: [] };
          map[key].leaves.push({
            employee_name: prof?.full_name || "—",
            leave_type: lt?.leave_name || "—",
            leave_type_color: leaveTypeColor,
            status: row.status,
          });
        }
      }

      setDayDataMap(map);
      setLoading(false);
    });
  }, [currentMonth]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  // Today button handler
  const goToToday = useCallback(() => {
    setCurrentMonth(new Date());
  }, []);

  // Nav handlers
  const prevMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1));
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="leave-page-header flex flex-wrap items-start justify-between gap-4">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Team Calendar</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Who is on leave this month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="pt-5 pb-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading calendar…
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="mb-2 grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startPad }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayData = dayDataMap[key];
                  const isCurrentMonth = isSameMonth(day, currentMonth);

                  return (
                    <Popover key={key}>
                      <PopoverTrigger>
                        <DayCell
                          day={day}
                          dayData={dayData}
                          isCurrentMonth={isCurrentMonth}
                        />
                      </PopoverTrigger>
                      <DayPopoverContent day={day} dayData={dayData} />
                    </Popover>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded border border-border bg-card" />
          <span>No leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded border border-amber-200 bg-amber-100" />
          <span>1–2 on leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded border border-red-200 bg-red-100" />
          <span>3+ on leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Star className="size-3 text-indigo-600" />
          <span>Public holiday</span>
        </div>
      </div>
    </div>
  );
}
