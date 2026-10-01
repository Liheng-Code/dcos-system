"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { Field, SwitchRow } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function NssfProfileTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, nssfProfile, setNSSFProfile, hasNSSFProfile, saveNSSFProfile } = c;
  return (
    <TabsContent value="nssf" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            NSSF Profile
            {!hasNSSFProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow label="NSSF Applicable" description="Employee is enrolled in NSSF" checked={nssfProfile.nssf_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, nssf_applicable: v }))} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="NSSF Number">
              <Input value={nssfProfile.nssf_number} onChange={(e) => setNSSFProfile((p) => ({ ...p, nssf_number: e.target.value }))} placeholder={nssfProfile.nssf_applicable ? "Required" : "N/A"} disabled={!nssfProfile.nssf_applicable} />
            </Field>
            <Field label="Effective Date">
              <Input type="date" value={nssfProfile.effective_date} onChange={(e) => setNSSFProfile((p) => ({ ...p, effective_date: e.target.value }))} />
            </Field>
          </div>
          <div className="space-y-2">
            <SwitchRow label="Pension" description="2% employee + 2% employer contribution" checked={nssfProfile.pension_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, pension_applicable: v }))} />
            <SwitchRow label="Healthcare" description="Employer healthcare contribution" checked={nssfProfile.healthcare_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, healthcare_applicable: v }))} />
            <SwitchRow label="Occupational Risk" description="0.8% employer contribution" checked={nssfProfile.occupational_risk_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, occupational_risk_applicable: v }))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveNSSFProfile} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save NSSF Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
