"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import {
  registrationErrors,
  registrationFormFrom,
  saveTenderRegistration,
  type TenderRegistrationForm,
} from "@/lib/project/projects/tender-registration";
import { ClientField, Field, SectorFields, StaffSelect, inputClass, useStaff } from "@/components/project/projects/fields/project-fields";
import type { PrecontractCtx } from "./shared";

const TENDER_TYPES = [
  { value: "open", label: "Open" },
  { value: "selective", label: "Selective" },
  { value: "negotiated", label: "Negotiated" },
  { value: "restricted", label: "Restricted" },
];
const PROCUREMENT_METHODS = [
  { value: "public_bid", label: "Public Bid" },
  { value: "limited_bid", label: "Limited Bid" },
  { value: "direct_negotiation", label: "Direct Negotiation" },
  { value: "framework", label: "Framework" },
];
const CONTRACT_TYPES = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "unit_rate", label: "Unit Rate" },
  { value: "cost_plus", label: "Cost Plus" },
  { value: "design_build", label: "Design & Build" },
  { value: "turnkey", label: "Turnkey" },
  { value: "reimbursable", label: "Reimbursable" },
];
const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "JPY", "EUR"];

interface RegistrationEditorProps {
  ctx: PrecontractCtx;
  onDone: () => void;
}

// Edits the registration in place (replaces the pre-contract Edit wizard). Saves the project,
// its tender register entry and its pre-contract details together.
export function RegistrationEditor({ ctx, onDone }: RegistrationEditorProps) {
  const staff = useStaff();
  const [form, setForm] = useState<TenderRegistrationForm>(() =>
    registrationFormFrom({ project: ctx.project, details: ctx.details, tender: ctx.tender }),
  );
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const set = (patch: Partial<TenderRegistrationForm>) => setForm((f) => ({ ...f, ...patch }));
  const errors = registrationErrors(form);

  async function save() {
    if (errors.length) { setShowErrors(true); return; }
    setSaving(true);
    try {
      const updated: Project = await saveTenderRegistration(ctx.project, form);
      ctx.onProjectUpdate(updated);
      await ctx.refresh();
      toast.success("Registration saved");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not saved");
    } finally {
      setSaving(false);
    }
  }

  const input = (key: keyof TenderRegistrationForm, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={`reg_${key}`} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} className={inputClass} {...props} />
  );
  const select = (key: keyof TenderRegistrationForm, options: { value: string; label: string }[], blank?: string) => (
    <select id={`reg_${key}`} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} className={inputClass}>
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      {showErrors && errors.length > 0 && (
        <ul className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opportunity</legend>
        <Field label="Project name *" htmlFor="reg_project_name" className="md:col-span-2">{input("project_name")}</Field>
        <SectorFields idPrefix="reg" category={form.category} buildingType={form.building_type} onChange={(n) => set({ category: n.category, building_type: n.buildingType })} />
        <Field label="Client *" htmlFor="reg_client"><ClientField id="reg_client" value={form.client_id} onChange={(id) => set({ client_id: id })} /></Field>
        <Field label="Consultant" htmlFor="reg_consultant"><ClientField id="reg_consultant" role="consultant" value={form.consultant_id} onChange={(id) => set({ consultant_id: id })} /></Field>
        <Field label="Location" htmlFor="reg_location">{input("location", { placeholder: "e.g. Phnom Penh" })}</Field>
        <Field label="Tender reference" htmlFor="reg_tender_reference" hint="The client's reference. Left empty, it is the project code.">
          {input("tender_reference", { placeholder: ctx.project.project_code })}
        </Field>
        <Field label="Tender type" htmlFor="reg_tender_type">{select("tender_type", TENDER_TYPES)}</Field>
        <Field label="Procurement method" htmlFor="reg_procurement_method">{select("procurement_method", PROCUREMENT_METHODS)}</Field>
        <Field label="Contract type" htmlFor="reg_contract_type">{select("contract_type", CONTRACT_TYPES, "—")}</Field>
        <Field label="Currency" htmlFor="reg_currency">{select("currency", CURRENCIES.map((c) => ({ value: c, label: c })))}</Field>
        <Field label="Client budget" htmlFor="reg_budget_range" hint="If disclosed. Our estimate comes from Cost Estimation.">
          {input("budget_range", { type: "number", inputMode: "decimal" })}
        </Field>
        <Field label="Description" htmlFor="reg_description" className="md:col-span-2">
          <textarea id="reg_description" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={cn(inputClass, "resize-none")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 border-t pt-5 md:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</legend>
        <Field label="Invitation date" htmlFor="reg_issue_date">{input("issue_date", { type: "date" })}</Field>
        <Field label="Site visit" htmlFor="reg_site_visit_date">{input("site_visit_date", { type: "date" })}</Field>
        <Field label="Query deadline" htmlFor="reg_query_deadline">{input("query_deadline", { type: "datetime-local" })}</Field>
        <Field label="Submission deadline *" htmlFor="reg_submission_deadline">{input("submission_deadline", { type: "datetime-local" })}</Field>
        <Field label="Tender days" htmlFor="reg_tender_days">{input("tender_days", { type: "number", min: 1 })}</Field>
        <Field label="Estimated construction duration (months)" htmlFor="reg_duration">{input("duration", { type: "number", min: 0 })}</Field>
        <Field label="Planned start date" htmlFor="reg_start_date">{input("start_date", { type: "date" })}</Field>
        <Field label="Planned end date" htmlFor="reg_end_date">{input("end_date", { type: "date" })}</Field>
      </fieldset>

      <fieldset className="grid gap-4 border-t pt-5 md:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team</legend>
        <Field label="Tender manager / person in charge *" htmlFor="reg_pm" hint="Workstream owners are assigned in Tender Management after the Go decision.">
          <StaffSelect id="reg_pm" value={form.project_manager_id} onChange={(id) => set({ project_manager_id: id })} staff={staff} />
        </Field>
      </fieldset>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save registration
        </Button>
      </div>
    </div>
  );
}
