"use client";

import { useEffect, useState } from "react";
import { getContractRegisterByProjectIdWithStatusActiveDraft, getProjectPrecontractDetailByProjectId, listQsRiskItemsByProjectId } from "@/lib/project/projects/projects-queries";
import { ChevronLeft, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import { ProjectOverview } from "@/components/project/projects/overview/project-overview";
import { ClaimsTab, PaymentsTab, VariationsTab } from "@/components/project/projects/overview/commercial";
import { POSTCONTRACT_TABS, type PostcontractTabId } from "@/lib/project/projects/project-tabs";
import { ProjectSettings } from "@/components/project/projects/settings/project-settings";
import { getContractSnapshot, type ContractSnapshot } from "@/lib/qs/public";
import { PrecontractDetail } from "@/components/project/projects/precontract-detail";
import { ProjectStakeholdersTab } from "@/components/project/projects/project-stakeholders-tab";
import { useProject } from "@/components/dashboard/project-context";

interface PostcontractDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
  /** Tab from the URL. With onTabChange the tab is controlled by the page; otherwise kept here. */
  tab?: string | null;
  onTabChange?: (tab: string) => void;
  /** Settings section to scroll to (?section=). */
  settingsSection?: string | null;
}

const TABS = POSTCONTRACT_TABS;

type TabId = PostcontractTabId;

interface ContractRecord {
  id: string;
  contract_no: string;
  contract_type: string;
  title: string;
  party_name: string;
  contract_value: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  signed_date: string | null;
}

interface RiskItem {
  id: string;
  risk_no: string;
  description: string;
  category: string;
  likelihood: string;
  impact: string;
  risk_score: string;
  priced_amount: number;
  mitigation: string | null;
  owner: string | null;
  source: string;
}

