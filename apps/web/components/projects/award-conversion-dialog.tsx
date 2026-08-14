"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, ArrowRight, CheckCircle2, Package, FileText, ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Project } from "@/components/projects/project-edit-sheet";
import { ProjectSetupWizard } from "@/components/projects/project-setup-wizard";
import {
  carryOverBoq,
  carryOverPreliminaries,
  carryOverPriceList,
  carryOverRisks,
  createContractSnapshot,
  autoCreateContractRegister,
} from "@/lib/qs-service";

interface AwardConversionDialogProps {
  project: Project;
  onClose: () => void;
  onConvert: (project: Project) => void;
}

interface TenderDataCounts {
  boqItems: number;
  prelims: number;
  priceList: number;
  risks: number;
  bidSummaries: number;
  awardRecords: number;
}

export function AwardConversionDialog({ project, onClose, onConvert }: AwardConversionDialogProps) {
  const supabase = createClient();
  const [converting, setConverting] = useState(false);
  const [step, setStep] = useState<"confirm" | "wizard">("confirm");
  const [convertedProject, setConvertedProject] = useState<Project | null>(null);

  const [newProjectCode, setNewProjectCode] = useState(`${project.project_code}-PC`);
  const [copyWbs, setCopyWbs] = useState(true);
  const [copyBoq, setCopyBoq] = useState(true);
  const [copyPrelims, setCopyPrelims] = useState(true);
  const [copyPriceList, setCopyPriceList] = useState(true);
  const [copyRisks, setCopyRisks] = useState(true);
  const [autoContract, setAutoContract] = useState(true);

  const [tenderWbsCount, setTenderWbsCount] = useState<number | null>(null);
  const [tenderData, setTenderData] = useState<TenderDataCounts | null>(null);
  const [tenderRegister, setTenderRegister] = useState<{ id: string } | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState<Project | null>(null);
  const [checkingGuards, setCheckingGuards] = useState(true);
  const [conversionLog, setConversionLog] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Find the tender_register linked to this project via project_precontract_details
    supabase
      .from("project_precontract_details")
      .select("tender_register_id")
      .eq("project_id", project.id)
      .maybeSingle()
      .then(({ data: pcData }) => {
        if (cancelled || !pcData?.tender_register_id) {
          setCheckingGuards(false);
          return;
        }
        setTenderRegister({ id: pcData.tender_register_id });

        // Fetch all tender data counts in parallel
        Promise.all([
          supabase.from("projects").select("*").eq("source_tender_project_id", project.id).maybeSingle(),
          supabase.from("wbs_nodes").select("id", { count: "exact", head: true }).eq("project_id", project.id),
          supabase.from("tender_boq_items").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
          supabase.from("tender_preliminaries_items").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
          supabase.from("tender_price_list").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
          supabase.from("tender_risk_items").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
          supabase.from("tender_bid_summaries").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
          supabase.from("tender_award_records").select("id", { count: "exact", head: true }).eq("tender_id", pcData.tender_register_id),
        ]).then(([linkedRes, wbsRes, boqRes, prelimRes, plRes, riskRes, bsRes, awardRes]) => {
          if (cancelled) return;
          setAlreadyLinked((linkedRes.data as Project | null) ?? null);
          setTenderWbsCount(wbsRes.count ?? 0);
          setTenderData({
            boqItems: boqRes.count ?? 0,
            prelims: prelimRes.count ?? 0,
            priceList: plRes.count ?? 0,
            risks: riskRes.count ?? 0,
            bidSummaries: bsRes.count ?? 0,
            awardRecords: awardRes.count ?? 0,
          });
          setCheckingGuards(false);
        });
      });

    return () => { cancelled = true; };
  }, [project.id, supabase]);

  async function handleConvert() {
    if (!newProjectCode.trim()) {
      toast.error("Enter a project code for the post-contract project");
      return;
    }
    if (!tenderRegister?.id) {
      toast.error("No tender register linked to this project");
      return;
    }
    setConverting(true);
    setConversionLog([]);

    // 1. Create a brand-new post-contract project row, linked back to the tender.
    const {
      id: _oldId, project_code: _oldCode, project_type: _oldType, project_status: _oldStatus,
      created_at: _createdAt, updated_at: _updatedAt, source_tender_project_id: _oldLink,
      ...copyable
    } = project;

    const { data: created, error: insertErr } = await supabase
      .from("projects")
      .insert({
        ...copyable,
        project_code: newProjectCode.trim(),
        project_type: "awarded",
        project_status: "draft",
        source_tender_project_id: project.id,
      })
      .select()
      .single();

    if (insertErr) {
      toast.error(insertErr.message);
      setConverting(false);
      return;
    }
    setConversionLog((prev) => [...prev, `Created post-contract project ${created.project_code}`]);

    // 2. Record the award outcome on the tender's own precontract details.
    await supabase
      .from("project_precontract_details")
      .update({ award_status: "awarded", award_date: new Date().toISOString().slice(0, 10) })
      .eq("project_id", project.id);

    // 3. Carry over data based on user selections
    const counts = { boqItemCount: 0, priceListCount: 0, prelimsCount: 0, riskCount: 0 };

    if (copyWbs && (tenderWbsCount ?? 0) > 0) {
      const { error: cloneErr } = await supabase.rpc("clone_wbs_nodes_between_projects", {
        p_source_project_id: project.id,
        p_target_project_id: created.id,
      });
      if (cloneErr) {
        toast.error(`WBS copy failed: ${cloneErr.message}`);
      } else {
        setConversionLog((prev) => [...prev, `Copied ${tenderWbsCount} WBS nodes`]);
      }
    }

    if (copyBoq && (tenderData?.boqItems ?? 0) > 0) {
      try {
        const result = await carryOverBoq(created.id, tenderRegister.id);
        counts.boqItemCount = result.itemCount;
        setConversionLog((prev) => [...prev, `Carried over ${result.itemCount} BOQ items (locked baseline)`]);
      } catch (e) {
        toast.error(`BOQ carry-over failed: ${(e as Error).message}`);
      }
    }

    if (copyPrelims && (tenderData?.prelims ?? 0) > 0) {
      try {
        const result = await carryOverPreliminaries(created.id, tenderRegister.id);
        counts.prelimsCount = result.itemCount;
        setConversionLog((prev) => [...prev, `Carried over ${result.itemCount} preliminaries items (locked baseline)`]);
      } catch (e) {
        toast.error(`Preliminaries carry-over failed: ${(e as Error).message}`);
      }
    }

    if (copyPriceList && (tenderData?.priceList ?? 0) > 0) {
      try {
        counts.priceListCount = await carryOverPriceList(created.id, tenderRegister.id);
        setConversionLog((prev) => [...prev, `Carried over ${counts.priceListCount} price list items`]);
      } catch (e) {
        toast.error(`Price list carry-over failed: ${(e as Error).message}`);
      }
    }

    if (copyRisks && (tenderData?.risks ?? 0) > 0) {
      try {
        counts.riskCount = await carryOverRisks(created.id, tenderRegister.id);
        setConversionLog((prev) => [...prev, `Carried over ${counts.riskCount} risk items`]);
      } catch (e) {
        toast.error(`Risks carry-over failed: ${(e as Error).message}`);
      }
    }

    // 4. Create contract snapshot
    if ((tenderData?.bidSummaries ?? 0) > 0) {
      try {
        await createContractSnapshot(created.id, tenderRegister.id, project.id, counts);
        setConversionLog((prev) => [...prev, "Created bid summary snapshot"]);
      } catch (e) {
        toast.error(`Snapshot creation failed: ${(e as Error).message}`);
      }
    }

    // 5. Auto-create contract register
    if (autoContract && (tenderData?.awardRecords ?? 0) > 0) {
      try {
        await autoCreateContractRegister(
          created.id,
          project.project_name,
          tenderRegister.id,
          project.contract_value ?? 0,
          project.currency ?? "USD",
          project.start_date,
          project.end_date,
        );
        setConversionLog((prev) => [...prev, "Auto-created head contract register entry"]);
      } catch (e) {
        toast.error(`Contract register creation failed: ${(e as Error).message}`);
      }
    }

    setConvertedProject(created as Project);
    toast.success(`Post-contract project ${created.project_code} created with tender data carry-over.`);
    setStep("wizard");
    setConverting(false);
  }

  if (step === "wizard" && convertedProject) {
    return (
      <ProjectSetupWizard
        project={convertedProject}
        onClose={onClose}
        onSave={(p) => {
          toast.success("Post-contract project setup completed");
          onConvert(p);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold">Convert to Post-Contract</h2>
            <p className="text-sm text-muted-foreground">
              Create a new execution project with tender data carry-over.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {checkingGuards ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : alreadyLinked ? (
          <div className="px-6 py-5 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800">
                This tender has already been assigned to post-contract project{" "}
                <strong>{alreadyLinked.project_code} — {alreadyLinked.project_name}</strong>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => onConvert(alreadyLinked)}>
                <ArrowRight className="h-4 w-4 mr-1.5" /> Back to Project List
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              {/* Flow diagram */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <span className="text-xs font-bold">T</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Pre-Contract Project</p>
                    <p className="text-xs text-muted-foreground">{project.project_code} — {project.project_name}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Post-Contract Project</p>
                    <p className="text-xs text-muted-foreground">New linked project with tender data carried over as locked baseline</p>
                  </div>
                </div>
              </div>

              {/* Project code */}
              <div className="space-y-1.5">
                <Label htmlFor="new_code">Project Code for Post-Contract Project</Label>
                <input
                  id="new_code" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Must be different from the tender&apos;s code ({project.project_code}) — project codes are unique.
                </p>
              </div>

              {/* Data carry-over options */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Carry-Over</p>

                {(tenderWbsCount ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={copyWbs} onChange={(e) => setCopyWbs(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                      <span>
                        Copy WBS structure
                        <span className="block text-xs text-muted-foreground">
                          {tenderWbsCount} node{tenderWbsCount !== 1 ? "s" : ""} — structure only, no progress/budget
                        </span>
                      </span>
                    </span>
                  </label>
                )}

                {(tenderData?.boqItems ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={copyBoq} onChange={(e) => setCopyBoq(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <Package className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                      <span>
                        Carry over BOQ items (locked baseline)
                        <span className="block text-xs text-muted-foreground">
                          {tenderData?.boqItems} item{tenderData?.boqItems !== 1 ? "s" : ""} — read-only baseline for progress claims
                        </span>
                      </span>
                    </span>
                  </label>
                )}

                {(tenderData?.prelims ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={copyPrelims} onChange={(e) => setCopyPrelims(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-cyan-600" />
                      <span>
                        Carry over preliminaries (locked baseline)
                        <span className="block text-xs text-muted-foreground">
                          {tenderData?.prelims} item{tenderData?.prelims !== 1 ? "s" : ""} — locked baseline
                        </span>
                      </span>
                    </span>
                  </label>
                )}

                {(tenderData?.priceList ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={copyPriceList} onChange={(e) => setCopyPriceList(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <Package className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                      <span>
                        Carry over price list
                        <span className="block text-xs text-muted-foreground">
                          {tenderData?.priceList} rate{tenderData?.priceList !== 1 ? "s" : ""} — locked rates for BOQ pricing
                        </span>
                      </span>
                    </span>
                  </label>
                )}

                {(tenderData?.risks ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={copyRisks} onChange={(e) => setCopyRisks(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                      <span>
                        Carry over risk register
                        <span className="block text-xs text-muted-foreground">
                          {tenderData?.risks} risk{tenderData?.risks !== 1 ? "s" : ""} — carry to post-contract risk management
                        </span>
                      </span>
                    </span>
                  </label>
                )}

                {(tenderData?.awardRecords ?? 0) > 0 && (
                  <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                    <input type="checkbox" checked={autoContract} onChange={(e) => setAutoContract(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                    <span className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
                      <span>
                        Auto-create contract register entry
                        <span className="block text-xs text-muted-foreground">
                          Head contract from award record — {project.contract_value ? `${project.currency} ${project.contract_value.toLocaleString()}` : "value from award"}
                        </span>
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  This will create a brand-new post-contract project linked to this awarded tender. The tender project itself
                  will not be changed, and stays available as a historical record.
                </p>
              </div>

              {/* Conversion log (shown during/after conversion) */}
              {conversionLog.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1">
                  <p className="text-xs font-medium text-emerald-800 mb-2">Conversion Progress:</p>
                  {conversionLog.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                      {msg}
                    </div>
                  ))}
                </div>
              )}

              {/* What happens next */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">What happens next:</p>
                <ul className="space-y-1.5">
                  {[
                    "A new post-contract project is created with its own project code",
                    "The tender project is preserved unchanged as a historical record",
                    ...(copyWbs && (tenderWbsCount ?? 0) > 0 ? ["Preliminary WBS structure is copied into the new project"] : []),
                    ...(copyBoq && (tenderData?.boqItems ?? 0) > 0 ? ["BOQ items carried over as locked baseline (read-only)"] : []),
                    ...(copyPrelims && (tenderData?.prelims ?? 0) > 0 ? ["Preliminaries carried over as locked baseline"] : []),
                    ...(copyPriceList && (tenderData?.priceList ?? 0) > 0 ? ["Price list rates carried over"] : []),
                    ...(copyRisks && (tenderData?.risks ?? 0) > 0 ? ["Risk register carried over"] : []),
                    ...(autoContract && (tenderData?.awardRecords ?? 0) > 0 ? ["Head contract auto-created in contract register"] : []),
                    "Post-contract setup wizard opens for the new project",
                    "Configure WBS, calendar, document numbering",
                    "Set up approval flows and budget",
                    "Activate for execution",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4 sticky bottom-0 bg-background">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConvert} disabled={converting}>
                {converting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
                Create & Assign
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
