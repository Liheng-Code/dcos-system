"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, ChevronRight, Loader2, PauseCircle, Pencil, PlayCircle, Check, Circle, CircleDot, Minus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import { useProject } from "@/components/dashboard/project-context";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { isSubmittedOrLater, STAGE_LABELS, stageIndex, type Workstream } from "@/lib/qs/tender-lifecycle";
import type { PrecontractCtx, PrecontractDetails, StaffOption, TenderRecord } from "@/components/project/projects/precontract/shared";
import { GoNoGoSection, RegistrationSection, TenderManagementSection } from "@/components/project/projects/precontract/setup-sections";
import {
  CommercialSection,
  DocumentsSection,
  HseQaqcSection,
  PlanningSection,
  ProcurementSection,
  QsSection,
  RiskSection,
  TechnicalSection,
} from "@/components/project/projects/precontract/workstream-sections";
import {
  BidApprovalSection,
  ClarificationsSection,
  CompilationSection,
  OutcomeSection,
  SubmissionSection,
} from "@/components/project/projects/precontract/control-sections";
import { TENDER_SECTION_GROUPS, type TenderSectionDef, type TenderSectionId } from "@/lib/project/projects/project-tabs";
import {
  getProjectPrecontractDetailByProjectId,
  getTenderRegisterById,
  listProfiles,
  listTenderWorkstreamsByTenderId,
  updateProjectByIdReturning,
} from "@/lib/project/projects/projects-queries";

interface PrecontractDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
  /** Rendered inside another view (post-contract "Tender Record" tab): no page header. */
  embedded?: boolean;
  /** Section from the URL. With onSectionChange the section is controlled by the page; otherwise kept here. */
  section?: string | null;
  onSectionChange?: (section: string) => void;
  /** Open with the Registration editor showing (?edit=1, e.g. from an old /edit link). */
  startEditing?: boolean;
}

const GROUPS = TENDER_SECTION_GROUPS;
type SectionId = TenderSectionId;
type SectionDef = TenderSectionDef;
const ALL_SECTIONS = GROUPS.flatMap((g) => g.sections);

type NavState = "done" | "active" | "todo" | "na";

function sectionState(def: SectionDef, details: PrecontractDetails, workstreams: Workstream[]): NavState {
  const stage = details.tender_stage;
  if (def.workstreams) {
    const rows = workstreams.filter((w) => def.workstreams!.includes(w.code));
    const required = rows.filter((w) => w.required);
    if (rows.length && !required.length) return "na";
    if (required.length && required.every((w) => w.status === "completed")) return "done";
    if (required.some((w) => w.status !== "not_started")) return "active";
    return "todo";
  }
  switch (def.id) {
    case "registration": return "done";
    case "management": return stage === "closed" ? "na" : isSubmittedOrLater(stage) ? "done" : "active";
    case "go-no-go": return details.go_no_go_decision ? "done" : ["review", "go_no_go"].includes(stage) ? "active" : "todo";
    case "approval": return details.bid_approved_at ? "done" : ["internal_review", "approval"].includes(stage) ? "active" : "todo";
    case "submission": return details.submitted_at ? "done" : details.bid_approved_at ? "active" : "todo";
    case "outcome": return ["awarded", "unsuccessful"].includes(stage) ? "done" : ["submitted", "awaiting_result"].includes(stage) ? "active" : "todo";
    default: return "todo";
  }
}

// Where the tender currently needs attention — opened by default.
function defaultSection(details: PrecontractDetails): SectionId {
  const stage = details.tender_stage;
  if (stageIndex(stage) <= stageIndex("go_no_go")) return "go-no-go";
  if (stage === "tendering") return "management";
  if (stage === "internal_review" || stage === "approval") return details.bid_approved_at ? "submission" : "approval";
  return "outcome";
}

function StateIcon({ state }: { state: NavState }) {
  if (state === "done") return <Check className="h-3.5 w-3.5 text-emerald-600" />;
  if (state === "active") return <CircleDot className="h-3.5 w-3.5 text-blue-600" />;
  if (state === "na") return <Minus className="h-3.5 w-3.5 text-muted-foreground/60" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />;
}

