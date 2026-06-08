"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BookOpen, DollarSign, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { BudgetRevisions } from "@/components/qs/budget-revisions";
import { ContingencyRegister } from "@/components/qs/contingency-register";
import { CurrencySettings } from "@/components/qs/currency-settings";
import { QsAuditLog } from "@/components/qs/audit-log";
import { BudgetView } from "@/components/qs/budget-view";
import { CostEntry } from "@/components/qs/cost-entry";
import { CostScurve } from "@/components/qs/cost-scurve";
import { EvmDashboard } from "@/components/qs/evm-dashboard";
import { PortfolioView } from "@/components/qs/portfolio-view";
import { getBoqList, type QsBoqSummary } from "@/lib/qs-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "boq",       label: "Bill of Quantities" },
  { id: "budget",    label: "Budget & Variance"  },
  { id: "revisions",   label: "Budget Revisions"   },
  { id: "contingency", label: "Contingency"        },
  { id: "costs",       label: "Cost Transactions"  },
  { id: "evm",       label: "EVM Dashboard"      },
  { id: "scurve",    label: "Cost S-Curve"       },
  { id: "portfolio", label: "Portfolio"          },
  { id: "audit",     label: "Audit Log"          },
  { id: "currency",  label: "Currency"           },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function QsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab]           = useState<Tab>("boq");
  const { selectedProjectId: projectId, selectedProject } = useProject();
  const projectName = selectedProject?.project_name ?? projectId;

  const [boqs, setBoqs] = useState<QsBoqSummary[]>([]);
  const [boqsLoading, setBoqsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void Promise.resolve().then(async () => {
      setBoqsLoading(true);
      try {
        setBoqs(await getBoqList(projectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load BOQ summary");
      } finally {
        setBoqsLoading(false);
      }
    });
  }, [projectId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">QS & Cost Control</h1>
            <p className="text-sm text-muted-foreground">
              BOQ management, budget tracking, and cost control
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            Select a project to view QS data.
          </div>
        ) : (
          <>
            {tab === "boq"       && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Bill of Quantities</h2>
                    <p className="text-sm text-muted-foreground">Manage multiple BOQs per project</p>
                  </div>
                  <Button asChild className="gap-1.5">
                    <Link href="/dashboard/qs/boq">
                      <ExternalLink className="h-4 w-4" /> Open BOQ Manager
                    </Link>
                  </Button>
                </div>

                {boqsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                ) : boqs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
                    <BookOpen className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-400">No BOQs yet for this project.</p>
                    <Button asChild className="mt-4">
                      <Link href="/dashboard/qs/boq">Create a BOQ</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {boqs.slice(0, 5).map((b) => (
                      <Link
                        key={b.id}
                        href={`/dashboard/qs/boq/${b.id}`}
                        className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{b.boq_number}</span>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                              b.status === "active" ? "bg-emerald-100 text-emerald-700" :
                              b.status === "locked" ? "bg-slate-900 text-white" :
                              "bg-slate-100 text-slate-600",
                            )}>
                              {b.status}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm text-slate-700">{b.title}</p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{b.section_count} sections</p>
                          <p>{b.item_count} items</p>
                        </div>
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                      </Link>
                    ))}
                    {boqs.length > 5 && (
                      <Link
                        href="/dashboard/qs/boq"
                        className="block rounded-lg border border-dashed border-slate-200 py-3 text-center text-xs font-medium text-slate-500 hover:border-primary/30 hover:text-primary"
                      >
                        View all {boqs.length} BOQs
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
            {tab === "budget"    && <BudgetView       projectId={projectId} projectName={projectName} />}
            {tab === "revisions"   && <BudgetRevisions     projectId={projectId} />}
            {tab === "contingency" && <ContingencyRegister projectId={projectId} />}
            {tab === "costs"       && <CostEntry           projectId={projectId} />}
            {tab === "evm"       && <EvmDashboard     projectId={projectId} />}
            {tab === "scurve"    && <CostScurve       projectId={projectId} />}
            {tab === "portfolio" && <PortfolioView />}
            {tab === "audit"     && <QsAuditLog       projectId={projectId} />}
            {tab === "currency"  && <CurrencySettings projectId={projectId} />}
          </>
        )}
      </div>
    </div>
  );
}
