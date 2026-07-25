"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { Loader2, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoqTab } from "@/components/tenders/cost-estimation/boq-tab";
import { PriceListTab } from "@/components/tenders/cost-estimation/price-list-tab";
import { PreliminariesTab } from "@/components/tenders/cost-estimation/preliminaries-tab";
import { BidSummaryTab } from "@/components/tenders/cost-estimation/bid-summary-tab";
import { CoverSummaryTab } from "@/components/tenders/cost-estimation/cover-summary-tab";
import { SubQuotesTab } from "@/components/tenders/cost-estimation/sub-quotes-tab";
import { RisksTab } from "@/components/tenders/cost-estimation/risks-tab";
import { CostSummaryTab } from "@/components/tenders/cost-estimation/cost-summary-tab";
import { ProjectBudgetTab } from "@/components/tenders/cost-estimation/project-budget-tab";
import { CostPerM2Tab } from "@/components/tenders/cost-estimation/cost-per-m2-tab";
import { ExcludeItemsTab } from "@/components/tenders/cost-estimation/exclude-items-tab";

type Tab = "bid" | "boq" | "price_list" | "preliminaries" | "cover" | "subquotes" | "risks" | "cost_summary" | "project_budget" | "cost_per_m2" | "exclude_items";

const TABS: { key: Tab; label: string; permissionAction?: string }[] = [
  { key: "bid", label: "Bid Summary", permissionAction: "tender_bid_summary" },
  { key: "cost_summary", label: "Cost Summary", permissionAction: "tender_cost_summary" },
  { key: "cost_per_m2", label: "Cost($/m2)", permissionAction: "tender_cost_per_m2" },
  { key: "project_budget", label: "Project Budget", permissionAction: "tender_budget" },
  { key: "cover", label: "Cover Page", permissionAction: "tender_cover" },
  { key: "boq", label: "Tender BOQ", permissionAction: "tender_boq" },
  { key: "price_list", label: "Price List", permissionAction: "tender_price_list" },
  { key: "preliminaries", label: "Preliminaries", permissionAction: "tender_preliminaries" },
  { key: "exclude_items", label: "Exclude Items", permissionAction: "tender_exclude_items" },
  { key: "subquotes", label: "Sub Quotes", permissionAction: "tender_sub_quotes" },
  { key: "risks", label: "Risk Items", permissionAction: "tender_risks" },
];

export default function CostEstimationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <CostEstimationContent />
    </Suspense>
  );
}

function CostEstimationContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const tenderParam = searchParams.get("tender");
  const { selectedProjectId } = useProject();
  const { can, loaded: permsLoaded } = useTenderPermissions();
  const [tenders, setTenders] = useState<{ id: string; tender_no: string; title: string }[]>([]);
  const [tab, setTab] = useState<Tab>("bid");
  const [loading, setLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenderParam ?? "");

  const visibleTabs = useMemo(() => {
    if (!permsLoaded) return [];
    return TABS.filter((t) => !t.permissionAction || can(t.permissionAction, "view"));
  }, [permsLoaded, can]);

  useEffect(() => {
    let query = supabase.from("tender_register").select("id,tender_no,title").order("created_at", { ascending: false });
    if (selectedProjectId) query = query.eq("project_id", selectedProjectId);
    query.then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [supabase, selectedProjectId]);

  useEffect(() => {
    if (tenderParam) setSelectedTenderId(tenderParam);
  }, [tenderParam]);

  useEffect(() => {
    if (selectedTenderId && tenders.length > 0 && !tenders.find(t => t.id === selectedTenderId)) {
      setSelectedTenderId("");
    }
  }, [selectedProjectId, tenders]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cost Estimation</h1>
        <p className="text-sm text-muted-foreground">Tender BOQ, price list, preliminaries, bid build-up, and tender cost summary</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium shrink-0">Select Tender:</label>
        <select value={selectedTenderId} onChange={(e) => setSelectedTenderId(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-md">
          <option value="">Choose a tender...</option>
          {tenders.map((t) => (<option key={t.id} value={t.id}>{t.tender_no} — {t.title}</option>))}
        </select>
      </div>

      {selectedTenderId ? (
        <>
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {visibleTabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "bid" && <BidSummaryTab tenderId={selectedTenderId} />}
          {tab === "boq" && <BoqTab tenderId={selectedTenderId} />}
          {tab === "price_list" && <PriceListTab tenderId={selectedTenderId} />}
          {tab === "preliminaries" && <PreliminariesTab tenderId={selectedTenderId} />}
          {tab === "cover" && <CoverSummaryTab tenderId={selectedTenderId} />}
          {tab === "cost_summary" && <CostSummaryTab tenderId={selectedTenderId} />}
          {tab === "cost_per_m2" && <CostPerM2Tab tenderId={selectedTenderId} />}
          {tab === "project_budget" && <ProjectBudgetTab tenderId={selectedTenderId} />}
          {tab === "subquotes" && <SubQuotesTab tenderId={selectedTenderId} />}
          {tab === "risks" && <RisksTab tenderId={selectedTenderId} />}
          {tab === "exclude_items" && <ExcludeItemsTab tenderId={selectedTenderId} />}
        </>
      ) : (
        <div className="rounded-lg border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          <Calculator className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
          <p>Select a tender above to view or create cost estimation data</p>
        </div>
      )}
    </div>
  );
}
