"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

type AttendanceTypeKey = "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "WFH" | "SITE_WORK";

interface EmployeeRow {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: AttendanceTypeKey | null;
  check_in_time: string;
}

const STATUSES: { value: AttendanceTypeKey; label: string; color: string }[] = [
  { value: "PRESENT",   label: "Present",   color: "bg-green-500" },
  { value: "LATE",      label: "Late",      color: "bg-orange-500" },
  { value: "ABSENT",    label: "Absent",    color: "bg-red-500" },
  { value: "LEAVE",     label: "Leave",     color: "bg-blue-500" },
  { value: "WFH",       label: "WFH",       color: "bg-sky-500" },
  { value: "SITE_WORK", label: "Site Work", color: "bg-teal-500" },
];

export default function SupervisorAttendancePage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [selectedDate]);

  async function loadEmployees() {
    setLoading(true);
    setSaved(false);
    const supabase = createClient();

    // Load active employees
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, department, job_title")
      .eq("status", "active")
      .order("full_name");

    if (!profiles) { setLoading(false); return; }

    // Load existing records for selected date
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("employee_id, attendance_type, check_in_time")
      .eq("attendance_date", selectedDate);

    const existingMap = Object.fromEntries((existing ?? []).map(r => [r.employee_id, r]));

    const defaultTime = "08:00";
    setEmployees(
      profiles.map(p => ({
        id: p.id,
        full_name: p.full_name,
        department: p.department,
        job_title: p.job_title,
        status: (existingMap[p.id]?.attendance_type as AttendanceTypeKey) ?? null,
        check_in_time: existingMap[p.id]?.check_in_time?.slice(0, 5) ?? defaultTime,
      }))
    );
    setLoading(false);
  }

  function setStatus(id: string, value: AttendanceTypeKey) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: value } : e));
  }

  function setCheckInTime(id: string, value: string) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, check_in_time: value } : e));
  }

  function markAllPresent() {
    setEmployees(prev => prev.map(e => ({ ...e, status: "PRESENT" })));
  }

  async function handleSave() {
    const toSave = employees.filter(e => e.status !== null);
    if (toSave.length === 0) return toast.error("No attendance statuses selected");

    setSaving(true);
    const supabase = createClient();

    const records = toSave.map(e => ({
      employee_id: e.id,
      attendance_date: selectedDate,
      attendance_type: e.status!,
      check_in_time: ["PRESENT", "LATE", "SITE_WORK", "WFH"].includes(e.status!) ? e.check_in_time + ":00" : null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("attendance_records")
      .upsert(records, { onConflict: "employee_id,attendance_date" });

    if (error) {
      toast.error(error.message);
    } else {
      // Insert manual attendance logs
      const logs = toSave
        .filter(e => ["PRESENT", "LATE", "SITE_WORK", "WFH"].includes(e.status!))
        .map(e => ({
          employee_id: e.id,
          log_time: `${selectedDate}T${e.check_in_time}:00Z`,
          log_type: "check_in",
          method: "manual",
          notes: "Supervisor entry",
        }));

      if (logs.length > 0) {
        await supabase.from("attendance_logs").upsert(logs);
      }

      toast.success(`Saved attendance for ${toSave.length} employees`);
      setSaved(true);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h1 className="text-2xl font-semibold">Supervisor Attendance Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">Mark attendance on behalf of your team</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />Team Attendance
              </CardTitle>
              <CardDescription>Select date and mark each employee's status</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
              <Button variant="outline" size="sm" onClick={markAllPresent}>All Present</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-0 divide-y">
              {employees.map(emp => (
                <div key={emp.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{emp.full_name}</p>
                    <p className="text-xs text-muted-foreground">{emp.job_title ?? emp.department ?? "—"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setStatus(emp.id, s.value)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all border ${
                          emp.status === s.value
                            ? `${s.color} text-white border-transparent`
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {emp.status && ["PRESENT", "LATE", "SITE_WORK", "WFH"].includes(emp.status) && (
                    <input
                      type="time"
                      value={emp.check_in_time}
                      onChange={e => setCheckInTime(emp.id, e.target.value)}
                      className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
                    />
                  )}
                  {!emp.status && (
                    <Badge variant="outline" className="text-xs">Not set</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {employees.filter(e => e.status).length} / {employees.length} employees marked
        </p>
        <Button onClick={handleSave} disabled={saving || employees.every(e => !e.status)}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Attendance
        </Button>
      </div>
    </div>
  );
}
