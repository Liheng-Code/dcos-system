"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TelegramLinkCard } from "@/components/hr/attendance/telegram-link-card";
import { createClient } from "@/lib/supabase/client";

interface AttendanceRecord {
  attendance_date: string;
  attendance_type: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number | null;
  verified: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PRESENT:       { label: "Present",       color: "text-green-700 dark:text-green-400",  bg: "bg-green-500" },
  LATE:          { label: "Late",           color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-500" },
  ABSENT:        { label: "Absent",         color: "text-red-700 dark:text-red-400",     bg: "bg-red-500" },
  LEAVE:         { label: "On Leave",       color: "text-blue-700 dark:text-blue-400",   bg: "bg-blue-500" },
  HOLIDAY:       { label: "Holiday",        color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-400" },
  WFH:           { label: "WFH",            color: "text-sky-700 dark:text-sky-400",     bg: "bg-sky-500" },
  SITE_WORK:     { label: "Site Work",      color: "text-teal-700 dark:text-teal-400",   bg: "bg-teal-500" },
  BUSINESS_TRIP: { label: "Business Trip",  color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-500" },
};

function formatTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function MyAttendancePage() {
  const router = useRouter();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  useEffect(() => {
    loadRecords();
  }, [viewYear, viewMonth]);

  async function loadRecords() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const firstDay = new Date(viewYear, viewMonth, 1).toISOString().split("T")[0];
    const lastDay = new Date(viewYear, viewMonth + 1, 0).toISOString().split("T")[0];

    const { data } = await supabase
      .from("attendance_records")
      .select("attendance_date, attendance_type, check_in_time, check_out_time, hours_worked, verified")
      .eq("employee_id", user.id)
      .gte("attendance_date", firstDay)
      .lte("attendance_date", lastDay)
      .order("attendance_date", { ascending: true });

    setRecords(data ?? []);
    setLoading(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const recordMap = Object.fromEntries(records.map(r => [r.attendance_date, r]));
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const monthName = new Date(viewYear, viewMonth).toLocaleString("default", { month: "long" });

  const presentCount = records.filter(r => r.attendance_type === "PRESENT" || r.attendance_type === "SITE_WORK" || r.attendance_type === "WFH" || r.attendance_type === "BUSINESS_TRIP").length;
  const lateCount = records.filter(r => r.attendance_type === "LATE").length;
  const absentCount = records.filter(r => r.attendance_type === "ABSENT").length;
  const totalHours = records.reduce((acc, r) => acc + (r.hours_worked ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-semibold">My Attendance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your monthly attendance history</p>
        </div>
        <Button size="sm" onClick={() => router.push("/dashboard/hr/attendance/checkin")}>
          <LogIn className="mr-2 h-4 w-4" />Check In
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Present", value: presentCount, color: "text-green-600" },
          { label: "Late",    value: lateCount,    color: "text-orange-500" },
          { label: "Absent",  value: absentCount,  color: "text-red-500" },
          { label: "Hours",   value: `${Math.round(totalHours)}h`, color: "text-foreground" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle className="text-base">{monthName} {viewYear}</CardTitle>
            <Button variant="ghost" size="icon" onClick={nextMonth}
              disabled={viewYear === new Date().getFullYear() && viewMonth === new Date().getMonth()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const rec = recordMap[dateStr];
              const isToday = dateStr === new Date().toISOString().split("T")[0];
              const cfg = rec ? TYPE_CONFIG[rec.attendance_type] : null;
              return (
                <div key={day}
                  className={`rounded-md p-1 text-center text-xs cursor-default ${isToday ? "ring-2 ring-primary" : ""}`}
                  title={cfg?.label}
                >
                  <div className={`font-medium ${cfg?.color ?? "text-muted-foreground"}`}>{day}</div>
                  {cfg && <div className={`mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${cfg.bg}`} />}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(TYPE_CONFIG).map(([, cfg]) => (
              <div key={cfg.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className={`h-2 w-2 rounded-full ${cfg.bg}`} />
                {cfg.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>

      <div className="space-y-6">
      <TelegramLinkCard />

      {/* Record list */}
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Log</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No records for this month</p>
          ) : (
            records.map(r => {
              const cfg = TYPE_CONFIG[r.attendance_type] ?? { label: r.attendance_type, color: "", bg: "bg-muted" };
              const d = new Date(r.attendance_date + "T12:00:00");
              return (
                <div key={r.attendance_date} className="flex items-center justify-between py-3 gap-4">
                  <div className="text-sm">
                    <p className="font-medium">
                      {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatTime(r.check_in_time)} – {formatTime(r.check_out_time)}
                      {r.hours_worked ? ` · ${r.hours_worked}h` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.verified && <Badge variant="outline" className="text-xs">Verified</Badge>}
                    <Badge className={`text-xs ${cfg.bg} text-white border-0`}>{cfg.label}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
}
