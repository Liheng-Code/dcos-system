"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DollarSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoaTree } from "@/components/account/coa-tree";
import { ApInvoiceList } from "@/components/account/ap-invoice-list";
import { ArInvoiceList } from "@/components/account/ar-invoice-list";
import { PaymentVoucherList } from "@/components/account/payment-voucher-list";
import { JournalEntryList } from "@/components/account/journal-entry-list";
import { GlLedgerView } from "@/components/account/gl-ledger-view";
import { BankAccountList } from "@/components/account/bank-account-list";
import { PaymentRunList } from "@/components/account/payment-run-list";
import { WithholdingTaxList } from "@/components/account/withholding-tax-list";

export default function AccountPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  const [activeTab, setActiveTab] = useState("coa");

  if (checking) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const TABS = [
    { id: "coa", label: "Chart of Accounts" },
    { id: "ap", label: "AP Invoices" },
    { id: "ar", label: "AR Invoices" },
    { id: "payments", label: "Payments" },
    { id: "journals", label: "Journal Entries" },
    { id: "gl", label: "General Ledger" },
    { id: "bank", label: "Bank Accounts" },
    { id: "payment-runs", label: "Payment Runs" },
    { id: "wht", label: "Withholding Tax" },
  ] as const;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Account & Finance</h1>
              <p className="text-sm text-muted-foreground">
                Full finance management: COA, AP/AR, payments, journal entries, GL, and more
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "coa" && <CoaTree />}
        {activeTab === "ap" && <ApInvoiceList />}
        {activeTab === "ar" && <ArInvoiceList />}
        {activeTab === "payments" && <PaymentVoucherList />}
        {activeTab === "journals" && <JournalEntryList />}
        {activeTab === "gl" && <GlLedgerView />}
        {activeTab === "bank" && <BankAccountList />}
        {activeTab === "payment-runs" && <PaymentRunList />}
        {activeTab === "wht" && <WithholdingTaxList />}
      </div>
    </div>
  );
}
