"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DollarSign,
  FileText,
  TrendingUp,
  Shield,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPostcontractKpis, getContractSnapshot, type ContractSnapshot } from "@/lib/qs/public";

interface PostcontractDashboardProps {
  projectId: string;
}

interface Kpis {
  contractValue: number;
  boqTotal: number;
  variationTotal: number;
  claimsTotal: number;
  retentionHeld: number;
  boqItemCount: number;
}

interface ContractInfo {
  contract_no: string;
  party_name: string;
  contract_value: number;
  status: string;
}

export function PostcontractDashboard({ projectId }: PostcontractDashboardProps) {
  const supabase = createClient();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [snapshot, setSnapshot] = useState<ContractSnapshot | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [kpisData, snapshotData, contractData] = await Promise.all([
        getPostcontractKpis(projectId),
        getContractSnapshot(projectId),
        supabase
          .from("contract_register")
          .select("contract_no, party_name, contract_value, status")
          .eq("project_id", projectId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
      ]);

      setKpis(kpisData);
      setSnapshot(snapshotData);
      setContract(contractData.data as ContractInfo | null);
      setLoading(false);
    }
    load();
  }, [projectId, supabase]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-3" />
            <div className="h-7 bg-muted rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  const formatCurrency = (val: number) =>
    val === 0 ? "—" : `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Contract Value"
          value={formatCurrency(kpis?.contractValue ?? 0)}
          icon={<DollarSign className="h-4 w-4" />}
          color="border-t-blue-500 text-blue-600 bg-blue-50"
        />
        <KpiCard
          label="BOQ Total (Locked)"
          value={formatCurrency(kpis?.boqTotal ?? 0)}
          subtitle={`${kpis?.boqItemCount ?? 0} items`}
          icon={<FileText className="h-4 w-4" />}
          color="border-t-emerald-500 text-emerald-600 bg-emerald-50"
        />
        <KpiCard
          label="Variations"
          value={formatCurrency(kpis?.variationTotal ?? 0)}
          icon={<TrendingUp className="h-4 w-4" />}
          color="border-t-amber-500 text-amber-600 bg-amber-50"
        />
        <KpiCard
          label="Claims Certified"
          value={formatCurrency(kpis?.claimsTotal ?? 0)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="border-t-purple-500 text-purple-600 bg-purple-50"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Retention Held"
          value={formatCurrency(kpis?.retentionHeld ?? 0)}
          icon={<Shield className="h-4 w-4" />}
          color="border-t-cyan-500 text-cyan-600 bg-cyan-50"
        />
        <KpiCard
          label="BOQ Items (Baseline)"
          value={`${kpis?.boqItemCount ?? 0}`}
          subtitle="locked"
          icon={<BarChart3 className="h-4 w-4" />}
          color="border-t-indigo-500 text-indigo-600 bg-indigo-50"
        />
        {snapshot && (
          <KpiCard
            label="Bid Summary Total"
            value={formatCurrency(snapshot.total_bid_price)}
            subtitle={`OH ${snapshot.overhead_pct}% / Profit ${snapshot.profit_pct}%`}
            icon={<DollarSign className="h-4 w-4" />}
            color="border-t-rose-500 text-rose-600 bg-rose-50"
          />
        )}
      </div>

      {/* Contract Info + Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contract Register */}
        {contract && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Contract Register</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Contract No</span>
                <span className="font-medium font-mono">{contract.contract_no}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Contractor</span>
                <span className="font-medium">{contract.party_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Value</span>
                <span className="font-medium">{formatCurrency(contract.contract_value)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  contract.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                  "bg-muted text-muted-foreground border-border",
                )}>
                  {contract.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tender Snapshot */}
        {snapshot && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Tender Snapshot (Baseline)</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Direct Cost</span>
                <span className="font-medium">{formatCurrency(snapshot.direct_cost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Preliminaries</span>
                <span className="font-medium">{formatCurrency(snapshot.preliminaries)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subcontract</span>
                <span className="font-medium">{formatCurrency(snapshot.subcontract_cost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overhead</span>
                <span className="font-medium">{snapshot.overhead_pct}% ({formatCurrency(snapshot.overhead_amount)})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit</span>
                <span className="font-medium">{snapshot.profit_pct}% ({formatCurrency(snapshot.profit_amount)})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Contingency</span>
                <span className="font-medium">{formatCurrency(snapshot.contingency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Risk Allowance</span>
                <span className="font-medium">{formatCurrency(snapshot.risk_allowance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-medium">{snapshot.vat_pct}% ({formatCurrency(snapshot.vat_amount)})</span>
              </div>
              <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                <span className="text-muted-foreground font-medium">Total Bid Price</span>
                <span className="font-bold">{formatCurrency(snapshot.total_bid_price)}</span>
              </div>
            </div>
          </div>
        )}

        {!snapshot && !contract && (
          <div className="col-span-2 rounded-xl border border-dashed border-border p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No contract or snapshot data available.</p>
            <p className="text-xs text-muted-foreground mt-1">
              This post-contract project was created without tender data carry-over.
            </p>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "QS BOQ", href: "/dashboard/qs/boq", color: "hover:border-emerald-300 hover:bg-emerald-50/50" },
            { label: "Variations", href: "/dashboard/qs/variations", color: "hover:border-amber-300 hover:bg-amber-50/50" },
            { label: "Claims", href: "/dashboard/qs/claims", color: "hover:border-purple-300 hover:bg-purple-50/50" },
            { label: "Payments", href: "/dashboard/qs/claims?sub=payments", color: "hover:border-blue-300 hover:bg-blue-50/50" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center justify-between rounded-lg border border-border p-3 text-sm font-medium transition-colors",
                link.color,
              )}
            >
              {link.label}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  color,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  const [borderClass, textClass, bgClass] = color.split(" ");
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 border-t-4", borderClass)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", bgClass)}>
          {icon}
        </div>
      </div>
      <p className={cn("text-xl font-bold", textClass)}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
