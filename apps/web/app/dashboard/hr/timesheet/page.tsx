"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock } from "lucide-react";
import { format } from "date-fns";

interface Timesheet {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  total_hours: number;
  total_ot_hours: number;
  submission_date: string;
  profiles: {
    full_name: string;
    employee_id: string;
  };
}

export default function TimesheetPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [stats, setStats] = useState({ submitted: 0, approved: 0, pending: 0, total_hours: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Fetch timesheet statistics
    supabase
      .from("timesheets")
      .select("status, total_hours")
      .then(({ data }) => {
        if (data) {
          const counts = { submitted: 0, approved: 0, pending: 0, total_hours: 0 };
          data.forEach((ts) => {
            if (ts.status === "submitted") counts.submitted++;
            else if (ts.status === "approved") counts.approved++;
            else if (ts.status === "draft") counts.pending++;
            counts.total_hours += ts.total_hours || 0;
          });
          setStats(counts);
        }
      });

    // Fetch recent timesheets
    supabase
      .from("timesheets")
      .select(`
        id,
        week_start_date,
        week_end_date,
        status,
        total_hours,
        total_ot_hours,
        submission_date,
        profiles!inner(full_name, employee_id)
      `)
      .order("week_start_date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setTimesheets(data as any);
        setLoading(false);
      });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-50 text-green-700";
      case "rejected":
        return "bg-red-50 text-red-700";
      case "submitted":
        return "bg-blue-50 text-blue-700";
      case "draft":
        return "bg-gray-50 text-gray-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Timesheet Management</h2>
          <p className="text-muted-foreground">Track work hours and approve timesheets</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.submitted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_hours.toFixed(1)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timesheet Entries</CardTitle>
          <CardDescription>Review and approve timesheet submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading timesheets...</p>
            </div>
          ) : timesheets.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No timesheets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left font-medium py-3 px-4">Employee</th>
                    <th className="text-left font-medium py-3 px-4">Week</th>
                    <th className="text-right font-medium py-3 px-4">Hours</th>
                    <th className="text-right font-medium py-3 px-4">OT Hours</th>
                    <th className="text-left font-medium py-3 px-4">Status</th>
                    <th className="text-left font-medium py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map((ts) => (
                    <tr key={ts.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{ts.profiles.full_name}</p>
                          <p className="text-xs text-muted-foreground">{ts.profiles.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">
                          {format(new Date(ts.week_start_date), "dd MMM")} - {format(new Date(ts.week_end_date), "dd MMM")}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="font-medium">{ts.total_hours.toFixed(1)} hrs</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="text-sm">{ts.total_ot_hours.toFixed(1)} hrs</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-xs ${getStatusColor(ts.status)}`}>
                          {ts.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {ts.status === "submitted" && (
                          <Button variant="outline" size="sm">
                            Review
                          </Button>
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
