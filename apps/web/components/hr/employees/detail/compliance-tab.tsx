"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { Field } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function ComplianceTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, isArchived, profileForm, setProfileForm, saveCompliance } = c;
  return (
    <TabsContent value="compliance" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Cambodia Compliance Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="National ID Number"><Input value={profileForm.national_id_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, national_id_number: e.target.value }))} /></Field>
          <Field label="National ID Expiry"><Input type="date" value={profileForm.national_id_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, national_id_expiry: e.target.value }))} /></Field>
          <Field label="Passport Number"><Input value={profileForm.passport_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, passport_number: e.target.value }))} /></Field>
          <Field label="Passport Expiry"><Input type="date" value={profileForm.passport_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, passport_expiry: e.target.value }))} /></Field>
          <Field label="Visa Number"><Input value={profileForm.visa_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, visa_number: e.target.value }))} /></Field>
          <Field label="Visa Expiry"><Input type="date" value={profileForm.visa_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, visa_expiry: e.target.value }))} /></Field>
          <Field label="Work Permit Number"><Input value={profileForm.work_permit_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, work_permit_number: e.target.value }))} /></Field>
          <Field label="Work Permit Expiry"><Input type="date" value={profileForm.work_permit_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, work_permit_expiry: e.target.value }))} /></Field>
          <Field label="TIN"><Input value={profileForm.tax_identification_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, tax_identification_number: e.target.value }))} /></Field>
          <Field label="Employment Contract Number"><Input value={profileForm.employment_contract_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, employment_contract_number: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={saveCompliance} disabled={saving || isArchived} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Compliance</Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
