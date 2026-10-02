"use client";

import { useEffect, useState, useMemo } from "react";
import { getProjectById, getProjectPrecontractDetailByProjectId, getTenderRegisterById, getTenderRegisterByProjectId, getTenderRegisterByTenderNo, insertProjectsReturning, insertTenderRegisterReturning, insertTenderRiskItems, listProfilesOfIdAndFullName, listStakeholdersWithStatusActive, updateProjectById, updateTenderRegisterById, upsertProjectPrecontractDetails } from "@/lib/project/projects/projects-queries";
import { X, Loader2, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Project } from "@/components/project/projects/project-edit-sheet";
import { PROJECT_SECTORS, buildingTypesForSector, sectorLabel } from "@/lib/project-categories";

interface PrecontractWizardProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => void;
}

const STEPS = [
  { id: 1, title: "Opportunity", icon: "📋" },
  { id: 2, title: "Schedule & Terms", icon: "📅" },
  { id: 3, title: "Team", icon: "👥" },
  { id: 4, title: "Cost Preparation", icon: "💰" },
  { id: 5, title: "Risk Register", icon: "⚠" },
  { id: 6, title: "Review & Activate", icon: "✅" },
] as const;

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

// <input type="datetime-local"> works in local time without a zone; timestamptz columns need an
// absolute instant. Convert both ways so a 17:00 deadline stays 17:00 for the user.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const fromLocalInput = (local: string) => (local ? new Date(local).toISOString() : null);

const CURRENCIES =["USD", "KHR", "THB", "VND", "SGD", "MYR", "JPY", "EUR"];

const RISK_CATEGORIES = [
  "technical", "commercial", "schedule", "geotechnical", "market", "regulatory", "environmental", "other",
];

const LIKELIHOOD_OPTIONS = ["very_low", "low", "medium", "high", "very_high"];
const IMPACT_OPTIONS = ["very_low", "low", "medium", "high", "very_high"];

interface StaffProfile {
  id: string;
  full_name: string;
}

interface Stakeholder {
  id: string;
  organization_name: string;
  stakeholder_type: string;
}

interface RiskItem {
  title: string;
  description: string;
  category: string;
  likelihood: string;
  impact: string;
  mitigation: string;
}

interface PrecontractForm {
  // Step 1: Opportunity
  project_code: string;
  project_name: string;
  description: string;
  location: string;
  category: string;
  building_type: string;
  client_id: string;
  consultant_id: string;
  tender_reference: string;
  tender_type: string;
  procurement_method: string;
  contract_type: string;
  budget_range: string;
  currency: string;
  estimated_value: string;
  // Step 2: Schedule
  issue_date: string;
  site_visit_date: string;
  query_deadline: string;
  submission_deadline: string;
  tender_days: string;
  duration: string;
  start_date: string;
  end_date: string;
  // Step 3: Team
  project_manager_id: string;
  // Step 6: Activate
  project_status: string;
}

