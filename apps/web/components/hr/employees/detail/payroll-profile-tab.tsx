"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { Field, NativeSelect, SwitchRow } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function PayrollProfileTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, payrollProfile, setPayrollProfile, hasPayrollProfile, savePayrollProfile } = c;
  return (
    <TabsContent value="payroll" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Payroll Profile
            {!hasPayrollProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Payroll Type">
              <NativeSelect value={payrollProfile.payroll_type} onChange={(v) => setPayrollProfile((p) => ({ ...p, payroll_type: v }))}>
                <option value="monthly">Monthly</option>
              </NativeSelect>
            </Field>
            <Field label="Currency">
              <NativeSelect value={payrollProfile.currency} onChange={(v) => setPayrollProfile((p) => ({ ...p, currency: v }))}>
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </NativeSelect>
            </Field>
            <Field label="Payroll Group">
              <NativeSelect value={payrollProfile.payroll_group} onChange={(v) => setPayrollProfile((p) => ({ ...p, payroll_group: v }))}>
                <option value="staff">Staff</option>
                <option value="site_staff">Site Staff</option>
                <option value="management">Management</option>
              </NativeSelect>
            </Field>
            <Field label="Effective Date">
              <Input type="date" value={payrollProfile.effective_date} onChange={(e) => setPayrollProfile((p) => ({ ...p, effective_date: e.target.value }))} />
            </Field>
          </div>
          <div className="space-y-2">
            <SwitchRow label="OT Eligible" description="Employee qualifies for overtime pay" checked={payrollProfile.ot_eligible} onChange={(v) => setPayrollProfile((p) => ({ ...p, ot_eligible: v }))} />
            <SwitchRow label="Tax Applicable (TOS)" description="Cambodia Tax on Salary applies" checked={payrollProfile.tax_applicable} onChange={(v) => setPayrollProfile((p) => ({ ...p, tax_applicable: v }))} />
            <SwitchRow label="NSSF Applicable" description="National Social Security Fund contribution required" checked={payrollProfile.nssf_applicable} onChange={(v) => setPayrollProfile((p) => ({ ...p, nssf_applicable: v }))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={savePayrollProfile} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Payroll Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
