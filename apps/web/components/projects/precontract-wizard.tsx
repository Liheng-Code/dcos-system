"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Project } from "@/components/projects/project-edit-sheet";

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

const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "JPY", "EUR"];

const RISK_CATEGORIES = [
  "technical", "commercial", "schedule", "geotechnical", "market", "regulatory", "environmental", "other",
];

const LIKELIHOOD_OPTIONS = ["very_low", "low", "medium", "high", "very_high"];
const IMPACT_OPTIONS = ["very_low", "low", "medium", "high", "very_high"];

interface StaffProfile {
  id: string;
  full_name: string;
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
  client_id: string;
  tender_type: string;
  procurement_method: string;
  budget_range: string;
  currency: string;
  estimated_value: string;
  // Step 2: Schedule
  issue_date: string;
  submission_deadline: string;
  tender_days: string;
  start_date: string;
  end_date: string;
  // Step 3: Team
  project_manager_id: string;
  // Step 6: Activate
  project_status: string;
}

export function PrecontractWizard({ project, onClose, onSave }: PrecontractWizardProps) {
  const supabase = createClient();
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const isEditing = !!project;

  const [form, setForm] = useState<PrecontractForm>(() => ({
    project_code: project?.project_code ?? "",
    project_name: project?.project_name ?? "",
    description: project?.description ?? "",
    location: project?.location ?? "",
    category: project?.category ?? "",
    client_id: project?.client_id ?? "",
    tender_type: "selective",
    procurement_method: "limited_bid",
    budget_range: "",
    currency: project?.currency ?? "USD",
    estimated_value: "",
    issue_date: "",
    submission_deadline: "",
    tender_days: "30",
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
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      if (data) setStaff(data as StaffProfile[]);
    });
  }, [supabase]);

  // Load existing precontract details when editing
  useEffect(() => {
    if (!project?.id) return;
    supabase.from("project_precontract_details").select("*").eq("project_id", project.id).single().then(({ data }) => {
      if (data) {
        setForm((prev) => ({
          ...prev,
          tender_type: data.tender_type ?? prev.tender_type,
          procurement_method: data.procurement_method ?? prev.procurement_method,
          budget_range: data.budget_range != null ? String(data.budget_range) : prev.budget_range,
          estimated_value: data.estimated_value != null ? String(data.estimated_value) : prev.estimated_value,
          submission_deadline: data.submission_deadline ? String(data.submission_deadline).slice(0, 16) : prev.submission_deadline,
          tender_days: data.tender_days != null ? String(data.tender_days) : prev.tender_days,
        }));
      }
    });
  }, [project?.id, supabase]);

  function update(field: keyof PrecontractForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const validationItems = useMemo(() => [
    { label: "Project code", ok: !!form.project_code },
    { label: "Project name", ok: !!form.project_name },
    { label: "Client assigned", ok: !!form.client_id },
    { label: "Submission deadline set", ok: !!form.submission_deadline },
    { label: "Project manager assigned", ok: !!form.project_manager_id },
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
      description: form.description || null,
      location: form.location || null,
      category: form.category || null,
      currency: form.currency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      project_status: form.project_status,
      project_manager_id: form.project_manager_id || null,
    };

    let projectId: string;
    if (isEditing) {
      const { error } = await supabase.from("projects").update(projectPayload).eq("id", project.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      projectId = project.id;
    } else {
      const { data, error } = await supabase.from("projects").insert(projectPayload).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      projectId = data.id;
    }

    // 2. Create/update tender_register
    const days = parseInt(form.tender_days) || 30;
    const tenderPayload = {
      project_id: projectId,
      tender_no: form.project_code.toUpperCase(),
      title: form.project_name,
      description: form.description || null,
      tender_type: form.tender_type,
      budget_range: parseFloat(form.budget_range) || null,
      currency: form.currency,
      issue_date: form.issue_date || null,
      submission_deadline: form.submission_deadline || null,
      tender_days: days,
      procurement_method: form.procurement_method,
      estimated_value: parseFloat(form.estimated_value) || null,
      status: "draft",
    };

    // Check if tender already exists for this project
    const { data: existingTender } = await supabase
      .from("tender_register")
      .select("id")
      .eq("project_id", projectId)
      .single();

    let tenderId: string;
    if (existingTender) {
      await supabase.from("tender_register").update(tenderPayload).eq("id", existingTender.id);
      tenderId = existingTender.id;
    } else {
      const { data: newTender, error: tenderErr } = await supabase.from("tender_register").insert(tenderPayload).select().single();
      if (tenderErr) { toast.error(tenderErr.message); setSaving(false); return; }
      tenderId = newTender.id;
    }

    // 3. Create/update precontract details
    const precontractPayload = {
      project_id: projectId,
      tender_register_id: tenderId,
      tender_type: form.tender_type,
      procurement_method: form.procurement_method,
      submission_deadline: form.submission_deadline || null,
      tender_days: days,
      estimated_value: parseFloat(form.estimated_value) || null,
      bid_currency: form.currency,
      award_status: "pending",
    };

    const { error: pcErr } = await supabase
      .from("project_precontract_details")
      .upsert(precontractPayload, { onConflict: "project_id" });
    if (pcErr) { toast.error(pcErr.message); setSaving(false); return; }

    // 4. Create initial risk items (if any with titles)
    const validRisks = risks.filter((r) => r.title.trim());
    if (validRisks.length > 0) {
      const riskPayload = validRisks.map((r) => ({
        tender_id: tenderId,
        title: r.title,
        description: r.description || null,
        category: r.category,
        likelihood: r.likelihood,
        impact: r.impact,
        mitigation: r.mitigation || null,
      }));
      await supabase.from("tender_risk_items").insert(riskPayload);
    }

    toast.success(isEditing ? "Pre-contract project updated" : "Pre-contract project created");
    setSaving(false);

    const { data: updated } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (updated) onSave(updated as Project);
    else onSave({ ...projectPayload, id: projectId } as unknown as Project);
  }

  async function handleActivate() {
    setActivating(true);
    await supabase.from("projects").update({ project_status: "active" }).eq("id", project?.id ?? "");
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
          <Label className="text-xs font-medium">Category</Label>
          <select value={form.category} onChange={(e) => update("category", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Select category</option>
            <option value="building">Building</option>
            <option value="high_rise">High Rise</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="industrial">Industrial</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="mixed_use">Mixed Use</option>
            <option value="other">Other</option>
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
          <input value={form.client_id} onChange={(e) => update("client_id", e.target.value)} placeholder="Client ID or name"
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
          <Label className="text-xs font-medium">Issue Date</Label>
          <input type="date" value={form.issue_date} onChange={(e) => update("issue_date", e.target.value)}
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
          <Label className="text-xs font-medium">Project Manager *</Label>
          <select value={form.project_manager_id} onChange={(e) => update("project_manager_id", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Select project manager</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          Additional team members and stakeholders can be configured after project creation.
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
                    {activeStep === 3 && "Assign the project manager."}
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
