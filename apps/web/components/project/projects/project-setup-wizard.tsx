"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/ui/location-picker";
import type { Project } from "@/components/project/projects/project-edit-sheet";
import { STEPS, formStateFromProject, formToPayload, type WizardFormState } from "@/components/project/projects/steps/step-panel";
import { PROJECT_SECTORS, buildingTypesForSector, sectorLabel } from "@/lib/project-categories";
import { useStakeholderSteps } from "@/components/project/projects/steps/use-stakeholder-steps";
import {
  getProjectCalendar, upsertProjectCalendar,
  getProjectWbsSetup, upsertProjectWbsSetup,
  getProjectNumberingRules, upsertProjectNumberingRules,
  getProjectApprovalFlows, upsertProjectApprovalFlows,
  getProjectBudgetSettings, upsertProjectBudgetSettings,
  getProjectNotificationRules, upsertProjectNotificationRules,
  getProjectActivationLog, activateProject,
  type ProjectCalendar,
  type ProjectApprovalFlow,
  type ProjectNotificationRule,
} from "@/lib/project-setup-service";
import { getProjectById, insertProjectsReturning, listProfilesOfIdAndFullName, updateProjectById, updateProjectByIdReturning, upsertProjectActivationLog } from "@/lib/project/projects/projects-queries";

const PROJECT_TYPES = [
  { value: "tender", label: "Tender" },
  { value: "awarded", label: "Awarded" },
  { value: "internal", label: "Internal" },
];

const CONTRACT_TYPES = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "unit_rate", label: "Unit Rate" },
  { value: "cost_plus", label: "Cost Plus" },
  { value: "design_build", label: "Design & Build" },
  { value: "turnkey", label: "Turnkey" },
  { value: "reimbursable", label: "Reimbursable" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const TIME_ZONES = [
  "Asia/Phnom_Penh",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "JPY", "EUR"];

interface StaffProfile {
  id: string;
  full_name: string;
  employee_id: string | null;
}

interface ProjectSetupWizardProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => void;
}

function calcMonths(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  if (e <= s) return "";
  const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return m > 0 ? `${m}` : "";
}

