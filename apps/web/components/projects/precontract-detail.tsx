"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, Loader2, Pencil, ArrowRight, CheckCircle, Send, GanttChartSquare, Calculator, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/components/projects/project-edit-sheet";
import { useProject } from "@/components/dashboard/project-context";
import { PrecontractDashboard } from "@/components/dashboard/precontract-dashboard";
import { PrecontractWizard } from "@/components/projects/precontract-wizard";
import { AwardConversionDialog } from "@/components/projects/award-conversion-dialog";
import {
  ClarificationsRegister,
  GoNoGoCard,
  ReturnablesChecklist,
  type GoNoGo,
  type Returnable,
} from "@/components/projects/precontract-bid-prep";
import { SubQuotesTab } from "@/components/tenders/cost-estimation/sub-quotes-tab";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

interface PrecontractDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
}

// Tabs follow the contractor's tender flow: read the documents, programme and price the
// works, collect sub/supplier quotes, review risk, sign off and submit, then record the outcome.
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "tender-docs", label: "Tender Docs & Clarifications" },
  { id: "programme", label: "Programme" },
  { id: "estimate", label: "Estimate" },
  { id: "quotes", label: "Sub/Supplier Quotes" },
  { id: "risks", label: "Risks" },
  { id: "bid-review", label: "Bid Review & Submission" },
  { id: "outcome", label: "Outcome" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface PrecontractDetails extends GoNoGo {
  tender_register_id: string | null;
  tender_type: string | null;
  procurement_method: string | null;
  submission_deadline: string | null;
  tender_days: number | null;
  estimated_value: number | null;
  bid_price: number | null;
  bid_currency: string;
  award_status: string;
  award_date: string | null;
  loss_reason: string | null;
}

interface TenderRecord {
  id: string;
  tender_no: string;
  title: string;
  status: string;
}

interface Addendum {
  id: string;
  addendum_no: string;
  title: string;
  description: string;
  issue_date: string;
  attachment_url: string | null;
}

interface BidSummary {
  id: string;
  revision_no: number;
  direct_cost: number;
  preliminaries: number | null;
  subcontract_cost: number | null;
  overhead_amount: number | null;
  profit_amount: number | null;
  contingency: number | null;
  risk_allowance: number | null;
  vat_amount: number | null;
  total_bid_price: number | null;
  status: string;
}

interface RiskItem {
  id: string;
  title: string;
  category: string;
  likelihood: string;
  impact: string;
  risk_score: string;
  mitigation: string | null;
}

interface AwardRecord {
  id: string;
  submission_id: string;
  status: string;
  award_date: string | null;
  notes: string | null;
}

function Field({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", className)}>{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function PrecontractDetail({ project, onBack, onUpdate }: PrecontractDetailProps) {
  const supabase = createClient();
  const router = useRouter();
  const { setSelectedProjectId } = useProject();
  const { can } = useTenderPermissions();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<PrecontractDetails | null>(null);
  const [tender, setTender] = useState<TenderRecord | null>(null);
  const [addenda, setAddenda] = useState<Addendum[]>([]);
  const [bidSummary, setBidSummary] = useState<BidSummary | null>(null);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [returnables, setReturnables] = useState<Returnable[] | null>(null);
  const [openClarifications, setOpenClarifications] = useState(0);
  const [awards, setAwards] = useState<AwardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConversion, setShowConversion] = useState(false);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    async function load() {
      const { data: pcData } = await supabase
        .from("project_precontract_details")
        .select("*")
        .eq("project_id", project.id)
        .single();

      if (pcData) {
        setDetails(pcData as PrecontractDetails);

        const tenderId = pcData.tender_register_id;
        if (tenderId) {
          const [tenderRes, addRes, bidRes, riskRes, retRes, clarRes, awardRes] = await Promise.all([
            supabase.from("tender_register").select("*").eq("id", tenderId).single(),
            supabase.from("tender_addenda").select("*").eq("tender_id", tenderId).order("issue_date", { ascending: false }),
            supabase
              .from("tender_bid_summaries")
              .select("*")
              .eq("tender_id", tenderId)
              .order("revision_no", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from("tender_risk_items").select("*").eq("tender_id", tenderId).order("risk_score", { ascending: false }),
            // Loaded here too so the Bid Review readiness check is right before that tab is opened.
            supabase.from("tender_returnables").select("*").eq("tender_id", tenderId),
            supabase.from("tender_clarifications").select("id", { count: "exact", head: true }).eq("tender_id", tenderId).eq("status", "open"),
            supabase.from("tender_award_records").select("*").eq("tender_id", tenderId),
          ]);
          if (tenderRes.data) setTender(tenderRes.data as TenderRecord);
          if (addRes.data) setAddenda(addRes.data as Addendum[]);
          if (bidRes.data) setBidSummary(bidRes.data as BidSummary);
          if (riskRes.data) setRisks(riskRes.data as RiskItem[]);
          if (retRes.data) setReturnables(retRes.data as Returnable[]);
          setOpenClarifications(clarRes.count ?? 0);
          if (awardRes.data) setAwards(awardRes.data as AwardRecord[]);
        }
      }
      setLoading(false);
    }
    load();
  }, [project.id, supabase]);

  const currency = details?.bid_currency ?? "USD";
  const money = (v: number | null | undefined) => (v != null ? `${currency} ${Number(v).toLocaleString()}` : "—");
  // The denormalised bid_price wins; otherwise fall back to the latest bid summary revision.
  const finalBidPrice = details?.bid_price ?? bidSummary?.total_bid_price ?? null;

  // Planning and Cost Estimation read the project from ProjectContext, so select this tender first.
  function openInModule(href: string) {
    setSelectedProjectId(project.id);
    router.push(href);
  }

  async function updateAwardStatus(status: "submitted" | "awarded", message: string) {
    const patch: Partial<PrecontractDetails> =
      status === "awarded"
        ? { award_status: "awarded", award_date: new Date().toISOString().slice(0, 10) }
        : { award_status: "submitted" };
    const { error } = await supabase.from("project_precontract_details").update(patch).eq("project_id", project.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDetails((prev) => (prev ? { ...prev, ...patch } : prev));
    toast.success(message);
  }

  function renderTenderDocs() {
    if (!tender) {
      return (
        <EmptyState>
          <p>No tender register linked to this project.</p>
          <p className="text-xs mt-2">
            Create or link a tender record via <strong>Quantity Surveying &gt; Tender &amp; Estimate &gt; Tender Register</strong>.
          </p>
        </EmptyState>
      );
    }
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Tender Information</h3>
            <span className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
              tender.status === "awarded" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
              tender.status === "cancelled" ? "bg-red-50 text-red-600 border-red-200" :
              tender.status === "draft" ? "bg-gray-50 text-gray-600 border-gray-200" :
              "bg-blue-50 text-blue-600 border-blue-200",
            )}>
              {tender.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tender No" value={tender.tender_no} />
            <Field label="Title" value={tender.title} />
            {details && (
              <>
                <Field label="Tender Type" className="capitalize" value={(details.tender_type ?? "—").replace(/_/g, " ")} />
                <Field label="Procurement Method" className="capitalize" value={(details.procurement_method ?? "—").replace(/_/g, " ")} />
                <Field
                  label="Submission Deadline"
                  value={details.submission_deadline ? new Date(details.submission_deadline).toLocaleDateString() : "—"}
                />
                <Field label="Tender Days" value={details.tender_days ?? "—"} />
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Addenda from Client</h3>
          {addenda.length === 0 ? (
            <p className="text-xs text-muted-foreground">No addenda issued.</p>
          ) : (
            <div className="divide-y divide-border">
              {addenda.map((a) => (
                <div key={a.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{a.addendum_no} · {a.title}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(a.issue_date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <ClarificationsRegister tenderId={tender.id} />
      </div>
    );
  }

  function renderProgramme() {
    return (
      <div className="rounded-xl border border-border p-5 space-y-3">
        <h3 className="text-sm font-semibold">Tender Programme</h3>
        <p className="text-sm text-muted-foreground">
          Build the tender programme in Planning. It is usually a submission deliverable and sets the duration used for
          time-related preliminaries (site staff, plant, hoarding).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tender Days" value={details?.tender_days ?? "—"} />
          <Field
            label="Submission Deadline"
            value={details?.submission_deadline ? new Date(details.submission_deadline).toLocaleDateString() : "—"}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => openInModule("/dashboard/planning/gantt")}>
            <GanttChartSquare className="h-3.5 w-3.5 mr-1.5" /> Open Gantt
          </Button>
          <Button size="sm" variant="outline" onClick={() => openInModule("/dashboard/planning/resource-loading")}>
            Resources
          </Button>
        </div>
      </div>
    );
  }

  function renderEstimate() {
    const openButton = (
      <Button size="sm" variant="outline" onClick={() => openInModule("/dashboard/tenders/cost-estimation")}>
        <Calculator className="h-3.5 w-3.5 mr-1.5" /> Open Cost Estimation
      </Button>
    );
    if (!bidSummary) {
      return (
        <EmptyState>
          <p>No bid summary prepared for this tender yet.</p>
          <div className="mt-3">{openButton}</div>
        </EmptyState>
      );
    }
    const rows: [string, number | null][] = [
      ["Direct Cost", bidSummary.direct_cost],
      ["Preliminaries", bidSummary.preliminaries],
      ["Subcontract Cost", bidSummary.subcontract_cost],
      ["Overhead", bidSummary.overhead_amount],
      ["Profit", bidSummary.profit_amount],
      ["Contingency", bidSummary.contingency],
      ["Risk Allowance", bidSummary.risk_allowance],
      ["VAT", bidSummary.vat_amount],
    ];
    return (
      <div className="rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Bid Summary · Rev {bidSummary.revision_no}</h3>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize bg-muted text-muted-foreground border-border">
            {bidSummary.status}
          </span>
        </div>
        <div className="divide-y divide-border text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2">
              <span className="text-muted-foreground">{label}</span>
              <span>{money(value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 font-semibold">
            <span>Total Bid Price</span>
            <span>{money(bidSummary.total_bid_price)}</span>
          </div>
        </div>
        <div className="mt-4">{openButton}</div>
      </div>
    );
  }

  function renderQuotes() {
    if (!tender) return <EmptyState>Link a tender register to record subcontractor and supplier quotes.</EmptyState>;
    // Same component as Cost Estimation > Sub Quotes, so quotes entered in either place match.
    return <SubQuotesTab tenderId={tender.id} />;
  }

  function renderRisks() {
    if (risks.length === 0) return <EmptyState>No risks registered for this tender.</EmptyState>;
    return (
      <div className="space-y-2">
        {risks.map((risk) => (
          <div key={risk.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-medium">{risk.title}</h4>
                <p className="text-xs text-muted-foreground capitalize">{risk.category.replace(/_/g, " ")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  risk.risk_score === "critical" ? "bg-red-100 text-red-700" :
                  risk.risk_score === "high" ? "bg-orange-100 text-orange-700" :
                  risk.risk_score === "medium" ? "bg-yellow-100 text-yellow-700" :
                  "bg-green-100 text-green-700",
                )}>
                  {risk.risk_score}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {risk.likelihood.replace(/_/g, " ")} / {risk.impact.replace(/_/g, " ")}
                </span>
              </div>
            </div>
            {risk.mitigation && <p className="mt-2 text-xs text-muted-foreground">Mitigation: {risk.mitigation}</p>}
          </div>
        ))}
      </div>
    );
  }

  function renderBidReview() {
    const status = details?.award_status ?? "pending";
    const deadline = details?.submission_deadline ? new Date(details.submission_deadline) : null;
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - openedAt) / 86_400_000) : null;
    const mandatory = (returnables ?? []).filter((r) => r.is_mandatory);
    // Required checks block submission; the rest are advisory.
    const checks = [
      { label: "Go decision recorded", ok: details?.go_no_go_decision === "go", required: true },
      { label: "Tender register linked", ok: !!tender, required: true },
      { label: "Bid summary prepared", ok: !!bidSummary, required: false },
      { label: "Bid summary marked final", ok: bidSummary?.status === "final" || bidSummary?.status === "submitted", required: false },
      { label: "Risks reviewed", ok: risks.length > 0, required: false },
      {
        label: openClarifications ? `${openClarifications} client ${openClarifications === 1 ? "query" : "queries"} still open` : "No open client queries",
        ok: openClarifications === 0,
        required: false,
      },
      {
        label: mandatory.length
          ? `Mandatory returnables ready (${mandatory.filter((r) => r.is_ready).length}/${mandatory.length})`
          : "Mandatory returnables listed",
        ok: mandatory.length > 0 && mandatory.every((r) => r.is_ready),
        required: true,
      },
      { label: "Final bid price set", ok: finalBidPrice != null, required: true },
    ];
    const canSubmit = checks.every((c) => !c.required || c.ok) && can("tender_register", "submit");
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4">Bid to Client</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Final Bid Price" value={money(finalBidPrice)} />
            <Field label="Estimated Value" value={money(details?.estimated_value)} />
            <Field label="Submission Deadline" value={deadline ? deadline.toLocaleDateString() : "—"} />
            <Field
              label="Time Remaining"
              className={cn(daysLeft != null && daysLeft < 0 && "text-red-600", daysLeft != null && daysLeft >= 0 && daysLeft <= 3 && "text-orange-600")}
              value={daysLeft == null ? "—" : daysLeft < 0 ? `${-daysLeft} days overdue` : `${daysLeft} days`}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Readiness</h3>
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok
                  ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                  : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={cn(!c.ok && "text-muted-foreground")}>{c.label}</span>
                {c.required && !c.ok && <span className="text-[10px] text-orange-600">required</span>}
              </li>
            ))}
          </ul>
          {details?.go_no_go_decision === "no_go" && (
            <p className="mt-3 text-xs text-red-600">The Go/No-Go decision was No-Go. Change it on Overview to submit.</p>
          )}
          {status === "pending" ? (
            <Button
              size="sm"
              className="mt-4"
              disabled={!canSubmit}
              onClick={() => updateAwardStatus("submitted", "Bid marked as submitted to client")}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Mark as Submitted
            </Button>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground capitalize">Status: {status.replace(/_/g, " ")}</p>
          )}
        </div>

        {tender && <ReturnablesChecklist tenderId={tender.id} onChange={setReturnables} />}
      </div>
    );
  }

  function renderOutcome() {
    const status = details?.award_status ?? "pending";
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Tender Outcome</h3>
          <div className="flex items-center gap-3">
            <span className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium capitalize",
              status === "awarded" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              status === "lost" ? "bg-red-50 text-red-700 border-red-200" :
              "bg-muted text-muted-foreground border-border",
            )}>
              {status.replace(/_/g, " ")}
            </span>
            {details?.award_date && (
              <span className="text-xs text-muted-foreground">
                Awarded on {new Date(details.award_date).toLocaleDateString()}
              </span>
            )}
          </div>
          {status === "awarded" && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800 font-medium">
                This tender has been awarded. You can convert this to a post-contract project.
              </p>
            </div>
          )}
          {status === "lost" && details?.loss_reason && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">
                <strong>Loss reason:</strong> {details.loss_reason}
              </p>
            </div>
          )}
          {status === "pending" && (
            <p className="mt-4 text-xs text-muted-foreground">
              Submit the bid under <strong>Bid Review &amp; Submission</strong> before recording the outcome.
            </p>
          )}
          {(status === "submitted" || status === "evaluated") && can("tender_register", "submit") && (
            <Button size="sm" className="mt-4" onClick={() => updateAwardStatus("awarded", "Tender marked as awarded")}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Mark as Awarded
            </Button>
          )}
        </div>

        {awards.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Award Records</h3>
            {awards.map((award) => (
              <div key={award.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{award.status.replace(/_/g, " ")}</span>
                  {award.award_date && (
                    <span className="text-xs text-muted-foreground">{new Date(award.award_date).toLocaleDateString()}</span>
                  )}
                </div>
                {award.notes && <p className="mt-1 text-xs text-muted-foreground">{award.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderTabContent() {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-4">
            {details && (
              <GoNoGoCard
                projectId={project.id}
                value={details}
                onChange={(v) => setDetails((prev) => (prev ? { ...prev, ...v } : prev))}
              />
            )}
            <PrecontractDashboard projectId={project.id} projectName={project.project_name} />
          </div>
        );
      case "tender-docs":
        return renderTenderDocs();
      case "programme":
        return renderProgramme();
      case "estimate":
        return renderEstimate();
      case "quotes":
        return renderQuotes();
      case "risks":
        return renderRisks();
      case "bid-review":
        return renderBidReview();
      case "outcome":
        return renderOutcome();
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (editing) {
    return (
      <PrecontractWizard
        project={project}
        onClose={() => setEditing(false)}
        onSave={(updated) => {
          setEditing(false);
          onUpdate(updated);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{project.project_name}</h2>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              Pre-Contract
            </span>
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              project.project_status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
              project.project_status === "draft" ? "bg-gray-50 text-gray-600 border-gray-200" :
              "bg-muted text-muted-foreground border-border",
            )}>
              {project.project_status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{project.project_code} · {tender?.tender_no ?? "—"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
        {details?.award_status === "awarded" && (
          <Button size="sm" onClick={() => setShowConversion(true)}>
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Convert to Post-Contract
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto border-b px-6">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {renderTabContent()}
      </div>

      {/* Award Conversion Dialog */}
      {showConversion && (
        <AwardConversionDialog
          project={project}
          onClose={() => setShowConversion(false)}
          onConvert={(updated) => {
            setShowConversion(false);
            onUpdate(updated);
          }}
        />
      )}
    </div>
  );
}
