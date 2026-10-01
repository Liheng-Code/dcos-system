"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LeaveAdminController } from "./use-leave-admin";

export function TeamCapacitySection({ c }: { c: LeaveAdminController }) {
  const { activeSection, teamCapacity, departments, newCapacityDeptId, setNewCapacityDeptId, newCapacityPct, setNewCapacityPct, saveCapacity } = c;
  return (
    <>
      {activeSection === "capacity" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Set Capacity Limit</CardTitle>
              <CardDescription>Maximum % of department that can be on leave simultaneously</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <select
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newCapacityDeptId}
                  onChange={(e) => setNewCapacityDeptId(e.target.value)}
                >
                  <option value="">Select department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.department_name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={100}
                    className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newCapacityPct}
                    onChange={(e) => setNewCapacityPct(Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <Button onClick={saveCapacity} disabled={!newCapacityDeptId}>Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Capacity indicator: <span className="text-green-600 font-medium">Green</span> = 0–29%, <span className="text-amber-600 font-medium">Yellow</span> = 30–49%, <span className="text-red-600 font-medium">Red</span> = 50%+
              </p>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
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
          </div>
        </div>
      )}
    </>
  );
}
