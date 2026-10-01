"use client";

import { useEffect, useState } from "react";
import { countTenderBidSummariesByTenderId, countTenderBoqItemsByTenderId, countTenderPreliminariesItemsByTenderId, countTenderPriceListByTenderId, countTenderRiskItemsByTenderId, countWbsTasksByProjectId, getStakeholderById, insertContractRegister, listTenderCommercialItemsByTenderId, updateProjectByIdReturning } from "@/lib/projects/projects-queries";
import { X, Loader2, ArrowRight, CheckCircle2, Package, FileText, AlertTriangle, GanttChartSquare, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Project } from "@/components/projects/project-edit-sheet";
import { ProjectSetupWizard } from "@/components/projects/project-setup-wizard";
import {
  carryOverBoq,
  carryOverPreliminaries,
  carryOverPriceList,
  carryOverRisks,
  createContractSnapshot,
} from "@/lib/qs/public";
import { activateBaseline, listBaselines, setBaseline } from "@/lib/planning/baseline-service";
import { COMMERCIAL_TOPICS, setTenderStage, type TenderStage } from "@/lib/qs/tender-lifecycle";

// Award → Post-Contract, in place (master flow step 16: "Do not create a completely new project").
// The same project changes from project_type 'tender' to 'awarded'. Tender-keyed records (documents,
// clarifications, addenda, technical / commercial registers, quotes) stay attached; priced data is
// carried into the post-contract QS tables as a locked baseline and the tender programme becomes the
// contract baseline. Projects awarded before this change keep their separate "-PC" project.

interface AwardConversionDialogProps {
  project: Project;
  tenderId: string;
  stage: TenderStage;
  bidPrice: number | null;
  onClose: () => void;
  onConvert: (project: Project) => void;
}

interface Counts {
  boqItems: number;
  prelims: number;
  priceList: number;
  risks: number;
  bidSummaries: number;
  tasks: number;
}

