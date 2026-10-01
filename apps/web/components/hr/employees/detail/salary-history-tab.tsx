"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { fmtDate, fmtMoney } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function SalaryHistoryTab({ c }: { c: LoadedEmployeeDetail }) {
  const { salaryLines } = c;
  return (
    <TabsContent value="salary-history" className="mt-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Salary History</CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/hr/payroll/setup`}>Edit Salary Structure</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {salaryLines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No salary structure configured yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Component</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-left font-medium">From</th>
                  <th className="px-4 py-2.5 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {salaryLines.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{line.component}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(line.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(line.effective_from)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{line.effective_to ? fmtDate(line.effective_to) : "Current"}</td>
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