export function PostcontractDetail({ project, onBack, onUpdate, tab, onTabChange, settingsSection = null }: PostcontractDetailProps) {
  const { setSelectedProjectId } = useProject();
  const [localTab, setLocalTab] = useState<TabId>("overview");
  const activeTab: TabId = onTabChange ? (TABS.find((t) => t.id === tab)?.id ?? "overview") : localTab;
  const setActiveTab = (id: TabId) => (onTabChange ? onTabChange(id) : setLocalTab(id));

  // Module pages read the project from ProjectContext, so select this one before leaving.
  const selectProject = () => setSelectedProjectId(project.id);
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [snapshot, setSnapshot] = useState<ContractSnapshot | null>(null);
  const [hasTenderRecord, setHasTenderRecord] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [contractRes, risksRes, snapshotRes, tenderRes] = await Promise.all([
        // A contract awarded in place starts as a draft head contract until it is signed; prefer the active one.
        getContractRegisterByProjectIdWithStatusActiveDraft(project.id),
        listQsRiskItemsByProjectId(project.id),
        getContractSnapshot(project.id),
        getProjectPrecontractDetailByProjectId(project.id, "project_id"),
      ]);

      setHasTenderRecord(!!tenderRes.data);
      if (contractRes.data) setContract(contractRes.data as ContractRecord);
      if (risksRes.data) setRisks(risksRes.data as RiskItem[]);
      setSnapshot(snapshotRes);
      setLoading(false);
    }
    load();
  }, [project.id]);

  function formatCurrency(val: number | null) {
    if (val == null || val === 0) return "—";
    return `${project.currency ?? "USD"} ${val.toLocaleString()}`;
  }

  function renderSnapshot(snapshot: ContractSnapshot) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Tender Bid Summary Snapshot</h3>
          <p className="text-xs text-muted-foreground mb-4">
            This snapshot was captured during award conversion. It represents the tender&apos;s final pricing as a locked reference.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Direct Cost</p>
              <p className="text-sm font-medium">{formatCurrency(snapshot.direct_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preliminaries</p>
              <p className="text-sm font-medium">{formatCurrency(snapshot.preliminaries)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subcontract Cost</p>
              <p className="text-sm font-medium">{formatCurrency(snapshot.subcontract_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overhead</p>
              <p className="text-sm font-medium">{snapshot.overhead_pct}% ({formatCurrency(snapshot.overhead_amount)})</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Profit</p>
              <p className="text-sm font-medium">{snapshot.profit_pct}% ({formatCurrency(snapshot.profit_amount)})</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contingency</p>
              <p className="text-sm font-medium">{formatCurrency(snapshot.contingency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Allowance</p>
              <p className="text-sm font-medium">{formatCurrency(snapshot.risk_allowance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">VAT</p>
              <p className="text-sm font-medium">{snapshot.vat_pct}% ({formatCurrency(snapshot.vat_amount)})</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Total Bid Price</span>
              <span className="text-lg font-bold">{formatCurrency(snapshot.total_bid_price)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Carry-Over Counts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">BOQ Items</p>
              <p className="text-lg font-bold">{snapshot.boq_item_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Price List</p>
              <p className="text-lg font-bold">{snapshot.price_list_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preliminaries</p>
              <p className="text-lg font-bold">{snapshot.prelims_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risks</p>
              <p className="text-lg font-bold">{snapshot.risk_count}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Conversion Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Converted At</p>
              <p className="text-sm font-medium">{new Date(snapshot.converted_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source Tender</p>
              <p className="text-sm font-medium font-mono">{snapshot.tender_id.slice(0, 8)}…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTabContent() {
    switch (activeTab) {
      case "overview":
        return <ProjectOverview project={project} onUpdated={onUpdate} />;

      case "settings":
        return <ProjectSettings project={project} onProjectUpdated={onUpdate} section={settingsSection} />;

      case "team":
        return (
          <div className="max-w-3xl">
            <ProjectStakeholdersTab projectId={project.id} />
          </div>
        );

      case "tender":
        return (
          <div className="space-y-4">
            {snapshot && renderSnapshot(snapshot)}
            {hasTenderRecord && <PrecontractDetail project={project} onBack={() => setActiveTab("overview")} onUpdate={onUpdate} embedded />}
          </div>
        );

      case "contract":
        if (!contract) {
          return (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No contract register entry found.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Contracts can be created via <strong>Contracts &gt; Register</strong> in the sidebar, or auto-created during award conversion.
              </p>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Contract Details</h3>
                <Link href={`/dashboard/contracts/register/${contract.id}`} onClick={selectProject}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View Full Record
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Contract No</p>
                  <p className="text-sm font-medium font-mono">{contract.contract_no}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium capitalize">{contract.contract_type.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contractor</p>
                  <p className="text-sm font-medium">{contract.party_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Value</p>
                  <p className="text-sm font-medium">{formatCurrency(contract.contract_value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    contract.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                    "bg-muted text-muted-foreground border-border",
                  )}>
                    {contract.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Signed Date</p>
                  <p className="text-sm font-medium">{contract.signed_date ? new Date(contract.signed_date).toLocaleDateString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="text-sm font-medium">
                    {contract.start_date ?? "—"}{contract.end_date ? ` → ${contract.end_date}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case "boq":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">QS BOQ</h3>
                <Link href="/dashboard/qs/boq" onClick={selectProject}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open BOQ Module
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                The BOQ module contains the locked baseline carried over from the tender, plus any revisions made during execution.
              </p>
              {snapshot && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Baseline Items</p>
                  <p className="text-sm font-medium">{snapshot.boq_item_count} items (locked)</p>
                </div>
              )}
            </div>

            {/* Risks carried from tender */}
            {risks.length > 0 && (
              <div className="rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold mb-3">Risk Register ({risks.length})</h3>
                <div className="space-y-2">
                  {risks.map((risk) => (
                    <div key={risk.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{risk.description}</p>
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
                          {risk.source && (
                            <span className="text-[10px] text-muted-foreground">{risk.source}</span>
                          )}
                        </div>
                      </div>
                      {risk.mitigation && (
                        <p className="mt-1 text-xs text-muted-foreground">Mitigation: {risk.mitigation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "variations":
        return <VariationsTab project={project} />;

      case "claims":
        return <ClaimsTab project={project} />;

      case "payments":
        return <PaymentsTab project={project} />;

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
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              Post-Contract
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
          <p className="text-xs text-muted-foreground">{project.project_code}{contract ? ` · ${contract.contract_no}` : ""}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto border-b px-6">
        <div className="flex gap-1 min-w-max">
          {TABS.filter((tab) => tab.id !== "tender" || hasTenderRecord || !!snapshot).map((tab) => (
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
    </div>
  );
}