export function AwardConversionDialog({ project, tenderId, stage, bidPrice, onClose, onConvert }: AwardConversionDialogProps) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [awardDate, setAwardDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractNo, setContractNo] = useState(`HC-${project.project_code}`);
  const [copyBoq, setCopyBoq] = useState(true);
  const [copyPrelims, setCopyPrelims] = useState(true);
  const [copyPriceList, setCopyPriceList] = useState(true);
  const [copyRisks, setCopyRisks] = useState(true);
  const [baselineProgramme, setBaselineProgramme] = useState(true);
  const [createContract, setCreateContract] = useState(true);
  const [converting, setConverting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [converted, setConverted] = useState<Project | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      countTenderBoqItemsByTenderId(tenderId),
      countTenderPreliminariesItemsByTenderId(tenderId),
      countTenderPriceListByTenderId(tenderId),
      countTenderRiskItemsByTenderId(tenderId),
      countTenderBidSummariesByTenderId(tenderId),
      countWbsTasksByProjectId(project.id),
    ]).then(([boq, pre, pl, risk, bs, tasks]) => {
      if (cancelled) return;
      setCounts({
        boqItems: boq.count ?? 0,
        prelims: pre.count ?? 0,
        priceList: pl.count ?? 0,
        risks: risk.count ?? 0,
        bidSummaries: bs.count ?? 0,
        tasks: tasks.count ?? 0,
      });
    });
    return () => { cancelled = true; };
  }, [project.id, tenderId]);

  const add = (msg: string) => setLog((prev) => [...prev, msg]);

  async function createHeadContract() {
    const [{ data: client }, { data: terms }] = await Promise.all([
      project.client_id
        ? getStakeholderById(project.client_id)
        : Promise.resolve({ data: null }),
      listTenderCommercialItemsByTenderId(tenderId),
    ]);
    const label = (t: string) => COMMERCIAL_TOPICS.find((c) => c.topic === t)?.label ?? t;
    const rows = (terms ?? []) as { topic: string; client_requirement: string | null; assessment: string; qualification: string | null }[];
    const payment = rows.find((r) => r.topic === "payment_terms")?.client_requirement ?? null;
    const notes = rows
      .filter((r) => r.client_requirement || r.qualification)
      .map((r) => `${label(r.topic)}: ${r.client_requirement ?? "—"}${r.qualification ? ` (qualified: ${r.qualification})` : ""}`)
      .join("\n");
    const { error } = await insertContractRegister({
      project_id: project.id,
      contract_no: contractNo.trim(),
      contract_type: "head_contract",
      title: project.project_name,
      party_name: (client as { organization_name: string } | null)?.organization_name ?? "Client",
      contract_value: bidPrice ?? 0,
      currency: project.currency ?? "USD",
      start_date: project.start_date,
      end_date: project.end_date,
      status: "draft",
      payment_terms: payment,
      notes: notes ? `Commercial terms from the tender review:\n${notes}` : null,
    });
    if (error) throw new Error(error.message);
  }

  async function handleConvert() {
    if (!contractNo.trim() && createContract) {
      toast.error("Enter the head contract number");
      return;
    }
    setConverting(true);
    setLog([]);
    const c = counts!;
    const carried = { boqItemCount: 0, priceListCount: 0, prelimsCount: 0, riskCount: 0 };

    // 1. Record the award. The stage move is conditional on the tender still being submitted /
    //    awaiting its result, so nothing else runs if someone already recorded the outcome.
    const staged = await setTenderStage(project.id, stage, "awarded", { award_date: awardDate });
    if (staged.error) {
      toast.error(staged.error);
      setConverting(false);
      return;
    }
    add(`Tender recorded as awarded on ${new Date(awardDate).toLocaleDateString()}`);

    // 2. The same project becomes post-contract.
    const { data: updated, error: projErr } = await updateProjectByIdReturning({ project_type: "awarded", contract_value: bidPrice, updated_at: new Date().toISOString() }, project.id);
    if (projErr) {
      toast.error(`Award recorded, but the project type could not be changed: ${projErr.message}`);
      setConverting(false);
      return;
    }
    add("Project converted to post-contract (same project, same code)");

    // 3. Carry priced tender data into the post-contract QS baseline.
    const steps: [boolean, string, () => Promise<void>][] = [
      [copyBoq && c.boqItems > 0, "BOQ", async () => {
        const r = await carryOverBoq(project.id, tenderId);
        carried.boqItemCount = r.itemCount;
        add(`Carried ${r.itemCount} BOQ items into a locked baseline`);
      }],
      [copyPrelims && c.prelims > 0, "Preliminaries", async () => {
        const r = await carryOverPreliminaries(project.id, tenderId);
        carried.prelimsCount = r.itemCount;
        add(`Carried ${r.itemCount} preliminaries items into a locked baseline`);
      }],
      [copyPriceList && c.priceList > 0, "Price list", async () => {
        carried.priceListCount = await carryOverPriceList(project.id, tenderId);
        add(`Carried ${carried.priceListCount} price list rates`);
      }],
      [copyRisks && c.risks > 0, "Risks", async () => {
        carried.riskCount = await carryOverRisks(project.id, tenderId);
        add(`Carried ${carried.riskCount} risks into the post-contract risk register`);
      }],
      [c.bidSummaries > 0, "Contract snapshot", async () => {
        await createContractSnapshot(project.id, tenderId, project.id, carried);
        add("Recorded the tender price snapshot");
      }],
      [createContract, "Head contract", async () => {
        await createHeadContract();
        add(`Created head contract ${contractNo.trim()} (draft) with the commercial terms`);
      }],
      [baselineProgramme && c.tasks > 0, "Programme baseline", async () => {
        const existing = await listBaselines(project.id);
        const n = existing.length ? Math.max(...existing.map((b) => b.baseline_number)) + 1 : 0;
        if (n > 10) throw new Error("No free baseline slot (0–10)");
        await setBaseline(project.id, n, null, { name: "Tender Programme", type: "contract", reason: "Tender programme at award" });
        await activateBaseline(project.id, n);
        add(`Tender programme saved as contract baseline ${n}`);
      }],
    ];
    const failed: string[] = [];
    for (const [run, name, fn] of steps) {
      if (!run) continue;
      try {
        await fn();
      } catch (e) {
        failed.push(`${name}: ${(e as Error).message}`);
      }
    }

    setConverted(updated as Project);
    setFailures(failed);
    setConverting(false);
    if (failed.length) {
      // Stay on the dialog so the gaps are seen before moving on to post-contract setup.
      toast.error(`${project.project_code} is post-contract, but ${failed.length} carry-over step(s) failed.`);
    } else {
      toast.success(`${project.project_code} is now a post-contract project.`);
      setShowSetup(true);
    }
  }

  if (converted && showSetup) {
    return (
      <ProjectSetupWizard
        project={converted}
        onClose={() => onConvert(converted)}
        onSave={(p) => {
          toast.success("Post-contract project setup completed");
          onConvert(p);
        }}
      />
    );
  }

  const option = (checked: boolean, set: (v: boolean) => void, icon: React.ReactNode, title: string, detail: string) => (
    <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
      <span className="flex items-start gap-2">
        {icon}
        <span>{title}<span className="block text-xs text-muted-foreground">{detail}</span></span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4 sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold">Tender Awarded</h2>
            <p className="text-sm text-muted-foreground">Convert {project.project_code} to post-contract, in place.</p>
          </div>
          <button type="button" onClick={() => (converted ? onConvert(converted) : onClose())} disabled={converting}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!counts ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">Award date
                  <input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
                <div className="text-xs text-muted-foreground">Contract value (approved bid)
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {bidPrice != null ? `${project.currency ?? "USD"} ${Number(bidPrice).toLocaleString()}` : "—"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Carry forward</p>
                {counts.boqItems > 0 && option(copyBoq, setCopyBoq, <Package className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />,
                  "Tender BOQ → locked BOQ baseline", `${counts.boqItems} items, read-only baseline for progress claims`)}
                {counts.prelims > 0 && option(copyPrelims, setCopyPrelims, <FileText className="h-4 w-4 mt-0.5 shrink-0 text-cyan-600" />,
                  "Preliminaries → locked baseline", `${counts.prelims} items`)}
                {counts.priceList > 0 && option(copyPriceList, setCopyPriceList, <Package className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />,
                  "Price list", `${counts.priceList} rates`)}
                {counts.risks > 0 && option(copyRisks, setCopyRisks, <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />,
                  "Risk register", `${counts.risks} risks & opportunities`)}
                {counts.tasks > 0 && option(baselineProgramme, setBaselineProgramme, <GanttChartSquare className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />,
                  "Tender programme → contract baseline", `${counts.tasks} activities`)}
                {option(createContract, setCreateContract, <FileSignature className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />,
                  "Head contract in the contract register", "Draft, with the commercial review terms")}
                {createContract && (
                  <input value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="Head contract no."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
                )}
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                The project keeps its code and id. Tender documents, clarifications, addenda, technical and commercial
                reviews and quotations stay attached as the tender record. The post-contract setup wizard opens next.
              </div>

              {failures.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-1 dark:border-red-900 dark:bg-red-950/40">
                  <p className="text-xs font-medium text-red-800 dark:text-red-300">Not carried forward — redo these by hand or ask an administrator:</p>
                  {failures.map((msg) => (
                    <div key={msg} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {msg}
                    </div>
                  ))}
                </div>
              )}

              {log.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1 dark:border-emerald-900 dark:bg-emerald-950/40">
                  {log.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> {msg}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-6 py-4 sticky bottom-0 bg-background">
              {converted ? (
                <Button onClick={() => setShowSetup(true)}>
                  <ArrowRight className="h-4 w-4 mr-1.5" /> Continue to Post-Contract Setup
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={onClose} disabled={converting}>Cancel</Button>
                  <Button onClick={handleConvert} disabled={converting}>
                    {converting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
                    Award & Convert
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
