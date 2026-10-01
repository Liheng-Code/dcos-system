"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { History } from "lucide-react";
import { labelize } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function AuditHistoryTab({ c }: { c: LoadedEmployeeDetail }) {
  const { auditLogs, hrHistoryLogs } = c;
  return (
    <TabsContent value="audit" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">User Management Audit Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {auditLogs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <History className="h-8 w-8 opacity-30" />
              <p className="text-sm">No audit events yet. Events are recorded when account status, roles, or access change.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Event</th>
                  <th className="px-4 py-2.5 text-left font-medium">Details</th>
                  <th className="px-4 py-2.5 text-left font-medium">By</th>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log) => {
                  const label: Record<string, string> = {
                    user_created:      "Account Created",
                    status_changed:    "Status Changed",
                    role_changed:      "System Role Changed",
                    roles_updated:     "RBAC Roles Updated",
                    account_disabled:  "Account Disabled",
                    account_suspended: "Account Suspended",
                    session_revoked:   "Sessions Revoked",
                    employment_updated:"Employment Updated",
                  };
                  const oldStatus = log.old_value?.status as string | undefined;
                  const newStatus = log.new_value?.status as string | undefined;
                  const detail = log.note
                    ? log.note
                    : oldStatus && newStatus
                      ? `${labelize(oldStatus)} → ${labelize(newStatus)}`
                      : log.old_value && log.new_value
                        ? JSON.stringify(log.new_value)
                        : "—";
                  return (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{label[log.event_type] ?? log.event_type}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{detail}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.actor?.full_name ?? "System"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Employee Master HR History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {hrHistoryLogs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <History className="h-8 w-8 opacity-30" />
              <p className="text-sm">No HR history events yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Change</th>
                  <th className="px-4 py-2.5 text-left font-medium">Field</th>
                  <th className="px-4 py-2.5 text-left font-medium">Reason</th>
                  <th className="px-4 py-2.5 text-left font-medium">By</th>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hrHistoryLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{labelize(log.change_type)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{labelize(log.field_name)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{log.reason ?? log.approval_reference ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.actor?.full_name ?? "System"}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
