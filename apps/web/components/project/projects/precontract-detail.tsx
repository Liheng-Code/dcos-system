"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Pencil, Check, Circle, CircleDot, Minus } from "lucide-react";
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
import { getProjectPrecontractDetailByProjectId, getTenderRegisterById, listProfiles, listTenderWorkstreamsByTenderId } from "@/lib/project/projects/projects-queries";

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
  const currentDef = ALL_SECTIONS.find((s) => s.id === current)!;

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
          </div>
          <p className="text-xs text-muted-foreground">
            {project.project_code}
            {tender && tender.tender_no !== project.project_code.toUpperCase() && ` · Tender ref ${tender.tender_no}`}
          </p>
        </div>
        {can("tender_register", "edit") && !isSubmittedOrLater(stage) && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        )}
      </div>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Section navigation: select on small screens, grouped stepper from md up */}
        <div className="border-b px-4 py-3 md:hidden">
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={current}
            onChange={(e) => setActive(e.target.value as SectionId)}
          >
            {GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.sections.map((s) => <option key={s.id} value={s.id}>{s.no} {s.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <nav className="hidden w-60 shrink-0 overflow-y-auto border-r px-3 py-4 md:block">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
              <ul className="space-y-0.5">
                {g.sections.map((s) => {
                  const state = sectionState(s, ctx.details, workstreams);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActive(s.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          current === s.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted-foreground">{s.no}</span>
                        <span className="flex-1 truncate">{s.label}</span>
                        <StateIcon state={state} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {currentDef.no}</p>
            <h3 className="text-base font-semibold">{currentDef.label}</h3>
          </div>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
