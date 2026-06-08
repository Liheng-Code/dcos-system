"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp } from "lucide-react";

interface SeniorityRule {
  id: string;
  leave_type_id: string;
  min_years: number;
  max_years: number | null;
  days_per_year: number;
}
interface LeaveType { id: string; leave_name: string; }

export default function SeniorityRulesAdminPage() {
  const [rules, setRules] = useState<SeniorityRule[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("leave_seniority_rules").select("*").order("min_years"),
      supabase.from("leave_types").select("id, leave_name").order("leave_name"),
    ]).then(([rulesRes, typesRes]) => {
      setRules(rulesRes.data || []);
      setLeaveTypes(typesRes.data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Seniority Rules</h2>
          <p className="text-muted-foreground">Leave entitlements based on years of service — applies to seniority-based leave types only</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left font-medium py-3 px-4">Leave Type</th>
                <th className="text-center font-medium py-3 px-4">Min Years</th>
                <th className="text-center font-medium py-3 px-4">Max Years</th>
                <th className="text-center font-medium py-3 px-4">Days / Year</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No seniority rules configured</td></tr>
              ) : rules.map((rule) => {
                const lt = leaveTypes.find((t) => t.id === rule.leave_type_id);
                return (
                  <tr key={rule.id} className="border-b border-border">
                    <td className="py-3 px-4">{lt?.leave_name || "Unknown"}</td>
                    <td className="py-3 px-4 text-center">{rule.min_years}</td>
                    <td className="py-3 px-4 text-center">{rule.max_years ?? "No limit"}</td>
                    <td className="py-3 px-4 text-center font-bold">{rule.days_per_year}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