export function ProjectSetupWizard({ project, onClose, onSave }: ProjectSetupWizardProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [cvFocused, setCvFocused] = useState(false);

  const [form, setForm] = useState<WizardFormState>(() => formStateFromProject(project));

  const sh = useStakeholderSteps(project?.id ?? null);

  const contractDisplay = useMemo(() => {
    if (cvFocused || !form.contract_value) return form.contract_value;
    const num = parseFloat(form.contract_value);
    if (isNaN(num)) return form.contract_value;
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [form.contract_value, cvFocused]);

  const [durationManual, setDurationManual] = useState(() => {
    if (!project?.duration) return false;
    const auto = calcMonths(project.start_date ?? "", project.end_date ?? "");
    return auto !== "" && project.duration !== auto;
  });

  const durationMonths = useMemo(() => calcMonths(form.start_date, form.end_date), [form.start_date, form.end_date]);

  useEffect(() => {
    if (!durationManual) setForm((prev) => ({ ...prev, duration: durationMonths }));
  }, [durationMonths, durationManual]);

  const active = useMemo(() => STEPS.find((s) => s.id === activeStep), [activeStep]);
  const isEditing = !!project;
  const projectId = project?.id ?? null;

  // ── Step 5-11 form state ──────────────────────────────────────────────────
  const [calForm, setCalForm] = useState({ working_days: "Monday to Saturday", working_hours: "08:00 - 17:00", weekend_rule: "Sunday Off", holiday_calendar: "Cambodia National Calendar", shift_type: "Day Shift", exception_days: "" });
  const [wbsMethod, setWbsMethod] = useState("use_template");
  const [numForm, setNumForm] = useState({ format_mask: "PROJECT-DISC-DOC-BLDG-LEVEL-SEQ-REV", discipline_codes: "ARC, STR, MEP", document_types: "DWG, RFI, MRA, MOS", revision_format: "R00, R01, R02" });
  const [approvalFlows, setApprovalFlows] = useState<ProjectApprovalFlow[]>([]);
  const [budgetForm, setBudgetForm] = useState({ contingency: "5", cost_code_template: "Company Standard Cost Code", approval_limit_rule: "By Role and Amount" });
  const [notifRules, setNotifRules] = useState<ProjectNotificationRule[]>([]);
  const [activationLog, setActivationLog] = useState<{activated_at: string | null; checklist: Record<string, boolean>} | null>(null);
  const [setupLoaded, setSetupLoaded] = useState(false);

  // ── Load setup data when project is available ─────────────────────────────
  useEffect(() => {
    if (!projectId) { setSetupLoaded(true); return; }
    Promise.all([
      getProjectCalendar(projectId),
      getProjectWbsSetup(projectId),
      getProjectNumberingRules(projectId),
      getProjectApprovalFlows(projectId),
      getProjectBudgetSettings(projectId),
      getProjectNotificationRules(projectId),
      getProjectActivationLog(projectId),
    ]).then(([cal, wbs, num, flows, budget, notifs, act]) => {
      if (cal) setCalForm({ working_days: cal.working_days || "Monday to Saturday", working_hours: cal.working_hours || "08:00 - 17:00", weekend_rule: cal.weekend_rule || "Sunday Off", holiday_calendar: cal.holiday_calendar || "Cambodia National Calendar", shift_type: cal.shift_type || "Day Shift", exception_days: cal.exception_days || "" });
      if (wbs) setWbsMethod(wbs.setup_method);
      if (num) setNumForm({ format_mask: num.format_mask, discipline_codes: num.discipline_codes.join(", "), document_types: num.document_types.join(", "), revision_format: num.revision_format });
      if (flows) setApprovalFlows(flows);
      if (budget) setBudgetForm({ contingency: budget.contingency.toString(), cost_code_template: budget.cost_code_template || "Company Standard Cost Code", approval_limit_rule: budget.approval_limit_rule || "By Role and Amount" });
      if (notifs) setNotifRules(notifs);
      if (act) setActivationLog({ activated_at: act.activated_at ?? null, checklist: act.checklist });
      setSetupLoaded(true);
    });
  }, [projectId]);

  function update(field: keyof WizardFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const fv = (v: unknown): string => (v ?? "") as string;

  useEffect(() => {
    const s = createClient();
    listProfilesOfIdAndFullName("id, full_name, employee_id").then(({ data }) => {
      if (data) setStaff(data as StaffProfile[]);
    });
  }, []);

  const validationItems = useMemo(() => [
    { label: "Project code created", ok: !!form.project_code },
    { label: "Sector selected", ok: !!form.category },
    { label: "Client assigned", ok: !!form.client_id },
    { label: "Project manager assigned", ok: !!form.project_manager_id },
    { label: "Stakeholders assigned", ok: sh.selectedStakeholderIds.size > 0 },
    { label: "Team members added", ok: Object.values(sh.teamAssignments).some((m) => m.length > 0) },
    { label: "Calendar configured", ok: !!calForm.working_days },
    { label: "Document numbering rule configured", ok: !!numForm.format_mask },
    { label: "WBS setup selected", ok: !!wbsMethod },
  ], [form, sh.selectedStakeholderIds, sh.teamAssignments, calForm, numForm, wbsMethod]);


  async function handleSave() {
    setSaving(true);
    const payload = formToPayload(form);

    let projectId: string;
    if (isEditing) {
      const { error } = await updateProjectByIdReturning(payload, project.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Project updated");
      projectId = project.id;
    } else {
      const { data, error } = await insertProjectsReturning(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Project created");
      projectId = data.id;
    }

    await sh.saveStakeholderAssignments(projectId);

    // ── Save steps 5-10 setup data ────────────────────────────────────────────
    try {
      await upsertProjectCalendar({ project_id: projectId, ...calForm });
      await upsertProjectWbsSetup({ project_id: projectId, setup_method: wbsMethod });
      await upsertProjectNumberingRules({
        project_id: projectId,
        format_mask: numForm.format_mask,
        discipline_codes: numForm.discipline_codes.split(",").map(s => s.trim()).filter(Boolean),
        document_types: numForm.document_types.split(",").map(s => s.trim()).filter(Boolean),
        revision_format: numForm.revision_format,
      });
      await upsertProjectApprovalFlows(projectId, approvalFlows);
      await upsertProjectBudgetSettings({
        project_id: projectId,
        contingency: parseFloat(budgetForm.contingency) || 0,
        cost_code_template: budgetForm.cost_code_template,
        approval_limit_rule: budgetForm.approval_limit_rule,
      });
      await upsertProjectNotificationRules(projectId, notifRules);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save setup data");
    }

    setSaving(false);
    const { data: updated } = await getProjectById(projectId);
    if (updated) onSave(updated as Project);
    else onSave({ ...payload, id: projectId } as unknown as Project);
  }

  function renderStepContent() {
    switch (activeStep) {
      case 1: return renderBasicInfo();
      case 2: return renderContract();
      case 3: return renderStakeholders();
      case 4: return renderTeam();
      case 5: return renderCalendar();
      case 6: return renderWBS();
      case 7: return renderNumbering();
      case 8: return renderApproval();
      case 9: return renderBudget();
      case 10: return renderNotification();
      case 11: return renderActivate();
      default: return null;
    }
  }

  function renderBasicInfo() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wz_project_code">Project Code *</Label>
          <input id="wz_project_code" value={fv(form.project_code)} onChange={(e) => update("project_code", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_project_type">Project Type *</Label>
          <select id="wz_project_type" value={fv(form.project_type)} onChange={(e) => update("project_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {PROJECT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_short_name">Short Name</Label>
          <input id="wz_short_name" value={fv(form.short_name)} onChange={(e) => update("short_name", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_category">Sector *</Label>
          <select id="wz_category" value={fv(form.category)}
            onChange={(e) => { update("category", e.target.value); update("building_type", ""); }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">Select sector</option>
            {PROJECT_SECTORS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            {form.category && !PROJECT_SECTORS.some((s) => s.value === form.category) && (
              <option value={form.category}>{sectorLabel(form.category)}</option>
            )}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_building_type">Building Type</Label>
          <select id="wz_building_type" value={fv(form.building_type)} disabled={!form.category}
            onChange={(e) => update("building_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary disabled:opacity-50">
            <option value="">{form.category ? "Select building type" : "Select a sector first"}</option>
            {buildingTypesForSector(form.category).map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="wz_project_name">Project Name *</Label>
          <input id="wz_project_name" value={fv(form.project_name)} onChange={(e) => update("project_name", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="wz_location">Location</Label>
          <LocationPicker
            lat={form.latitude ? Number(form.latitude) : null}
            lng={form.longitude ? Number(form.longitude) : null}
            address={form.location}
            country="kh"
            onChange={(lat, lng, address) => {
              update("latitude", String(lat));
              update("longitude", String(lng));
              update("location", address);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_time_zone">Time Zone</Label>
          <select id="wz_time_zone" value={fv(form.time_zone)} onChange={(e) => update("time_zone", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {TIME_ZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
          </select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="wz_description">Description</Label>
          <textarea id="wz_description" value={fv(form.description)} onChange={(e) => update("description", e.target.value)} rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary resize-none" />
        </div>
      </div>
    );
  }

  function renderContract() {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="wz_client_id">Client</Label>
          <select id="wz_client_id" value={fv(form.client_id)} onChange={(e) => update("client_id", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">— Select Client —</option>
            {sh.stakeholders.map((c) => (<option key={c.id} value={c.id}>{c.organization_name}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_contract_number">Contract Number</Label>
          <input id="wz_contract_number" value={fv(form.contract_number)} onChange={(e) => update("contract_number", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_contract_type">Contract Type</Label>
          <select id="wz_contract_type" value={fv(form.contract_type)} onChange={(e) => update("contract_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">—</option>
            {CONTRACT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_currency">Currency</Label>
          <select id="wz_currency" value={fv(form.currency)} onChange={(e) => update("currency", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_contract_value">Contract Value ($)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">$</span>
            <input id="wz_contract_value" type="text" inputMode="decimal" value={contractDisplay}
              onFocus={() => setCvFocused(true)} onBlur={() => setCvFocused(false)}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, "");
                if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) update("contract_value", raw);
              }}
              className="w-full rounded-xl border border-border bg-background pl-7 pr-3 py-2.5 text-sm outline-hidden focus:border-primary" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_start_date">Start Date</Label>
          <input id="wz_start_date" type="date" value={fv(form.start_date)} onChange={(e) => update("start_date", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_end_date">Finish Date</Label>
          <input id="wz_end_date" type="date" value={fv(form.end_date)} onChange={(e) => update("end_date", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label>Duration (Months)</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={durationManual}
                onChange={(e) => setDurationManual(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground" />
              Manual
            </label>
          </div>
          {durationManual ? (
            <input type="number" min="0" value={fv(form.duration)} onChange={(e) => update("duration", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
          ) : (
            <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              {durationMonths || "—"}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_dlp_period">DLP Period (Months)</Label>
          <input id="wz_dlp_period" value={fv(form.dlp_period)} onChange={(e) => update("dlp_period", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_retention">Retention (%)</Label>
          <input id="wz_retention" type="number" step="0.01" value={fv(form.retention)} onChange={(e) => update("retention", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_advance_payment">Advance Payment (%)</Label>
          <input id="wz_advance_payment" type="number" step="0.01" value={fv(form.advance_payment)} onChange={(e) => update("advance_payment", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_project_manager">Project Manager</Label>
          <select id="wz_project_manager" value={fv(form.project_manager_id)} onChange={(e) => update("project_manager_id", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">— Select —</option>
            {staff.map((s) => (<option key={s.id} value={s.id}>{s.full_name}{s.employee_id ? ` (${s.employee_id})` : ""}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_project_status">Status</Label>
          <select id="wz_project_status" value={fv(form.project_status)} onChange={(e) => update("project_status", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
        </div>
      </div>
    );
  }

  function renderStakeholders() {
    const selectedTemplate = sh.useTemplate && sh.selectedTemplateId
      ? sh.templates.find((t) => t.id === sh.selectedTemplateId) ?? null
      : null;

    return (
      <div className="space-y-4">
        {/* Template mode toggle */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Select the stakeholders involved in this project.</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sh.useTemplate}
              onChange={(e) => sh.setUseTemplate(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-foreground"
            />
            Use template
          </label>
        </div>

        {sh.useTemplate ? (
          <div className="space-y-3">
            {/* Template selector */}
            <div className="space-y-1.5">
              <Label>Stakeholder Template</Label>
              <select
                value={sh.selectedTemplateId ?? ""}
                onChange={(e) => sh.setSelectedTemplateId(e.target.value || null)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— Select template —</option>
                {sh.templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </div>

            {/* Placeholder slots */}
            {selectedTemplate && (
              <div className="space-y-2">
                {[...selectedTemplate.template_placeholders]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((placeholder) => {
                    const assignedId = sh.placeholderMappings[placeholder.id] ?? "";
                    return (
                      <div key={placeholder.id} className="rounded-2xl border bg-white p-4">
                        <p className="font-medium text-sm">{placeholder.label}</p>
                        {placeholder.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{placeholder.description}</p>
                        )}
                        <select
                          value={assignedId}
                          onChange={(e) => sh.handleMapPlaceholder(placeholder.id, e.target.value)}
                          className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden focus:border-primary"
                        >
                          <option value="">— Assign stakeholder —</option>
                          {sh.stakeholders.map((s) => (
                            <option key={s.id} value={s.id}>{s.organization_name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          /* Manual checkbox list */
          sh.stakeholders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No stakeholders found. Create them in the Stakeholders module first.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {sh.stakeholders.map((s) => {
                const checked = sh.selectedStakeholderIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition ${
                      checked ? "bg-foreground text-background border-foreground" : "bg-white hover:border-foreground/50"
                    }`}
                  >
                    <input type="checkbox" checked={checked}
                      onChange={() => sh.handleToggleStakeholder(s.id)}
                      className="h-4 w-4 rounded border-border accent-background" />
                    <div>
                      <p className="font-medium text-sm">{s.organization_name}</p>
                      <p className={`text-xs ${checked ? "text-background/70" : "text-muted-foreground"}`}>
                        {s.stakeholder_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )
        )}
      </div>
    );
  }

  function renderTeam() {
    if (sh.selectedStakeholderIds.size === 0) {
      return <p className="text-sm text-muted-foreground text-center py-8">Select stakeholders first in Step 3.</p>;
    }
    return (
      <div className="space-y-4">
        {Array.from(sh.selectedStakeholderIds).map((sid) => {
          const stakeholder = sh.stakeholders.find((s) => s.id === sid);
          const staffList = sh.stakeholderStaff[sid] ?? [];
          const members = sh.teamAssignments[sid] ?? [];
          return (
            <div key={sid} className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{stakeholder?.organization_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{stakeholder?.stakeholder_type ?? "—"}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg"
                  onClick={() => sh.setAddingStakeholderKey(sh.addingStakeholderKey === sid ? null : sid)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Member
                </Button>
              </div>
              {sh.addingStakeholderKey === sid && (
                <div className="flex items-center gap-2 mb-3">
                  <select value={sh.addMemberStaffId} onChange={(e) => sh.setAddMemberStaffId(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden">
                    <option value="">Select staff...</option>
                    {staffList.map((ps) => (<option key={ps.id} value={ps.id}>{ps.full_name}</option>))}
                  </select>
                  <select value={sh.addMemberRole} onChange={(e) => sh.setAddMemberRole(e.target.value)}
                    className="w-36 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden">
                    <option value="">Role...</option>
                    {sh.roles.map((r) => (<option key={r.code} value={r.code}>{r.name}</option>))}
                  </select>
                  <Button size="sm" className="h-7 text-xs rounded-lg" onClick={() => sh.handleAddTeamMember(sid)}>Add</Button>
                </div>
              )}
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team members assigned.</p>
              ) : (
                <div className="space-y-1">
                  {members.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                      <span className="font-medium">{m.staffName}</span>
                      <span className="text-muted-foreground">{m.roleOnProject || "—"}</span>
                      <button type="button" onClick={() => sh.handleRemoveTeamMember(sid, i)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderCalendar() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wz_working_days">Working Days</Label>
          <select id="wz_working_days" value={calForm.working_days} onChange={e => setCalForm({...calForm, working_days: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>Monday to Saturday</option>
            <option>Monday to Friday</option>
            <option>Sunday to Thursday</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_working_hours">Working Hours</Label>
          <input id="wz_working_hours" value={calForm.working_hours} onChange={e => setCalForm({...calForm, working_hours: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_weekend">Weekend Rule</Label>
          <select id="wz_weekend" value={calForm.weekend_rule} onChange={e => setCalForm({...calForm, weekend_rule: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>Sunday Off</option>
            <option>Saturday & Sunday Off</option>
            <option>Friday Off</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_holiday">Holiday Calendar</Label>
          <select id="wz_holiday" value={calForm.holiday_calendar} onChange={e => setCalForm({...calForm, holiday_calendar: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>Cambodia National Calendar</option>
            <option>International Calendar</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_shift">Shift Type</Label>
          <select id="wz_shift" value={calForm.shift_type} onChange={e => setCalForm({...calForm, shift_type: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>Day Shift</option>
            <option>Night Shift</option>
            <option>Rotating Shift</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wz_exception">Exception Days</Label>
          <input id="wz_exception" value={calForm.exception_days} onChange={e => setCalForm({...calForm, exception_days: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
      </div>
    );
  }

  function renderWBS() {
    const wbsOptions = [
      { value: "use_template", label: "Use Company WBS Template", desc: "Project → Building → Level → Zone → Room → Element" },
      { value: "create_manually", label: "Create WBS Manually", desc: "Define WBS structure from scratch" },
      { value: "import_excel", label: "Import WBS from Excel", desc: "Upload WBS via spreadsheet" },
      { value: "clone_project", label: "Clone from Existing Project", desc: "Copy WBS from another project" },
    ];
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {wbsOptions.map((opt) => (
          <div key={opt.value} onClick={() => setWbsMethod(opt.value)}
            className={`rounded-2xl border p-5 cursor-pointer transition ${wbsMethod === opt.value ? "bg-foreground text-background border-foreground" : "bg-background hover:border-foreground/50"}`}>
            <p className="font-semibold">{opt.label}</p>
            <p className={`mt-1 text-sm ${wbsMethod === opt.value ? "text-background/70" : "text-muted-foreground"}`}>{opt.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderNumbering() {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-muted/50 p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Document Number Format</p>
          <p className="mt-2 font-mono text-lg text-foreground">{numForm.format_mask}</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">Example: {form.project_code || "PROJ"}-STR-DWG-B01-L05-001-R02</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Format Mask</Label>
            <input value={numForm.format_mask} onChange={e => setNumForm({...numForm, format_mask: e.target.value})}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary" />
          </div>
          <div className="space-y-1.5">
            <Label>Revision Format</Label>
            <select value={numForm.revision_format} onChange={e => setNumForm({...numForm, revision_format: e.target.value})}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
              <option>R00, R01, R02</option>
              <option>Rev 0, Rev 1</option>
              <option>A, B, C</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Discipline Codes (comma-separated)</Label>
            <input value={numForm.discipline_codes} onChange={e => setNumForm({...numForm, discipline_codes: e.target.value})}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" placeholder="ARC, STR, MEP" />
          </div>
          <div className="space-y-1.5">
            <Label>Document Types (comma-separated)</Label>
            <input value={numForm.document_types} onChange={e => setNumForm({...numForm, document_types: e.target.value})}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" placeholder="DWG, RFI, MRA, MOS" />
          </div>
        </div>
      </div>
    );
  }

  function renderApproval() {
    const flowTypes = [
      { value: "drawing_approval", label: "Drawing Approval" },
      { value: "rfi_response", label: "RFI Response" },
      { value: "material_approval", label: "Material Approval" },
      { value: "method_statement", label: "Method Statement" },
      { value: "pr_po_approval", label: "PR / PO Approval" },
      { value: "inspection_request", label: "Inspection Request" },
      { value: "ncr_closeout", label: "NCR Closeout" },
    ];
    return (
      <div className="space-y-3">
        {flowTypes.map((ft) => {
          const existing = approvalFlows.find(f => f.flow_type === ft.value);
          return (
            <div key={ft.value} className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{ft.label}</p>
                {existing ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              </div>
              <div className="flex items-center gap-2">
                <input
                  placeholder="Engineer → Discipline Lead → PM → Consultant"
                  value={existing?.role_chain?.join(" → ") ?? ""}
                  onChange={e => {
                    const chain = e.target.value.split(" → ").map(s => s.trim()).filter(Boolean);
                    setApprovalFlows(prev => {
                      const filtered = prev.filter(f => f.flow_type !== ft.value);
                      if (chain.length > 0) {
                        return [...filtered, { project_id: projectId!, flow_type: ft.value, role_chain: chain }];
                      }
                      return filtered;
                    });
                  }}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderBudget() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Main Contract Value</Label>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm">${Number(form.contract_value || 0).toLocaleString()}</div>
        </div>
        <div className="space-y-1.5">
          <Label>Contingency (%)</Label>
          <input type="number" value={budgetForm.contingency} onChange={e => setBudgetForm({...budgetForm, contingency: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label>Cost Code Template</Label>
          <select value={budgetForm.cost_code_template} onChange={e => setBudgetForm({...budgetForm, cost_code_template: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>Company Standard Cost Code</option>
            <option>Project Specific</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Approval Limit Rule</Label>
          <select value={budgetForm.approval_limit_rule} onChange={e => setBudgetForm({...budgetForm, approval_limit_rule: e.target.value})}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option>By Role and Amount</option>
            <option>By Role Only</option>
          </select>
        </div>
      </div>
    );
  }

  function renderNotification() {
    const ruleDefs = [
      { value: "task_assigned", label: "Task Assigned" },
      { value: "task_overdue", label: "Task Overdue" },
      { value: "document_submitted", label: "Document Submitted" },
      { value: "rfi_overdue", label: "RFI Overdue" },
      { value: "pr_approval", label: "PR Approval Required" },
      { value: "ncr_created", label: "NCR Created" },
      { value: "safety_incident", label: "Safety Incident" },
      { value: "payment_approval", label: "Payment Approval" },
    ];
    function toggleRule(value: string) {
      setNotifRules(prev => {
        const idx = prev.findIndex(r => r.rule_type === value);
        if (idx >= 0) return prev.filter((_, i) => i !== idx);
        return [...prev, { project_id: projectId!, rule_type: value, channel: "in_app", enabled: true }];
      });
    }
    function updateChannel(value: string, channel: string) {
      setNotifRules(prev => prev.map(r => r.rule_type === value ? { ...r, channel } : r));
    }
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {ruleDefs.map((rd) => {
          const existing = notifRules.find(r => r.rule_type === rd.value);
          return (
            <div key={rd.value}
              className={`rounded-2xl border p-4 cursor-pointer transition ${existing ? "bg-foreground text-background border-foreground" : "bg-white hover:border-foreground/50"}`}
              onClick={() => toggleRule(rd.value)}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{rd.label}</span>
                {existing ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
              </div>
              {existing && (
                <select value={existing.channel} onClick={e => e.stopPropagation()} onChange={e => updateChannel(rd.value, e.target.value)}
                  className="mt-2 w-full rounded-lg border border-foreground/20 bg-background px-2 py-1 text-xs text-foreground outline-hidden">
                  <option value="in_app">In-App</option>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="all">All Channels</option>
                </select>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderActivate() {
    const allOk = validationItems.every((i) => i.ok);
    async function handleActivate() {
      setActivating(true);
      try {
        await upsertProjectActivationLog({
          project_id: projectId,
          activated_at: new Date().toISOString(),
          steps_completed: JSON.stringify([
            "project_details", "calendar", "wbs", "numbering",
            "approval_flows", "budget", "notification_rules"
          ]),
          status: "active",
        });
        await updateProjectById({ status: "active" }, projectId);
        toast.success("Project activated successfully");
      } catch { toast.error("Failed to activate project"); }
      finally { setActivating(false); }
    }
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border bg-muted/30 p-5">
          <p className="font-semibold">Activation Checklist</p>
          <p className="text-sm text-muted-foreground mt-1">Project can only be activated when required setup items are complete.</p>
        </div>
        <div className="space-y-2">
          {validationItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-2xl border bg-white p-4">
              <span className="text-sm font-medium">{item.label}</span>
              {item.ok
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : <AlertTriangle className="h-5 w-5 text-amber-600" />}
            </div>
          ))}
        </div>
        <Button className="w-full rounded-2xl" disabled={!allOk || activating} onClick={handleActivate}>
          {activating ? "Activating..." : "Activate Project"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Project Setup Wizard</h2>
          <p className="text-sm text-muted-foreground">
            {isEditing ? `Editing: ${project.project_code} — ` : "New Project — "}
            Step {activeStep} of {STEPS.length}: {active?.title}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Stepper */}
          <div className="overflow-x-auto border-b px-6 py-3">
            <div className="flex min-w-max gap-2">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = step.id === activeStep;
                const isDone = step.id < activeStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-foreground text-background border-foreground"
                        : isDone
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {step.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div>
              <div className="mb-5 flex items-center gap-3">
                {active && <active.icon className="h-6 w-6 text-foreground" />}
                <div>
                  <h3 className="text-xl font-semibold">{active?.title}</h3>
                  <p className="text-sm text-muted-foreground">Configure project setup data before activation.</p>
                </div>
              </div>
              <div key={activeStep} className="rounded-3xl border bg-white p-6">
                {renderStepContent()}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-6 py-4">
            <Button variant="outline" onClick={() => setActiveStep(Math.max(1, activeStep - 1))} disabled={activeStep === 1} className="rounded-xl">
              <ChevronLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSave} disabled={saving} className="rounded-xl">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save & Exit
              </Button>
              <Button onClick={() => setActiveStep(Math.min(STEPS.length, activeStep + 1))} disabled={activeStep === STEPS.length} className="rounded-xl">
                Next <ChevronRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
