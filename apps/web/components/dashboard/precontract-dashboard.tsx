"use client";

import { useEffect, useState, useMemo } from "react";
import { countTenderBoqItemsByTenderId, countTenderPreliminariesItemsByTenderId, countTenderSubQuotesByTenderId, getLatestBidSummaryByTenderId, getProjectPrecontractDetailByProjectId, listTenderRiskItemsByTenderId } from "@/lib/dashboard/dashboard-queries";
import { tenderValue, tenderValueCaption, type LatestBidRevision } from "@/lib/qs/tender-value";
import { Clock, TrendingUp, AlertTriangle, Users, Calculator, FileSearch, Send, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrecontractDashboardProps {
  projectId: string;
  projectName: string;
}

interface PrecontractDetails {
  tender_register_id: string | null;
  submission_deadline: string | null;
  bid_price: number | null;
  estimated_value: number | null;
  bid_currency: string;
  award_status: string;
}

interface RiskSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface CostProgress {
  boqItems: number;
  prelimItems: number;
  subQuoteItems: number;
  totalBoq: number;
  totalPrelim: number;
}

export function PrecontractDashboard({ projectId, projectName }: PrecontractDashboardProps) {
  const [details, setDetails] = useState<PrecontractDetails | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [costProgress, setCostProgress] = useState<CostProgress>({ boqItems: 0, prelimItems: 0, subQuoteItems: 0, totalBoq: 0, totalPrelim: 0 });
  const [latestRev, setLatestRev] = useState<LatestBidRevision | null>(null);
  const [loading, setLoading] = useState(true);
  const value = tenderValue(details, latestRev);

  useEffect(() => {
    async function load() {
      // Load precontract details
      const { data: pcDetails } = await getProjectPrecontractDetailByProjectId(projectId);

      if (pcDetails) {
        setDetails(pcDetails as PrecontractDetails);

        // Load risk summary for this tender
        if (pcDetails.tender_register_id) {
          const { data: risks } = await listTenderRiskItemsByTenderId(pcDetails.tender_register_id);

          if (risks) {
            const summary: RiskSummary = { critical: 0, high: 0, medium: 0, low: 0 };
            for (const r of risks) {
              const score = r.risk_score as keyof RiskSummary;
              if (score in summary) summary[score]++;
            }
            setRiskSummary(summary);
          }

          // Load cost progress and the latest estimate revision
          const [boqRes, prelimRes, subQuoteRes, revRes] = await Promise.all([
            countTenderBoqItemsByTenderId(pcDetails.tender_register_id),
            countTenderPreliminariesItemsByTenderId(pcDetails.tender_register_id),
            countTenderSubQuotesByTenderId(pcDetails.tender_register_id),
            getLatestBidSummaryByTenderId(pcDetails.tender_register_id),
          ]);
          setLatestRev((revRes.data as LatestBidRevision | null) ?? null);

          setCostProgress({
            boqItems: boqRes.count ?? 0,
            prelimItems: prelimRes.count ?? 0,
            subQuoteItems: subQuoteRes.count ?? 0,
            totalBoq: 0,
            totalPrelim: 0,
          });
        }
      }
      setLoading(false);
    }
    load();
  }, [projectId]);

  const daysUntilDeadline = useMemo(() => {
    if (!details?.submission_deadline) return null;
    const deadline = new Date(details.submission_deadline);
    const now = new Date();
    const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [details?.submission_deadline]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  const deadlineUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7;
  const deadlineWarning = daysUntilDeadline !== null && daysUntilDeadline <= 14;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Deadline Countdown */}
        <div className={cn("rounded-xl border bg-card p-5 border-t-4", deadlineUrgent ? "border-t-red-500 border-red-200" : deadlineWarning ? "border-t-amber-500 border-amber-200" : "border-t-blue-500 border-border")}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submission Deadline</p>
            <div className={cn("rounded-lg p-1.5", deadlineUrgent ? "bg-red-50" : deadlineWarning ? "bg-amber-50" : "bg-blue-50")}>
              <Clock className={cn("h-4 w-4", deadlineUrgent ? "text-red-600" : deadlineWarning ? "text-amber-600" : "text-blue-600")} />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", deadlineUrgent ? "text-red-700" : deadlineWarning ? "text-amber-700" : "text-foreground")}>
            {daysUntilDeadline !== null ? (
              daysUntilDeadline > 0 ? `${daysUntilDeadline} days` : daysUntilDeadline === 0 ? "Today" : "Overdue"
            ) : "Not set"}
          </p>
          {details?.submission_deadline && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(details.submission_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>

        {/* Bid Price */}
        <div className="rounded-xl border border-t-emerald-500 border-border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bid Price</p>
            <div className="rounded-lg bg-emerald-50 p-1.5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600">
            {value.amount != null
              ? `${value.kind === "approved" ? "" : "~"}${details?.bid_currency ?? ""} ${value.amount.toLocaleString()}`
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{tenderValueCaption(value)}</p>
        </div>

        {/* Risk Summary */}
        <div className="rounded-xl border border-t-amber-500 border-border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Summary</p>
            <div className="rounded-lg bg-amber-50 p-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {riskSummary.critical > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {riskSummary.critical} Critical
              </span>
            )}
            {riskSummary.high > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                {riskSummary.high} High
              </span>
            )}
            {riskSummary.medium > 0 && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                {riskSummary.medium} Medium
              </span>
            )}
            {riskSummary.low > 0 && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {riskSummary.low} Low
              </span>
            )}
            {riskSummary.critical === 0 && riskSummary.high === 0 && riskSummary.medium === 0 && riskSummary.low === 0 && (
              <span className="text-sm text-muted-foreground">No risks added</span>
            )}
          </div>
        </div>

        {/* Award Status */}
        <div className="rounded-xl border border-t-purple-500 border-border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Award Status</p>
            <div className="rounded-lg bg-purple-50 p-1.5">
              <FileSearch className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", details?.award_status === "awarded" ? "text-emerald-600" : "text-foreground")}>
            {details?.award_status?.replace(/_/g, " ") ?? "Pending"}
          </p>
        </div>
      </div>

      {/* Cost Estimation Progress */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Cost Estimation Progress</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calculator className="h-3 w-3" /> BOQ Items
              </span>
              <span className="text-xs font-medium">{costProgress.boqItems}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, costProgress.boqItems > 0 ? 75 : 0)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calculator className="h-3 w-3" /> Preliminaries
              </span>
              <span className="text-xs font-medium">{costProgress.prelimItems}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, costProgress.prelimItems > 0 ? 60 : 0)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Send className="h-3 w-3" /> Sub Quotes
              </span>
              <span className="text-xs font-medium">{costProgress.subQuoteItems}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, costProgress.subQuoteItems > 0 ? 50 : 0)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
