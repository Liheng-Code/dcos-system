"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import type { LeaveAdminController } from "./use-leave-admin";

export function SeniorityRulesSection({ c }: { c: LeaveAdminController }) {
  const { activeSection, leaveTypes, seniorityRules } = c;
  return (
    <>
      {activeSection === "seniority" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              These rules define how many leave days employees are entitled to based on years of service.
              Only applies to leave types with <em>seniority_based = true</em>.
            </p>
            <Link href="/dashboard/hr/leave/seniority-rules">
              <Button size="sm" className="gap-1.5 flex-shrink-0">
                <Pencil className="h-4 w-4" /> Manage Seniority Rules
              </Button>
            </Link>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
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
                {seniorityRules.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No seniority rules configured</td></tr>
                ) : seniorityRules.map((rule) => {
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
          </div>
        </div>
      )}
    </>
  );
}
