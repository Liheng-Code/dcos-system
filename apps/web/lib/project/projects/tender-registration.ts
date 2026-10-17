// Editing a tender's registration (the project, its tender register entry and its pre-contract
// details), as the pre-contract wizard saved it. Creating a tender is in create-project.ts.

import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/project/projects/project-types";

export interface TenderRegistrationForm {
  project_name: string;
  description: string;
  location: string;
  category: string;
  building_type: string;
  client_id: string;
  consultant_id: string;
  /** The client's tender reference; empty means the project code. */
  tender_reference: string;
  tender_type: string;
  procurement_method: string;
  contract_type: string;
  /** Client budget, if disclosed; our own estimate comes from Cost Estimation. */
  budget_range: string;
  currency: string;
  issue_date: string;
  site_visit_date: string;
  /** datetime-local values (local time, no zone). */
  query_deadline: string;
  submission_deadline: string;
  tender_days: string;
  duration: string;
  start_date: string;
  end_date: string;
  project_manager_id: string;
}

export interface RegistrationSource {
  project: Project;
  details: {
    tender_type: string | null;
    procurement_method: string | null;
    submission_deadline: string | null;
    query_deadline?: string | null;
    site_visit_date?: string | null;
    tender_days?: number | null;
  };
  tender: { tender_no: string; issue_date: string | null; budget_range: number | null } | null;
}

/** ISO timestamp → value for an <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

export function registrationFormFrom({ project, details, tender }: RegistrationSource): TenderRegistrationForm {
  return {
    project_name: project.project_name,
    description: project.description ?? "",
    location: project.location ?? "",
    category: project.category ?? "",
    building_type: project.building_type ?? "",
    client_id: project.client_id ?? "",
    consultant_id: project.consultant_id ?? "",
    tender_reference: tender?.tender_no ?? "",
    tender_type: details.tender_type ?? "selective",
    procurement_method: details.procurement_method ?? "limited_bid",
    contract_type: project.contract_type ?? "",
    budget_range: tender?.budget_range != null ? String(tender.budget_range) : "",
    currency: project.currency ?? "USD",
    issue_date: tender?.issue_date ?? "",
    site_visit_date: details.site_visit_date ?? "",
    query_deadline: toLocalInput(details.query_deadline),
    submission_deadline: toLocalInput(details.submission_deadline),
    tender_days: details.tender_days != null ? String(details.tender_days) : "30",
    duration: project.duration ?? "",
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? "",
    project_manager_id: project.project_manager_id ?? "",
  };
}

/** What must be filled in before a tender is saved (the wizard's required fields). */
export function registrationErrors(f: TenderRegistrationForm): string[] {
  const errors: string[] = [];
  if (!f.project_name.trim()) errors.push("Enter the project name.");
  if (!f.category) errors.push("Choose the sector.");
  if (!f.client_id) errors.push("Choose the client.");
  if (!f.submission_deadline) errors.push("Enter the submission deadline.");
  if (!f.project_manager_id) errors.push("Choose the person in charge.");
  if (f.start_date && f.end_date && f.end_date < f.start_date) errors.push("The planned end date is before the start date.");
  return errors;
}

/** Saves the registration. Returns the updated project; throws with a readable message. */
export async function saveTenderRegistration(project: Project, f: TenderRegistrationForm, opts: { activate?: boolean } = {}): Promise<Project> {
  const errors = registrationErrors(f);
  if (errors.length) throw new Error(errors.join(" "));
  const supabase = createClient();

  const { data: updated, error } = await supabase
    .from("projects")
    .update({
      project_name: f.project_name.trim(),
      client_id: f.client_id || null,
      consultant_id: f.consultant_id || null,
      duration: f.duration || null,
      description: f.description || null,
      location: f.location || null,
      category: f.category || null,
      building_type: f.building_type || null,
      contract_type: f.contract_type || null,
      currency: f.currency,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      project_manager_id: f.project_manager_id || null,
      ...(opts.activate ? { project_status: "active" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // The client's reference defaults to the project code. A reference used by another project is refused.
  const days = parseInt(f.tender_days) || 30;
  const tenderNo = (f.tender_reference.trim() || project.project_code).toUpperCase();
  const tenderPayload = {
    project_id: project.id,
    tender_no: tenderNo,
    title: f.project_name.trim(),
    description: f.description || null,
    tender_type: f.tender_type,
    budget_range: parseFloat(f.budget_range) || null,
    currency: f.currency,
    issue_date: f.issue_date || null,
    submission_deadline: fromLocalInput(f.submission_deadline),
    tender_days: days,
    procurement_method: f.procurement_method,
  };
  const [{ data: byProject }, { data: byNo }] = await Promise.all([
    supabase.from("tender_register").select("id, project_id").eq("project_id", project.id).maybeSingle(),
    supabase.from("tender_register").select("id, project_id").eq("tender_no", tenderNo).maybeSingle(),
  ]);
  if (byNo && byNo.project_id && byNo.project_id !== project.id && byNo.id !== byProject?.id) {
    throw new Error(`Tender reference ${tenderNo} is already used by another project.`);
  }
  const existingId = byProject?.id ?? byNo?.id;
  let tenderId: string;
  if (existingId) {
    // tender_register.status is the client's procurement status; it is not touched here.
    const { error: tErr } = await supabase.from("tender_register").update(tenderPayload).eq("id", existingId);
    if (tErr) throw new Error(tErr.message);
    tenderId = existingId;
  } else {
    const { data: created, error: tErr } = await supabase.from("tender_register").insert({ ...tenderPayload, status: "draft" }).select("id").single();
    if (tErr) throw new Error(tErr.message);
    tenderId = created.id;
  }

  // The lifecycle stage and award status belong to lib/qs/tender-lifecycle.ts and are never reset here.
  const { error: pcErr } = await supabase.from("project_precontract_details").upsert(
    {
      project_id: project.id,
      tender_register_id: tenderId,
      tender_type: f.tender_type,
      procurement_method: f.procurement_method,
      submission_deadline: fromLocalInput(f.submission_deadline),
      query_deadline: fromLocalInput(f.query_deadline),
      site_visit_date: f.site_visit_date || null,
      tender_days: days,
      bid_currency: f.currency,
    },
    { onConflict: "project_id" },
  );
  if (pcErr) throw new Error(pcErr.message);

  return updated as Project;
}
