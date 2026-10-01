"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fmtMoney, PAYROLL_STATUS } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function PayslipsTab({ c }: { c: LoadedEmployeeDetail }) {
  const { payslips } = c;
  return (
    <TabsContent value="payslips" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Payslip History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payslips.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No payslips generated yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Period</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-4 py-2.5 text-right font-medium">Deductions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net Pay</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payslips.map((ps) => (
                  <tr key={ps.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{ps.period}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(ps.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">-{fmtMoney(ps.deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{fmtMoney(ps.net)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", PAYROLL_STATUS[ps.status] ?? "bg-gray-100 text-gray-600")}>
                        {ps.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/hr/payroll/my-payslip?entry=${ps.id}`} className="text-xs text-primary hover:underline">
                        View
                      </Link>
                    </td>
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
