// Creates a project from the New project dialog: a tender (with its tender register entry and
// pre-contract details, as the pre-contract wizard created them) or an awarded project (with the
// default calendar, numbering, budget and WBS setup, so it starts mostly configured).

import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/project/projects/project-types";
import {
  getProjectBudgetSettings,
  getProjectCalendar,
  getProjectNumberingRules,
  getProjectWbsSetup,
  upsertProjectBudgetSettings,
  upsertProjectCalendar,
  upsertProjectNumberingRules,
  upsertProjectWbsSetup,
} from "@/lib/project-setup-service";
import { setProjectWbsTemplateId } from "@/lib/project/wbs/wbs-template-queries";
import {
  DEFAULT_BUDGET,
  DEFAULT_CALENDAR,
  DEFAULT_CURRENCY,
  DEFAULT_NUMBERING,
  DEFAULT_TENDER,
  DEFAULT_TIME_ZONE,
  DEFAULT_WBS_METHOD,
} from "@/lib/project/projects/setup-defaults";

export interface NewProjectInput {
  kind: "tender" | "awarded";
  name: string;
  clientId: string;
  category: string;
  buildingType: string;
  projectManagerId: string;
  /** Tender only: ISO timestamp. */
  submissionDeadline?: string;
  /** Awarded only: company WBS template, applied later from the WBS builder. */
  wbsTemplateId?: string;
}

export interface NewProjectResult {
  project: Project;
  /** Set when the project was created but a follow-up record was not (the project still opens). */
  warning: string | null;
}

export async function createProject(input: NewProjectInput): Promise<NewProjectResult> {
  const supabase = createClient();
  // The code is assigned by the database (projects_assign_code) and never changes.
  const { data, error } = await supabase
    .from("projects")
    .insert({
      project_name: input.name.trim(),
      project_type: input.kind,
      client_id: input.clientId || null,
      category: input.category || null,
      building_type: input.buildingType || null,
      project_manager_id: input.projectManagerId || null,
      project_status: "draft",
      currency: DEFAULT_CURRENCY,
      time_zone: DEFAULT_TIME_ZONE,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const project = data as Project;

  try {
    if (input.kind === "tender") await registerTender(project, input.submissionDeadline ?? null);
    else await applySetupDefaults(project.id, input.wbsTemplateId ?? null);
    return { project, warning: null };
  } catch (err) {
    const what = input.kind === "tender" ? "the tender registration" : "the default setup";
    return { project, warning: `${what} was not saved: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

// The client's tender reference starts as the project code; it can be changed in Registration.
async function registerTender(project: Project, submissionDeadline: string | null) {
  const supabase = createClient();
  const { data: tender, error } = await supabase
    .from("tender_register")
    .insert({
      project_id: project.id,
      tender_no: project.project_code.toUpperCase(),
      title: project.project_name,
      tender_type: DEFAULT_TENDER.tender_type,
      procurement_method: DEFAULT_TENDER.procurement_method,
      currency: project.currency,
      submission_deadline: submissionDeadline,
      tender_days: DEFAULT_TENDER.tender_days,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // The lifecycle stage starts at its default ('opportunity'); lib/qs/tender-lifecycle.ts owns it from here.
  const { error: pcError } = await supabase.from("project_precontract_details").upsert(
    {
      project_id: project.id,
      tender_register_id: tender.id,
      tender_type: DEFAULT_TENDER.tender_type,
      procurement_method: DEFAULT_TENDER.procurement_method,
      submission_deadline: submissionDeadline,
      tender_days: DEFAULT_TENDER.tender_days,
      bid_currency: project.currency,
    },
    { onConflict: "project_id" },
  );
  if (pcError) throw new Error(pcError.message);
}

async function applySetupDefaults(projectId: string, wbsTemplateId: string | null) {
  await upsertProjectCalendar({ project_id: projectId, ...DEFAULT_CALENDAR });
  await upsertProjectNumberingRules({ project_id: projectId, ...DEFAULT_NUMBERING });
  await upsertProjectBudgetSettings({ project_id: projectId, ...DEFAULT_BUDGET });
  await upsertProjectWbsSetup({ project_id: projectId, setup_method: DEFAULT_WBS_METHOD });
  if (wbsTemplateId) await setProjectWbsTemplateId(projectId, wbsTemplateId);
}

/**
 * Adds the default calendar, numbering, budget and WBS setup where a project has none yet, e.g.
 * a tender that was just awarded. Never overwrites what is already set.
 */
export async function ensureSetupDefaults(projectId: string): Promise<void> {
  const [calendar, numbering, budget, wbs] = await Promise.all([
    getProjectCalendar(projectId),
    getProjectNumberingRules(projectId),
    getProjectBudgetSettings(projectId),
    getProjectWbsSetup(projectId),
  ]);
  if (!calendar) await upsertProjectCalendar({ project_id: projectId, ...DEFAULT_CALENDAR });
  if (!numbering) await upsertProjectNumberingRules({ project_id: projectId, ...DEFAULT_NUMBERING });
  if (!budget) await upsertProjectBudgetSettings({ project_id: projectId, ...DEFAULT_BUDGET });
  if (!wbs) await upsertProjectWbsSetup({ project_id: projectId, setup_method: DEFAULT_WBS_METHOD });
}
