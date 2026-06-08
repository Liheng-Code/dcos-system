"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

interface YearEndLog {
  id: string;
  run_date: string;
  from_year: number;
  to_year: number;
  days_carried: number;
  days_expired: number;
  profiles: { full_name: string };
}

export default function YearEndAdminPage() {
  const [logs, setLogs] = useState<YearEndLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshLogs = async () => {
    const { data } = await createClient()
      .from("leave_year_end_logs")
      .select("*, profiles(full_name)")
      .order("run_date", { ascending: false })
      .limit(20);
    setLogs(data || []);
  };

  useEffect(() => {
    refreshLogs().then(() => setLoading(false));
  }, []);

  const runYearEnd = async () => {
    setRunning(true);
    setMessage(null);
    const supabase = createClient();
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    try {
      const { data: balances } = await supabase
        .from("leave_balances")
        .select("*, leave_types(carryover_allowed, max_carryover)")
        .eq("fiscal_year", currentYear);
      if (!balances || balances.length === 0) {
        setMessage("No leave balances found for the current year.");
        return;
      }
      const { data: currentUser } = await supabase.auth.getUser();
      const runBy = currentUser.user?.id;
      let processed = 0;
      for (const balance of balances) {
        if (!balance.leave_types.carryover_allowed) {
          await supabase.from("leave_year_end_logs").insert({
            from_year: currentYear, to_year: nextYear,
            employee_id: balance.employee_id, leave_type_id: balance.leave_type_id,
            days_used: balance.used_days, days_remaining: balance.remaining_days,
            days_carried: 0, days_expired: balance.remaining_days,
            run_by: runBy, notes: "No carryover allowed for this leave type.",
          });
          continue;
        }
        const maxCarryover = balance.leave_types.max_carryover || 0;
        const daysToCarry = Math.min(balance.remaining_days, maxCarryover);
        const daysExpired = balance.remaining_days - daysToCarry;
        await supabase.from("leave_balances").upsert({
          employee_id: balance.employee_id, leave_type_id: balance.leave_type_id,
          fiscal_year: nextYear, allocated_days: 0, used_days: 0,
          carried_over_days: daysToCarry, remaining_days: daysToCarry,
        }, { onConflict: "employee_id,leave_type_id,fiscal_year" });
        await supabase.from("leave_year_end_logs").insert({
          from_year: currentYear, to_year: nextYear,
          employee_id: balance.employee_id, leave_type_id: balance.leave_type_id,
          days_used: balance.used_days, days_remaining: balance.remaining_days,
          days_carried: daysToCarry, days_expired: daysExpired, run_by: runBy,
        });
        processed++;
      }
      setMessage(`Year-end processing complete. ${processed} employee balances carried forward to ${nextYear}.`);
      await refreshLogs();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Year-End Run</h2>
          <p className="text-muted-foreground">Process leave carryovers at fiscal year close</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year-End Carryover Processing</CardTitle>
          <CardDescription>
            Run once at the end of each fiscal year. Carries over unused days (up to the configured maximum) to the next year. Excess days expire. An audit log is written for each employee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>Warning:</strong> This operation creates new leave balance records for next year. Run only once per year. It will skip employees who already have a balance for next year.
          </div>
          {message && (
            <div className={`rounded-md px-4 py-3 text-sm ${message.startsWith("Error") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
              {message}
            </div>
          )}
          <Button onClick={runYearEnd} disabled={running} className="gap-2">
            <Calendar className="h-4 w-4" />
            {running ? "Processing..." : `Run Year-End for ${new Date().getFullYear()} → ${new Date().getFullYear() + 1}`}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base font-semibold mb-3">Processing History</h3>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left font-medium py-3 px-4">Date Run</th>
                  <th className="text-left font-medium py-3 px-4">Period</th>
                  <th className="text-left font-medium py-3 px-4">Employee</th>
                  <th className="text-center font-medium py-3 px-4">Carried</th>
                  <th className="text-center font-medium py-3 px-4">Expired</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No year-end runs recorded</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="border-b border-border">
                    <td className="py-3 px-4 text-muted-foreground">{new Date(log.run_date).toLocaleDateString()}</td>
                    <td className="py-3 px-4">{log.from_year} → {log.to_year}</td>
                    <td className="py-3 px-4">{log.profiles?.full_name || "—"}</td>
                    <td className="py-3 px-4 text-center text-green-700 font-medium">{log.days_carried}</td>
                    <td className="py-3 px-4 text-center text-red-600 font-medium">{log.days_expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
