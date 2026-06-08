"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

interface TeamCapacity {
  id: string;
  department_id: string;
  max_percent: number;
  departments: { department_name: string };
}

export default function TeamCapacityAdminPage() {
  const [teamCapacity, setTeamCapacity] = useState<TeamCapacity[]>([]);
  const [departments, setDepartments] = useState<{ id: string; department_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDeptId, setNewDeptId] = useState("");
  const [newPct, setNewPct] = useState(50);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const supabase = createClient();
    const [capRes, deptRes] = await Promise.all([
      supabase.from("leave_team_capacity").select("*, departments(department_name)").order("max_percent"),
      supabase.from("departments").select("id, department_name").order("department_name"),
    ]);
    setTeamCapacity(capRes.data || []);
    setDepartments(deptRes.data || []);
  };

  useEffect(() => {
    refresh().then(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!newDeptId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("leave_team_capacity")
      .upsert({ department_id: newDeptId, max_percent: newPct }, { onConflict: "department_id" });
    if (!error) { await refresh(); setNewDeptId(""); setNewPct(50); }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Capacity</h2>
          <p className="text-muted-foreground">Maximum percentage of a department that can be on leave simultaneously</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set Capacity Limit</CardTitle>
          <CardDescription>Configure per-department leave overlap threshold</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <select
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={newDeptId}
              onChange={(e) => setNewDeptId(e.target.value)}
            >
              <option value="">Select department...</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={100}
                className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newPct}
                onChange={(e) => setNewPct(Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Button onClick={save} disabled={!newDeptId || saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Indicator: <span className="text-green-600 font-medium">Green</span> = 0–29%,{" "}
            <span className="text-amber-600 font-medium">Yellow</span> = 30–49%,{" "}
            <span className="text-red-600 font-medium">Red</span> = 50%+
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left font-medium py-3 px-4">Department</th>
                <th className="text-center font-medium py-3 px-4">Max % on Leave</th>
              </tr>
            </thead>
            <tbody>
              {teamCapacity.length === 0 ? (
                <tr><td colSpan={2} className="text-center py-6 text-muted-foreground">No capacity limits configured</td></tr>
              ) : teamCapacity.map((cap) => (
                <tr key={cap.id} className="border-b border-border">
                  <td className="py-3 px-4 font-medium">{cap.departments?.department_name || "Unknown"}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-bold ${cap.max_percent >= 50 ? "text-red-600" : cap.max_percent >= 30 ? "text-amber-600" : "text-green-600"}`}>
                      {cap.max_percent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
