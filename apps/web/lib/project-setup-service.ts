import { createClient } from "@/lib/supabase/client";

export interface ProjectCalendar {
  id?: string;
  project_id: string;
  working_days: string;
  working_hours: string;
  weekend_rule: string;
  holiday_calendar: string;
  shift_type: string;
  exception_days: string;
}

export interface ProjectWbsSetup {
  id?: string;
  project_id: string;
  setup_method: string;
  wbs_template_id?: string | null;
  source_project_id?: string | null;
}

export interface ProjectNumberingRules {
  id?: string;
  project_id: string;
  format_mask: string;
  discipline_codes: string[];
  document_types: string[];
  revision_format: string;
}

export interface ProjectApprovalFlow {
  id?: string;
  project_id: string;
  flow_type: string;
  role_chain: string[];
}

export interface ProjectBudgetSettings {
  id?: string;
  project_id: string;
  contingency: number;
  cost_code_template: string;
  approval_limit_rule: string;
}

export interface ProjectNotificationRule {
  id?: string;
  project_id: string;
  rule_type: string;
  channel: string;
  enabled: boolean;
}

export interface ProjectActivationLog {
  id?: string;
  project_id: string;
  activated_at?: string;
  activated_by?: string;
  checklist: Record<string, boolean>;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function getProjectCalendar(projectId: string): Promise<ProjectCalendar | null> {
  const supabase = createClient();
  const { data } = await supabase.from("project_calendars").select("*").eq("project_id", projectId).maybeSingle();
  return data;
}

export async function upsertProjectCalendar(calendar: ProjectCalendar): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_calendars").upsert(calendar, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}

// ── WBS Setup ─────────────────────────────────────────────────────────────────

export async function getProjectWbsSetup(projectId: string): Promise<ProjectWbsSetup | null> {
  const supabase = createClient();
  const { data } = await supabase.from("project_wbs_setups").select("*").eq("project_id", projectId).maybeSingle();
  return data;
}

export async function upsertProjectWbsSetup(setup: ProjectWbsSetup): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_wbs_setups").upsert(setup, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}

// ── Numbering Rules ───────────────────────────────────────────────────────────

export async function getProjectNumberingRules(projectId: string): Promise<ProjectNumberingRules | null> {
  const supabase = createClient();
  const { data } = await supabase.from("project_numbering_rules").select("*").eq("project_id", projectId).maybeSingle();
  if (data) {
    return {
      ...data,
      discipline_codes: typeof data.discipline_codes === "string" ? JSON.parse(data.discipline_codes) : data.discipline_codes ?? [],
      document_types: typeof data.document_types === "string" ? JSON.parse(data.document_types) : data.document_types ?? [],
    };
  }
  return null;
}

export async function upsertProjectNumberingRules(rules: ProjectNumberingRules): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_numbering_rules").upsert({
    project_id: rules.project_id,
    format_mask: rules.format_mask,
    discipline_codes: JSON.stringify(rules.discipline_codes),
    document_types: JSON.stringify(rules.document_types),
    revision_format: rules.revision_format,
  }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}

// ── Approval Flows ────────────────────────────────────────────────────────────

export async function getProjectApprovalFlows(projectId: string): Promise<ProjectApprovalFlow[]> {
  const supabase = createClient();
  const { data } = await supabase.from("project_approval_flows").select("*").eq("project_id", projectId);
  return (data ?? []).map((d: any) => ({
    ...d,
    role_chain: typeof d.role_chain === "string" ? JSON.parse(d.role_chain) : d.role_chain ?? [],
  }));
}

export async function upsertProjectApprovalFlows(projectId: string, flows: ProjectApprovalFlow[]): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase.from("project_approval_flows").delete().eq("project_id", projectId);
  if (delErr) throw new Error(delErr.message);
  if (flows.length === 0) return;
  const { error } = await supabase.from("project_approval_flows").insert(
    flows.map(f => ({
      project_id: f.project_id,
      flow_type: f.flow_type,
      role_chain: JSON.stringify(f.role_chain),
    }))
  );
  if (error) throw new Error(error.message);
}

// ── Budget Settings ───────────────────────────────────────────────────────────

export async function getProjectBudgetSettings(projectId: string): Promise<ProjectBudgetSettings | null> {
  const supabase = createClient();
  const { data } = await supabase.from("project_budget_settings").select("*").eq("project_id", projectId).maybeSingle();
  return data ? { ...data, contingency: Number(data.contingency ?? 0) } : null;
}

export async function upsertProjectBudgetSettings(settings: ProjectBudgetSettings): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_budget_settings").upsert(settings, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}

// ── Notification Rules ────────────────────────────────────────────────────────

export async function getProjectNotificationRules(projectId: string): Promise<ProjectNotificationRule[]> {
  const supabase = createClient();
  const { data } = await supabase.from("project_notification_rules").select("*").eq("project_id", projectId).order("rule_type");
  return data ?? [];
}

export async function upsertProjectNotificationRules(projectId: string, rules: ProjectNotificationRule[]): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase.from("project_notification_rules").delete().eq("project_id", projectId);
  if (delErr) throw new Error(delErr.message);
  if (rules.length === 0) return;
  const { error } = await supabase.from("project_notification_rules").insert(rules);
  if (error) throw new Error(error.message);
}

// ── Activation Log ────────────────────────────────────────────────────────────

export async function getProjectActivationLog(projectId: string): Promise<ProjectActivationLog | null> {
  const supabase = createClient();
  const { data } = await supabase.from("project_activation_log").select("*").eq("project_id", projectId).maybeSingle();
  if (data) {
    return {
      ...data,
      checklist: typeof data.checklist === "string" ? JSON.parse(data.checklist) : data.checklist ?? {},
    };
  }
  return null;
}

export async function activateProject(projectId: string, userId: string, checklist: Record<string, boolean>): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_activation_log").insert({
    project_id: projectId,
    activated_by: userId,
    checklist: JSON.stringify(checklist),
  });
  if (error) throw new Error(error.message);
}
