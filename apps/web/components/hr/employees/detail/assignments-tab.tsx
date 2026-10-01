"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { labelize, fmtDate } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function AssignmentsTab({ c }: { c: LoadedEmployeeDetail }) {
  const { projectAssignments } = c;
  return (
    <TabsContent value="assignments" className="mt-6">
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Project / WBS Assignment</CardTitle></CardHeader>
        <CardContent className="p-0">
          {projectAssignments.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No active project assignments.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground"><th className="px-4 py-2.5 text-left font-medium">Project</th><th className="px-4 py-2.5 text-left font-medium">Role</th><th className="px-4 py-2.5 text-right font-medium">Allocation</th><th className="px-4 py-2.5 text-left font-medium">Period</th><th className="px-4 py-2.5 text-center font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-border">{projectAssignments.map((assignment) => (
                <tr key={assignment.id}><td className="px-4 py-3"><p className="font-medium">{assignment.projects?.[0]?.project_name ?? "Project"}</p><p className="text-xs text-muted-foreground">{assignment.projects?.[0]?.project_code ?? assignment.project_id}</p></td><td className="px-4 py-3 text-muted-foreground">{assignment.role_in_project ?? "-"}</td><td className="px-4 py-3 text-right tabular-nums">{assignment.allocation_percent}%</td><td className="px-4 py-3 text-muted-foreground">{fmtDate(assignment.start_date)} - {assignment.end_date ? fmtDate(assignment.end_date) : "Current"}</td><td className="px-4 py-3 text-center"><Badge variant="outline" className="capitalize">{labelize(assignment.status)}</Badge></td></tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
