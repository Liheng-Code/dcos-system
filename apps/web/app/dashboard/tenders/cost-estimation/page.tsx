"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoqTab } from "@/components/tenders/cost-estimation/boq-tab";
import { PriceListTab } from "@/components/tenders/cost-estimation/price-list-tab";
import { PreliminariesTab } from "@/components/tenders/cost-estimation/preliminaries-tab";
import { BidSummaryTab } from "@/components/tenders/cost-estimation/bid-summary-tab";
import { CoverSummaryTab } from "@/components/tenders/cost-estimation/cover-summary-tab";
import { UnitRatesTab } from "@/components/tenders/cost-estimation/unit-rates-tab";
import { SubQuotesTab } from "@/components/tenders/cost-estimation/sub-quotes-tab";
import { RisksTab } from "@/components/tenders/cost-estimation/risks-tab";

type Tab = "bid" | "boq" | "price_list" | "preliminaries" | "cover" | "rates" | "subquotes" | "risks";

const TABS: { key: Tab; label: string }[] = [
  { key: "bid", label: "Bid Summary" },
  { key: "boq", label: "Tender BOQ" },
  { key: "price_list", label: "Price List" },
  { key: "preliminaries", label: "Preliminaries" },
  { key: "cover", label: "Cover / Tender Summary" },
  { key: "rates", label: "Unit Rates" },
  { key: "subquotes", label: "Sub Quotes" },
  { key: "risks", label: "Risk Items" },
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
  const [tenders, setTenders] = useState<{ id: string; tender_no: string; title: string }[]>([]);
  const [tab, setTab] = useState<Tab>("bid");
  const [loading, setLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenderParam ?? "");

  useEffect(() => {
    supabase.from("tender_register").select("id,tender_no,title").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [supabase]);

  useEffect(() => {
    if (tenderParam) setSelectedTenderId(tenderParam);
  }, [tenderParam]);

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
            {TABS.map((t) => (
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
          {tab === "rates" && <UnitRatesTab />}
          {tab === "subquotes" && <SubQuotesTab tenderId={selectedTenderId} />}
          {tab === "risks" && <RisksTab tenderId={selectedTenderId} />}
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
