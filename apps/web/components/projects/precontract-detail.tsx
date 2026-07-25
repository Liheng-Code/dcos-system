"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, Loader2, Pencil, ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/components/projects/project-edit-sheet";
import { PrecontractDashboard } from "@/components/dashboard/precontract-dashboard";
import { PrecontractWizard } from "@/components/projects/precontract-wizard";
import { AwardConversionDialog } from "@/components/projects/award-conversion-dialog";

interface PrecontractDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "tender-register", label: "Tender Register" },
  { id: "cost-estimation", label: "Cost Estimation" },
  { id: "risks", label: "Risks" },
  { id: "submissions", label: "Submissions" },
  { id: "evaluation", label: "Evaluation" },
  { id: "award", label: "Award" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface PrecontractDetails {
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

interface Submission {
  id: string;
  invitation_id: string | null;
  supplier_name: string;
  bid_amount: number | null;
  submission_status: string;
  submitted_date: string | null;
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

interface Evaluation {
  id: string;
  method: string;
  status: string;
  recommended_bidder: string | null;
  completed_at: string | null;
}

interface AwardRecord {
  id: string;
  submission_id: string;
  status: string;
  award_date: string | null;
  notes: string | null;
}

export function PrecontractDetail({ project, onBack, onUpdate }: PrecontractDetailProps) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<PrecontractDetails | null>(null);
  const [tender, setTender] = useState<TenderRecord | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [awards, setAwards] = useState<AwardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConversion, setShowConversion] = useState(false);

  useEffect(() => {
    async function load() {
      // Load precontract details
      const { data: pcData } = await supabase
        .from("project_precontract_details")
        .select("*")
        .eq("project_id", project.id)
        .single();

      if (pcData) {
        setDetails(pcData as PrecontractDetails);

        // Load tender record
        if (pcData.tender_register_id) {
          const { data: tenderData } = await supabase
            .from("tender_register")
            .select("*")
            .eq("id", pcData.tender_register_id)
            .single();
          if (tenderData) setTender(tenderData as TenderRecord);

          // Load submissions
          const { data: subData } = await supabase
            .from("tender_submissions")
            .select("*")
            .eq("tender_id", pcData.tender_register_id)
            .order("submitted_date", { ascending: false });
          if (subData) setSubmissions(subData as Submission[]);

          // Load risks
          const { data: riskData } = await supabase
            .from("tender_risk_items")
            .select("*")
            .eq("tender_id", pcData.tender_register_id)
            .order("risk_score", { ascending: false });
          if (riskData) setRisks(riskData as RiskItem[]);

          // Load evaluations
          const { data: evalData } = await supabase
            .from("bid_evaluations")
            .select("*")
            .eq("tender_id", pcData.tender_register_id);
          if (evalData) setEvaluations(evalData as Evaluation[]);

          // Load awards
          const { data: awardData } = await supabase
            .from("tender_award_records")
            .select("*")
            .eq("tender_id", pcData.tender_register_id);
          if (awardData) setAwards(awardData as AwardRecord[]);
        }
      }
      setLoading(false);
    }
    load();
  }, [project.id, supabase]);

  function renderTabContent() {
    switch (activeTab) {
      case "overview":
        return <PrecontractDashboard projectId={project.id} projectName={project.project_name} />;
      case "tender-register":
        if (!tender) {
          return (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No tender register linked to this project.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Create or link a tender record via <strong>Pre-Contract &gt; Tender Register</strong> in the sidebar.
              </p>
            </div>
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
                <div>
                  <p className="text-xs text-muted-foreground">Tender No</p>
                  <p className="text-sm font-medium">{tender.tender_no}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="text-sm font-medium">{tender.title}</p>
                </div>
              </div>
            </div>
            {details && (
              <div className="rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold mb-4">Procurement Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tender Type</p>
                    <p className="text-sm font-medium capitalize">{(details.tender_type ?? "—").replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Procurement Method</p>
                    <p className="text-sm font-medium capitalize">{(details.procurement_method ?? "—").replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Value</p>
                    <p className="text-sm font-medium">
                      {details.estimated_value != null ? `${details.bid_currency} ${details.estimated_value.toLocaleString()}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bid Price</p>
                    <p className="text-sm font-medium">
                      {details.bid_price != null ? `${details.bid_currency} ${details.bid_price.toLocaleString()}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submission Deadline</p>
                    <p className="text-sm font-medium">
                      {details.submission_deadline ? new Date(details.submission_deadline).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tender Days</p>
                    <p className="text-sm font-medium">{details.tender_days ?? "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case "cost-estimation":
        return (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Cost estimation is available through the <strong>Pre-Contract &gt; Cost Estimation</strong> sidebar link.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Tender ID: {details?.tender_register_id ?? "Not linked"}
            </p>
          </div>
        );
      case "risks":
        return (
          <div className="space-y-3">
            {risks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No risks registered for this tender.</p>
              </div>
            ) : (
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
                    {risk.mitigation && (
                      <p className="mt-2 text-xs text-muted-foreground">Mitigation: {risk.mitigation}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "submissions":
        return (
          <div className="space-y-3">
            {submissions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No submissions received yet.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Bid Amount</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2.5 font-medium">{sub.supplier_name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {sub.bid_amount != null ? `${details?.bid_currency ?? "USD"} ${sub.bid_amount.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            sub.submission_status === "shortlisted" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                            sub.submission_status === "evaluated" ? "bg-blue-50 text-blue-600 border-blue-200" :
                            "bg-muted text-muted-foreground border-border",
                          )}>
                            {sub.submission_status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {sub.submitted_date ? new Date(sub.submitted_date).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      case "evaluation":
        return (
          <div className="space-y-3">
            {evaluations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No evaluations conducted yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {evaluations.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium capitalize">{ev.method.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">Recommended: {ev.recommended_bidder ?? "—"}</p>
                      </div>
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        ev.status === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                        ev.status === "in_progress" ? "bg-blue-50 text-blue-600 border-blue-200" :
                        "bg-muted text-muted-foreground border-border",
                      )}>
                        {ev.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "award":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3">Award Status</h3>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                  details?.award_status === "awarded" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  details?.award_status === "lost" ? "bg-red-50 text-red-700 border-red-200" :
                  "bg-muted text-muted-foreground border-border",
                )}>
                  {(details?.award_status ?? "pending").replace(/_/g, " ")}
                </span>
                {details?.award_date && (
                  <span className="text-xs text-muted-foreground">
                    Awarded on {new Date(details.award_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              {details?.award_status === "awarded" && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm text-emerald-800 font-medium">
                    This tender has been awarded. You can convert this to a post-contract project.
                  </p>
                </div>
              )}
              {details?.award_status === "lost" && details?.loss_reason && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">
                    <strong>Loss reason:</strong> {details.loss_reason}
                  </p>
                </div>
              )}
              {details?.award_status !== "awarded" && details?.award_status !== "lost" && (
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("project_precontract_details")
                      .update({ award_status: "awarded", award_date: new Date().toISOString().slice(0, 10) })
                      .eq("project_id", project.id);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    setDetails((prev) => prev ? { ...prev, award_status: "awarded", award_date: new Date().toISOString().slice(0, 10) } : prev);
                    toast.success("Tender marked as awarded");
                  }}
                >
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
                        <span className="text-xs text-muted-foreground">
                          {new Date(award.award_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {award.notes && <p className="mt-1 text-xs text-muted-foreground">{award.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
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
