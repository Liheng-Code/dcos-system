"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Clock } from "lucide-react";
import { format } from "date-fns";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  attendance_type: string;
  check_in_time: string;
  check_out_time: string;
  verified: boolean;
  profiles: {
    full_name: string;
    employee_id: string;
  };
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayStats, setTodayStats] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const supabase = createClient();

    // Fetch today's attendance stats
    supabase
      .from("attendance_records")
      .select("attendance_type")
      .eq("attendance_date", format(new Date(), "yyyy-MM-dd"))
      .then(({ data }) => {
        if (data) {
          const stats = { present: 0, absent: 0, late: 0, leave: 0 };
          data.forEach((record) => {
            if (record.attendance_type === "PRESENT") stats.present++;
            else if (record.attendance_type === "ABSENT") stats.absent++;
            else if (record.attendance_type === "LATE") stats.late++;
            else if (record.attendance_type === "LEAVE") stats.leave++;
          });
          setTodayStats(stats);
        }
      });

    // Fetch recent attendance records with employee info
    supabase
      .from("attendance_records")
      .select(`
        id,
        employee_id,
        attendance_date,
        attendance_type,
        check_in_time,
        check_out_time,
        verified,
        profiles!inner(full_name, employee_id)
      `)
      .order("attendance_date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setRecords(data as any);
        setLoading(false);
      });
  }, []);

  const filteredRecords = records.filter(
    (record) =>
      record.profiles.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.profiles.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Attendance Management</h2>
          <p className="text-muted-foreground">Track employee attendance and absences</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Record Attendance
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Present Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{todayStats.present}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{todayStats.absent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{todayStats.late}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{todayStats.leave}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View recent attendance logs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or employee ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading records...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No attendance records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left font-medium py-3 px-4">Employee</th>
                    <th className="text-left font-medium py-3 px-4">Date</th>
                    <th className="text-left font-medium py-3 px-4">Type</th>
                    <th className="text-left font-medium py-3 px-4">Check-In</th>
                    <th className="text-left font-medium py-3 px-4">Check-Out</th>
                    <th className="text-left font-medium py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{record.profiles.full_name}</p>
                          <p className="text-xs text-muted-foreground">{record.profiles.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">{format(new Date(record.attendance_date), "dd MMM yyyy")}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700">
                          {record.attendance_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">{record.check_in_time || "—"}</td>
                      <td className="py-3 px-4">{record.check_out_time || "—"}</td>
                      <td className="py-3 px-4">
                        {record.verified ? (
                          <span className="text-xs font-medium text-green-600">✓ Verified</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
