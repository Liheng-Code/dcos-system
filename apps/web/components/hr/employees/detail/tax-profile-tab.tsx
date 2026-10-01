"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Field, NativeSelect, SwitchRow } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function TaxProfileTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, taxProfile, setTaxProfile, hasTaxProfile, saveTaxProfile } = c;
  return (
    <TabsContent value="tax" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Tax Profile — Cambodia TOS
            {!hasTaxProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tax Residency">
              <NativeSelect value={taxProfile.tax_residency} onChange={(v) => setTaxProfile((p) => ({ ...p, tax_residency: v }))}>
                <option value="resident">Resident</option>
                <option value="non_resident">Non-Resident (Flat 20%)</option>
              </NativeSelect>
            </Field>
            <Field label="Marital Status">
              <NativeSelect value={taxProfile.marital_status} onChange={(v) => setTaxProfile((p) => ({ ...p, marital_status: v }))}>
                <option value="single">Single</option>
                <option value="married">Married</option>
              </NativeSelect>
            </Field>
            <Field label="Number of Children">
              <Input type="number" min={0} value={taxProfile.num_children} onChange={(e) => setTaxProfile((p) => ({ ...p, num_children: parseInt(e.target.value) || 0 }))} />
            </Field>
            <Field label="Tax Identification Number (TIN)">
              <Input value={taxProfile.tax_id} onChange={(e) => setTaxProfile((p) => ({ ...p, tax_id: e.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Effective Date">
              <Input type="date" value={taxProfile.effective_date} onChange={(e) => setTaxProfile((p) => ({ ...p, effective_date: e.target.value }))} />
            </Field>
          </div>
          <SwitchRow
            label="Spouse Dependent Relief"
            description="Spouse is financially dependent — 150,000 KHR/month relief"
            checked={taxProfile.spouse_dependent}
            onChange={(v) => setTaxProfile((p) => ({ ...p, spouse_dependent: v }))}
          />
          {taxProfile.marital_status === "single" && taxProfile.spouse_dependent && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Spouse relief requires marital status = Married
            </div>
          )}
          {taxProfile.num_children > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Child relief: {taxProfile.num_children} × 150,000 KHR = {(taxProfile.num_children * 150000).toLocaleString()} KHR/month
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={saveTaxProfile} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Tax Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