export function PrecontractWizard({ project, onClose, onSave }: PrecontractWizardProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clients, setClients] = useState<Stakeholder[]>([]);
  const isEditing = !!project;

  const [form, setForm] = useState<PrecontractForm>(() => ({
    project_code: project?.project_code ?? "",
    project_name: project?.project_name ?? "",
    description: project?.description ?? "",
    location: project?.location ?? "",
    category: project?.category ?? "",
    building_type: project?.building_type ?? "",
    client_id: project?.client_id ?? "",
    consultant_id: project?.consultant_id ?? "",
    tender_reference: "",
    tender_type: "selective",
    procurement_method: "limited_bid",
    contract_type: project?.contract_type ?? "",
    budget_range: "",
    currency: project?.currency ?? "USD",
    estimated_value: "",
    issue_date: "",
    site_visit_date: "",
    query_deadline: "",
    submission_deadline: "",
    tender_days: "30",
    duration: project?.duration ?? "",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    project_manager_id: project?.project_manager_id ?? "",
    project_status: "draft",
  }));

  const [risks, setRisks] = useState<RiskItem[]>([
    { title: "", description: "", category: "technical", likelihood: "medium", impact: "medium", mitigation: "" },
  ]);

  const active = STEPS.find((s) => s.id === activeStep);

  useEffect(() => {
    listProfilesOfIdAndFullName("id, full_name").then(({ data }) => {
      if (data) setStaff(data as StaffProfile[]);
    });
    listStakeholdersWithStatusActive()
      .then(({ data }) => {
        if (data) setClients(data as Stakeholder[]);
      });
  }, []);

  // Load existing precontract details (and the linked tender record) when editing
  const editingProjectId = project?.id;
  useEffect(() => {
    if (!editingProjectId) return;
    async function load() {
      const { data } = await getProjectPrecontractDetailByProjectId(editingProjectId!, "*");
      if (!data) return;
      const { data: tender } = data.tender_register_id
        ? await getTenderRegisterById(data.tender_register_id, "tender_no, issue_date, budget_range")
        : { data: null };
      setForm((prev) => ({
        ...prev,
        tender_type: data.tender_type ?? prev.tender_type,
        procurement_method: data.procurement_method ?? prev.procurement_method,
        estimated_value: data.estimated_value != null ? String(data.estimated_value) : prev.estimated_value,
        submission_deadline: data.submission_deadline ? toLocalInput(data.submission_deadline) : prev.submission_deadline,
        query_deadline: data.query_deadline ? toLocalInput(data.query_deadline) : prev.query_deadline,
        site_visit_date: data.site_visit_date ?? prev.site_visit_date,
        tender_days: data.tender_days != null ? String(data.tender_days) : prev.tender_days,
        tender_reference: tender?.tender_no ?? prev.tender_reference,
        issue_date: tender?.issue_date ?? prev.issue_date,
        budget_range: tender?.budget_range != null ? String(tender.budget_range) : prev.budget_range,
      }));
    }
    void load();
  }, [editingProjectId]);

  function update(field: keyof PrecontractForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const validationItems = useMemo(() => [
    { label: "Project code", ok: !!form.project_code },
    { label: "Project name", ok: !!form.project_name },
    { label: "Sector selected", ok: !!form.category },
    { label: "Client assigned", ok: !!form.client_id },
    { label: "Submission deadline set", ok: !!form.submission_deadline },
    { label: "Person in charge assigned", ok: !!form.project_manager_id },
  ], [form]);

  const allOk = validationItems.every((v) => v.ok);

  async function handleSave() {
    setSaving(true);

    // 1. Create/update project
    const projectPayload = {
      project_code: form.project_code.toUpperCase(),
      project_name: form.project_name,
      project_type: "tender",
      client_id: form.client_id || null,
      consultant_id: form.consultant_id || null,
      duration: form.duration || null,
      description: form.description || null,
      location: form.location || null,
      category: form.category || null,
      building_type: form.building_type || null,
      contract_type: form.contract_type || null,
      currency: form.currency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      project_status: form.project_status,
      project_manager_id: form.project_manager_id || null,
    };

    let projectId: string;
    if (isEditing) {
      const { error } = await updateProjectById(projectPayload, project.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      projectId = project.id;
    } else {
      const { data, error } = await insertProjectsReturning(projectPayload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      projectId = data.id;
    }

    // 2. Create/update tender_register. The client's tender reference defaults to the project code.
    const days = parseInt(form.tender_days) || 30;
    const tenderPayload = {
      project_id: projectId,
      tender_no: (form.tender_reference.trim() || form.project_code).toUpperCase(),
      title: form.project_name,
      description: form.description || null,
      tender_type: form.tender_type,
      budget_range: parseFloat(form.budget_range) || null,
      currency: form.currency,
      issue_date: form.issue_date || null,
      submission_deadline: fromLocalInput(form.submission_deadline),
      tender_days: days,
      procurement_method: form.procurement_method,
      estimated_value: parseFloat(form.estimated_value) || null,
    };

    // Reuse this project's tender; a tender_no match is only reused when no other project owns it.
    const { data: existingByProject } = await getTenderRegisterByProjectId(projectId);

    const { data: existingByNo } = await getTenderRegisterByTenderNo(tenderPayload.tender_no);

    if (existingByNo && existingByNo.project_id && existingByNo.project_id !== projectId && existingByNo.id !== existingByProject?.id) {
      toast.error(`Tender reference ${tenderPayload.tender_no} is already used by another project.`);
      setSaving(false);
      return;
    }
    const existingId = existingByProject?.id ?? existingByNo?.id;

    let tenderId: string;
    if (existingId) {
      // Status is not touched here: tender_register.status is the client-side procurement status.
      const { error: tenderErr } = await updateTenderRegisterById(tenderPayload, existingId);
      if (tenderErr) { toast.error(tenderErr.message); setSaving(false); return; }
      tenderId = existingId;
    } else {
      const { data: newTender, error: tenderErr } = await insertTenderRegisterReturning({ ...tenderPayload, status: "draft" });
      if (tenderErr) { toast.error(tenderErr.message); setSaving(false); return; }
      tenderId = newTender.id;
    }

    // 3. Create/update precontract details. The lifecycle stage and award status are owned by
    // lib/qs/tender-lifecycle.ts, so an edit here never resets them (new rows start at 'opportunity').
    const precontractPayload = {
      project_id: projectId,
      tender_register_id: tenderId,
      tender_type: form.tender_type,
      procurement_method: form.procurement_method,
      submission_deadline: fromLocalInput(form.submission_deadline),
      query_deadline: fromLocalInput(form.query_deadline),
      site_visit_date: form.site_visit_date || null,
      tender_days: days,
      estimated_value: parseFloat(form.estimated_value) || null,
      bid_currency: form.currency,
    };

    const { error: pcErr } = await upsertProjectPrecontractDetails(precontractPayload);
    if (pcErr) { toast.error(pcErr.message); setSaving(false); return; }

    // 4. Initial risks, on creation only (afterwards they are managed in Risk & Opportunity).
    const validRisks = risks.filter((r) => r.title.trim());
    if (!isEditing && validRisks.length > 0) {
      const riskPayload = validRisks.map((r, i) => ({
        tender_id: tenderId,
        risk_no: `R-${String(i + 1).padStart(3, "0")}`,
        description: r.description.trim() ? `${r.title.trim()} — ${r.description.trim()}` : r.title.trim(),
        category: r.category,
        likelihood: r.likelihood,
        impact: r.impact,
        mitigation: r.mitigation || null,
      }));
      const { error: riskErr } = await insertTenderRiskItems(riskPayload);
      if (riskErr) toast.error(`Project saved, but the initial risks were not: ${riskErr.message}`);
    }

    toast.success(isEditing ? "Pre-contract project updated" : "Pre-contract project created");
    setSaving(false);

    const { data: updated } = await getProjectById(projectId);
    if (updated) onSave(updated as Project);
    else onSave({ ...projectPayload, id: projectId } as unknown as Project);
  }

  async function handleActivate() {
    setActivating(true);
    await updateProjectById({ project_status: "active" }, project?.id ?? "");
    toast.success("Pre-contract project activated");
    setActivating(false);
    if (project) onSave({ ...project, project_status: "active" });
  }

  function addRisk() {
    setRisks((prev) => [...prev, { title: "", description: "", category: "technical", likelihood: "medium", impact: "medium", mitigation: "" }]);
  }

  function updateRisk(index: number, field: keyof RiskItem, value: string) {
    setRisks((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removeRisk(index: number) {
    setRisks((prev) => prev.filter((_, i) => i !== index));
  }

  function renderStepContent() {
    switch (activeStep) {
      case 1: return renderOpportunity();
      case 2: return renderSchedule();
      case 3: return renderTeam();
      case 4: return renderCostPrep();
      case 5: return renderRisks();
      case 6: return renderActivate();
      default: return null;
    }
  }

  function renderOpportunity() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Project Code *</Label>
          <input value={form.project_code} onChange={(e) => update("project_code", e.target.value)} placeholder="e.g. PRJ-001"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Sector *</Label>
          <select value={form.category}
            onChange={(e) => { update("category", e.target.value); update("building_type", ""); }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Select sector</option>
            {PROJECT_SECTORS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            {form.category && !PROJECT_SECTORS.some((s) => s.value === form.category) && (
              <option value={form.category}>{sectorLabel(form.category)}</option>
            )}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Building Type</Label>
          <select value={form.building_type} disabled={!form.category}
            onChange={(e) => update("building_type", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50">
            <option value="">{form.category ? "Select building type" : "Select a sector first"}</option>
            {buildingTypesForSector(form.category).map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs font-medium">Project Name *</Label>
          <input value={form.project_name} onChange={(e) => update("project_name", e.target.value)} placeholder="e.g. ABC Tower Construction"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs font-medium">Description</Label>
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Location</Label>
          <input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Phnom Penh"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Client *</Label>
          <select value={form.client_id} onChange={(e) => update("client_id", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.organization_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Consultant</Label>
          <select value={form.consultant_id} onChange={(e) => update("consultant_id", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">— Select consultant —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.organization_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Tender Reference</Label>
          <input value={form.tender_reference} onChange={(e) => update("tender_reference", e.target.value)}
            placeholder={form.project_code ? `Defaults to ${form.project_code.toUpperCase()}` : "Client's tender reference"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Tender Type</Label>
          <select value={form.tender_type} onChange={(e) => update("tender_type", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {TENDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Procurement Method</Label>
          <select value={form.procurement_method} onChange={(e) => update("procurement_method", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {PROCUREMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Contract Type</Label>
          <select value={form.contract_type} onChange={(e) => update("contract_type", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">— Select contract type —</option>
            {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Budget Range</Label>
          <input type="number" value={form.budget_range} onChange={(e) => update("budget_range", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Currency</Label>
          <select value={form.currency} onChange={(e) => update("currency", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs font-medium">Estimated Value</Label>
          <input type="number" value={form.estimated_value} onChange={(e) => update("estimated_value", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
    );
  }

  function renderSchedule() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Invitation Date</Label>
          <input type="date" value={form.issue_date} onChange={(e) => update("issue_date", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Site Visit</Label>
          <input type="date" value={form.site_visit_date} onChange={(e) => update("site_visit_date", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Query Deadline</Label>
          <input type="datetime-local" value={form.query_deadline} onChange={(e) => update("query_deadline", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Submission Deadline *</Label>
          <input type="datetime-local" value={form.submission_deadline} onChange={(e) => update("submission_deadline", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Tender Days</Label>
          <input type="number" value={form.tender_days} onChange={(e) => update("tender_days", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Estimated Construction Duration (months)</Label>
          <input type="number" value={form.duration} onChange={(e) => update("duration", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Planned Start Date</Label>
          <input type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Planned End Date</Label>
          <input type="date" value={form.end_date} onChange={(e) => update("end_date", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
    );
  }

  function renderTeam() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs font-medium">Tender Manager / Person in Charge *</Label>
          <select value={form.project_manager_id} onChange={(e) => update("project_manager_id", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Select person in charge</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          Workstream owners (technical, QS, planning, procurement, commercial…) are assigned in
          <strong> Tender Management</strong> once the Go decision is made.
        </p>
      </div>
    );
  }

  function renderCostPrep() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cost estimation (BOQ, Price List, Preliminaries, Sub Quotes) can be prepared after project activation
          from the Pre-Contract Cost Estimation module. This step is optional during setup.
        </p>
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            After activating this project, use the <strong>Cost Estimation</strong> section in the sidebar
            to prepare your bid pricing.
          </p>
        </div>
      </div>
    );
  }

  function renderRisks() {
    if (isEditing) {
      return (
        <p className="text-sm text-muted-foreground">
          Risks for this tender are managed in the project&apos;s <strong>Risk &amp; Opportunity</strong> section.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add initial risk items for this tender. More risks can be added after activation.
        </p>
        {risks.map((risk, idx) => (
          <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Risk {idx + 1}</span>
              {risks.length > 1 && (
                <button type="button" onClick={() => removeRisk(idx)} className="text-muted-foreground hover:text-red-600 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Title</Label>
                <input value={risk.title} onChange={(e) => updateRisk(idx, "title", e.target.value)} placeholder="Risk title"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Category</Label>
                <select value={risk.category} onChange={(e) => updateRisk(idx, "category", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {RISK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Likelihood</Label>
                <select value={risk.likelihood} onChange={(e) => updateRisk(idx, "likelihood", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {LIKELIHOOD_OPTIONS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Impact</Label>
                <select value={risk.impact} onChange={(e) => updateRisk(idx, "impact", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {IMPACT_OPTIONS.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-medium">Description</Label>
                <textarea value={risk.description} onChange={(e) => updateRisk(idx, "description", e.target.value)} rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-medium">Mitigation</Label>
                <input value={risk.mitigation} onChange={(e) => updateRisk(idx, "mitigation", e.target.value)} placeholder="Mitigation strategy"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRisk}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Risk
        </Button>
      </div>
    );
  }

  function renderActivate() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Review the setup before activating this pre-contract project.</p>
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
        {isEditing && project?.project_status !== "active" && (
          <Button className="w-full rounded-2xl" disabled={!allOk || activating} onClick={handleActivate}>
            {activating ? "Activating..." : "Activate Pre-Contract Project"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Pre-Contract Project Setup</h2>
          <p className="text-sm text-muted-foreground">
            {isEditing ? `Editing: ${project.project_code} — ` : "New Pre-Contract Project — "}
            Step {activeStep} of {STEPS.length}: {active?.title}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Stepper */}
          <div className="overflow-x-auto border-b px-6 py-3">
            <div className="flex min-w-max gap-2">
              {STEPS.map((step) => {
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
                    <span>{step.icon}</span>
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
                <span className="text-2xl">{active?.icon}</span>
                <div>
                  <h3 className="text-xl font-semibold">{active?.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {activeStep === 1 && "Define the tender opportunity details."}
                    {activeStep === 2 && "Set key dates and submission timeline."}
                    {activeStep === 3 && "Assign the person in charge of the tender."}
                    {activeStep === 4 && "Prepare cost estimation (optional during setup)."}
                    {activeStep === 5 && "Identify and assess tender risks."}
                    {activeStep === 6 && "Review and activate the pre-contract project."}
                  </p>
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
              {activeStep < STEPS.length ? (
                <Button onClick={() => setActiveStep(activeStep + 1)} className="rounded-xl">
                  Next <ChevronRight className="h-4 w-4 ml-1.5" />
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving || !allOk} className="rounded-xl">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Create Project
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
