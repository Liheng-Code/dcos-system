"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { Field, NativeSelect } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function BankInfoTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, bankAccount, setBankAccount, hasBankAccount, saveBankAccount } = c;
  return (
    <TabsContent value="bank" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Bank Account & Payment
            {!hasBankAccount && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Payment Method">
            <NativeSelect value={bankAccount.payment_method} onChange={(v) => setBankAccount((p) => ({ ...p, payment_method: v }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </NativeSelect>
          </Field>
          <Field label="Bank Name">
            <Input value={bankAccount.bank_name} onChange={(e) => setBankAccount((p) => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. ABA Bank" disabled={bankAccount.payment_method !== "bank_transfer"} />
          </Field>
          <Field label="Account Name">
            <Input value={bankAccount.account_name} onChange={(e) => setBankAccount((p) => ({ ...p, account_name: e.target.value }))} disabled={bankAccount.payment_method !== "bank_transfer"} />
          </Field>
          <Field label="Account Number">
            <Input value={bankAccount.account_number} onChange={(e) => setBankAccount((p) => ({ ...p, account_number: e.target.value }))} disabled={bankAccount.payment_method !== "bank_transfer"} />
          </Field>
          <Field label="Branch">
            <Input value={bankAccount.branch} onChange={(e) => setBankAccount((p) => ({ ...p, branch: e.target.value }))} placeholder="Optional" disabled={bankAccount.payment_method !== "bank_transfer"} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={saveBankAccount} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Bank Info
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