export function PrecontractDetail({ project: initialProject, onBack, onUpdate, embedded = false, section, onSectionChange, startEditing = false }: PrecontractDetailProps) {
  const router = useRouter();
  const { setSelectedProjectId, refreshProjects } = useProject();
  const { can, roleCodes } = useTenderPermissions();
  const [project, setProject] = useState(initialProject);
  const [details, setDetails] = useState<PrecontractDetails | null>(null);
  const [tender, setTender] = useState<TenderRecord | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRegistration, setEditingRegistration] = useState(startEditing);
  const [localActive, setLocalActive] = useState<SectionId | null>(null);
  const urlSection = ALL_SECTIONS.find((s) => s.id === section)?.id ?? null;
  const active = onSectionChange ? urlSection : localActive;
  const setActive = (id: SectionId) => (onSectionChange ? onSectionChange(id) : setLocalActive(id));
  // Edit = the Registration section in edit mode.
  const startEdit = useCallback(() => {
    if (onSectionChange) onSectionChange("registration");
    else setLocalActive("registration");
    setEditingRegistration(true);
  }, [onSectionChange]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: pc }, { data: people }, { data: { user } }] = await Promise.all([
      getProjectPrecontractDetailByProjectId(project.id, "*"),
      listProfiles(),
      supabase.auth.getUser(),
    ]);
    setStaff((people ?? []) as StaffOption[]);
    setUserId(user?.id ?? null);
    const d = (pc as PrecontractDetails | null) ?? null;
    setDetails(d);
    if (d?.tender_register_id) {
      const [{ data: t }, { data: ws }] = await Promise.all([
        getTenderRegisterById(d.tender_register_id, "id, tender_no, title, status, issue_date, budget_range"),
        listTenderWorkstreamsByTenderId(d.tender_register_id),
      ]);
      setTender((t as TenderRecord | null) ?? null);
      setWorkstreams((ws ?? []) as Workstream[]);
    } else {
      setTender(null);
      setWorkstreams([]);
    }
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    // Loading from Supabase is asynchronous; state is only set after the awaits resolve.
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const ctx = useMemo<PrecontractCtx | null>(() => details && {
    project,
    details,
    tender,
    workstreams,
    staff,
    userId,
    roleCodes,
    can,
    refresh: load,
    patchWorkstream: (id: string, patch: Partial<Workstream>) =>
      setWorkstreams((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w))),
    // Planning, QTO and Cost Estimation read the project from ProjectContext, so select this tender first.
    openInModule: (href: string) => {
      setSelectedProjectId(project.id);
      router.push(href);
    },
    onEdit: startEdit,
    editingRegistration,
    setEditingRegistration,
    onProjectUpdate: (p: Project) => {
      setProject(p);
      refreshProjects();
      onUpdate(p);
    },
  }, [project, details, tender, workstreams, staff, userId, roleCodes, can, load, setSelectedProjectId, router, refreshProjects, onUpdate, startEdit, editingRegistration]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }


  if (!ctx) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
        <p className="mt-6 text-sm text-muted-foreground">
          This project has no pre-contract details yet. Open <strong>Edit</strong> in the project list to complete the tender registration.
        </p>
      </div>
    );
  }

  const current = active ?? defaultSection(ctx.details);
  const stage = ctx.details.tender_stage;
  const currentIndex = ALL_SECTIONS.findIndex((s) => s.id === current);
  const currentDef = ALL_SECTIONS[currentIndex] ?? ALL_SECTIONS[0];
  const prevSection = currentIndex > 0 ? ALL_SECTIONS[currentIndex - 1] : null;
  const nextSection = currentIndex >= 0 && currentIndex < ALL_SECTIONS.length - 1 ? ALL_SECTIONS[currentIndex + 1] : null;
  const activeGroupIndex = Math.max(0, GROUPS.findIndex((g) => g.sections.some((s) => s.id === currentDef.id)));
  const activeGroup = GROUPS[activeGroupIndex] ?? GROUPS[0];

  function selectGroup(groupIndex: number) {
    const group = GROUPS[groupIndex];
    if (!group || !ctx) return;
    if (group.sections.some((s) => s.id === currentDef.id)) return;
    const preferred =
      group.sections.find((s) => sectionState(s, ctx.details, workstreams) === "active") ??
      group.sections.find((s) => sectionState(s, ctx.details, workstreams) === "todo") ??
      group.sections[0];
    if (preferred) setActive(preferred.id);
  }

  function renderSection() {
    const c = ctx!;
    switch (current) {
      case "registration": return <RegistrationSection ctx={c} />;
      case "management": return <TenderManagementSection ctx={c} />;
      case "go-no-go": return <GoNoGoSection ctx={c} />;
      case "documents": return <DocumentsSection ctx={c} />;
      case "technical": return <TechnicalSection ctx={c} />;
      case "qs": return <QsSection ctx={c} />;
      case "planning": return <PlanningSection ctx={c} />;
      case "procurement": return <ProcurementSection ctx={c} />;
      case "commercial": return <CommercialSection ctx={c} />;
      case "risk": return <RiskSection ctx={c} />;
      case "hse-qaqc": return <HseQaqcSection ctx={c} />;
      case "clarifications": return <ClarificationsSection ctx={c} />;
      case "compilation": return <CompilationSection ctx={c} />;
      case "approval": return <BidApprovalSection ctx={c} />;
      case "submission": return <SubmissionSection ctx={c} />;
      case "outcome": return <OutcomeSection ctx={c} />;
    }
  }

  async function changeProjectStatus(nextStatus: string) {
    const { data, error } = await updateProjectByIdReturning(
      { project_status: nextStatus, updated_at: new Date().toISOString() },
      project.id,
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) {
      const updated = data as Project;
      setProject(updated);
      refreshProjects();
      onUpdate(updated);
      toast.success(
        nextStatus === "on_hold"
          ? "Opportunity placed on hold"
          : nextStatus === "archived"
            ? "Opportunity archived"
            : "Opportunity resumed to active pipeline",
      );
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", embedded ? "rounded-xl border" : "h-full")}>
      {/* Header */}
      {!embedded && <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-6">
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{project.project_name}</h2>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              {project.project_type === "awarded" ? "Post-Contract" : "Pre-Contract"}
            </span>
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              stage === "awarded" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" :
              stage === "closed" || stage === "unsuccessful" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" :
              "border-border bg-muted text-foreground",
            )}>
              {STAGE_LABELS[stage]}
            </span>
            {project.project_status === "on_hold" && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                On Hold
              </span>
            )}
            {project.project_status === "archived" && (
              <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                Archived
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {project.project_code}
            {tender && tender.tender_no !== project.project_code.toUpperCase() && ` · Tender ref ${tender.tender_no}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("tender_register", "edit") && (
            <>
              {project.project_status === "on_hold" || project.project_status === "archived" ? (
                <Button variant="outline" size="sm" onClick={() => void changeProjectStatus("active")}>
                  <PlayCircle className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Resume
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void changeProjectStatus("on_hold")}>
                  <PauseCircle className="h-3.5 w-3.5 mr-1.5 text-amber-600" /> Put On Hold
                </Button>
              )}
              {project.project_status !== "archived" && (
                <Button variant="outline" size="sm" onClick={() => void changeProjectStatus("archived")}>
                  <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
                </Button>
              )}
            </>
          )}
          {can("tender_register", "edit") && !isSubmittedOrLater(stage) && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </div>}

      {/* Visual Pipeline Header: 3 Phase Panels + Active Phase Connected Step Cards */}
      <div className="border-b bg-muted/20 px-4 py-3.5 sm:px-6">
        {/* Row 1: 3-Phase Pipeline Panels (Setup → Workstreams → Control) */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {GROUPS.map((g, gIdx) => {
            const isSelectedGroup = gIdx === activeGroupIndex;
            const states = g.sections.map((s) => sectionState(s, ctx.details, workstreams));
            const applicableCount = states.filter((st) => st !== "na").length || g.sections.length;
            const doneCount = states.filter((st) => st === "done").length;
            const hasActive = states.some((st) => st === "active");
            const isPhaseComplete = applicableCount > 0 && doneCount === applicableCount;
            const pct = applicableCount > 0 ? Math.round((doneCount / applicableCount) * 100) : 0;
            const firstNo = g.sections[0]?.no ?? "";
            const lastNo = g.sections[g.sections.length - 1]?.no ?? "";

            return (
              <div key={g.title} className="relative flex items-stretch">
                <button
                  type="button"
                  onClick={() => selectGroup(gIdx)}
                  className={cn(
                    "group flex w-full flex-col justify-between rounded-xl border p-3 text-left transition-all",
                    isSelectedGroup
                      ? "border-primary bg-card shadow-xs ring-2 ring-primary/15"
                      : "border-border/80 bg-card/60 hover:border-primary/40 hover:bg-card",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wider",
                          isSelectedGroup
                            ? "bg-primary text-primary-foreground"
                            : isPhaseComplete
                              ? "bg-emerald-500/15 text-emerald-700"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        Phase 0{gIdx + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{g.title}</span>
                    </div>
                    <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                      Steps {firstNo}–{lastNo}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isPhaseComplete
                            ? "bg-emerald-500"
                            : isSelectedGroup || hasActive
                              ? "bg-primary"
                              : "bg-slate-400",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {doneCount}/{applicableCount} done
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Row 2: Connected Step Cards Pipeline for Active Phase */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          {activeGroup.sections.map((s, idx) => {
            const state = sectionState(s, ctx.details, workstreams);
            const isCurrent = current === s.id;
            return (
              <div key={s.id} className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "group flex min-w-[148px] flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-all",
                    isCurrent
                      ? "border-primary bg-card text-foreground shadow-xs ring-2 ring-primary/15"
                      : state === "done"
                        ? "border-emerald-200/90 bg-emerald-50/50 text-foreground hover:border-emerald-300 hover:bg-emerald-50"
                        : state === "active"
                          ? "border-blue-200/90 bg-blue-50/50 text-foreground hover:border-blue-300 hover:bg-blue-50"
                          : "border-border/80 bg-card/70 text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : state === "done"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : state === "active"
                              ? "bg-blue-500/15 text-blue-700"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      Step {s.no}
                    </span>
                    <StateIcon state={state} />
                  </div>
                  <span className="truncate text-xs font-semibold leading-snug">{s.label}</span>
                </button>
                {idx < activeGroup.sections.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full-Width Active Step Content */}
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Phase 0{activeGroupIndex + 1} · {activeGroup.title} · Step {currentDef.no} of {ALL_SECTIONS.length}
            </p>
            <h3 className="text-base font-semibold">{currentDef.label}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!prevSection}
              onClick={() => prevSection && setActive(prevSection.id)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              {prevSection ? `${prevSection.no} ${prevSection.label}` : "Prev"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!nextSection}
              onClick={() => nextSection && setActive(nextSection.id)}
            >
              {nextSection ? `${nextSection.no} ${nextSection.label}` : "Next"}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {renderSection()}
      </div>
    </div>
  );
}
