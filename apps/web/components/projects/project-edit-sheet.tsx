"use client";

import { useEffect, useRef, useState } from "react";
import { deleteProjectStakeholderMappingsByProjectId, deleteProjectStakeholderTeamsByProjectId, deleteProjectStakeholdersByProjectId, insertProjectStakeholder, insertProjectStakeholderMapping, insertProjectStakeholderTeamReturning, insertProjectTeamMember, insertProjectsReturning, listProfilesOrderedByFullName, listProjectStakeholderMappingsByProjectId, listProjectTeamMembersByProjectId, listStakeholderStaffByStakeholderIds, listStakeholderTemplates, listStakeholdersWithStatusActive, listTemplatePlaceholdersByTemplateId, updateProjectByIdReturning } from "@/lib/projects/projects-queries";
import { X, Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/ui/location-picker";
import { PROJECT_SECTORS, buildingTypesForSector, sectorLabel } from "@/lib/project-categories";

export interface Project {
  id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  client_id: string | null;
  consultant_id?: string | null;
  contract_type: string | null;
  contract_number: string | null;
  contract_value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  project_status: string;
  project_manager_id: string | null;
  project_director_id: string | null;
  engineering_manager_id: string | null;
  planning_manager_id: string | null;
  description: string | null;
  short_name: string | null;
  category: string | null;
  building_type: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  time_zone: string | null;
  dlp_period: string | null;
  retention: number | null;
  advance_payment: number | null;
  duration: string | null;
  source_tender_project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
  employee_id: string | null;
}

interface Stakeholder {
  id: string;
  organization_name: string;
  stakeholder_type: string;
}

interface TemplateSummary {
  id: string;
  name: string;
}

interface TemplatePlaceholderDetail {
  id: string;
  label: string;
  description: string | null;
  sort_order: number;
  teams: { id: string; name: string; description: string | null }[];
}

interface TeamAssignment {
  staffId: string;
  staffName: string;
  roleOnProject: string;
}

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

function formatNumber(value: string): string {
  if (!value) return "";
  const num = parseFloat(value.replace(/,/g, ""));
  if (isNaN(num)) return value;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ProjectEditSheetProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => void;
}

export function ProjectEditSheet({ project, onClose, onSave }: ProjectEditSheetProps) {
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clients, setClients] = useState<Stakeholder[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templatePlaceholders, setTemplatePlaceholders] = useState<TemplatePlaceholderDetail[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [teamAssignments, setTeamAssignments] = useState<Record<string, TeamAssignment[]>>({});
  const [stakeholderStaff, setStakeholderStaff] = useState<Record<string, { id: string; full_name: string; job_title: string | null }[]>>({});
  const [addingTeamKey, setAddingTeamKey] = useState<string | null>(null);
  const [addMemberStaffId, setAddMemberStaffId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("");
  const contractValueRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    project_code: project?.project_code ?? "",
    project_name: project?.project_name ?? "",
    project_type: project?.project_type ?? "tender",
    client_id: project?.client_id ?? "",
    contract_type: project?.contract_type ?? "",
    contract_number: project?.contract_number ?? "",
    contract_value: project?.contract_value?.toString() ?? "",
    currency: project?.currency ?? "USD",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    project_status: project?.project_status ?? "draft",
    project_manager_id: project?.project_manager_id ?? "",
    project_director_id: project?.project_director_id ?? "",
    engineering_manager_id: project?.engineering_manager_id ?? "",
    planning_manager_id: project?.planning_manager_id ?? "",
    description: project?.description ?? "",
    short_name: project?.short_name ?? "",
    category: project?.category ?? "",
    building_type: project?.building_type ?? "",
    location: project?.location ?? "",
    latitude: project?.latitude?.toString() ?? "",
    longitude: project?.longitude?.toString() ?? "",
    time_zone: project?.time_zone ?? "Asia/Phnom_Penh",
    dlp_period: project?.dlp_period ?? "",
    retention: project?.retention?.toString() ?? "",
    advance_payment: project?.advance_payment?.toString() ?? "",
    duration: project?.duration ?? "",
  });

  const isEditing = !!project;

  useEffect(() => {
    listProfilesOrderedByFullName().then(({ data }) => {
      if (data) setStaff(data as StaffProfile[]);
    });
    listStakeholdersWithStatusActive().then(({ data }) => {
      if (data) setClients(data as Stakeholder[]);
    });
    listStakeholderTemplates().then(({ data }) => {
      if (data) setTemplates(data);
    });
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      listTemplatePlaceholdersByTemplateId(selectedTemplateId)
        .then(({ data }) => {
          if (data) setTemplatePlaceholders(data as unknown as TemplatePlaceholderDetail[]);
        });
    } else {
      setTemplatePlaceholders([]);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    if (isEditing && project.id) {
      listProjectStakeholderMappingsByProjectId(project.id, "*, template_placeholders!inner(*)")
        .then(({ data }) => {
          if (data && data.length > 0) {
            const templateId = (data[0] as unknown as { template_placeholders: { template_id: string } }).template_placeholders.template_id;
            setSelectedTemplateId(templateId);
            const map: Record<string, string> = {};
            for (const m of data) {
              map[(m as unknown as { placeholder_id: string }).placeholder_id] = (m as unknown as { stakeholder_id: string }).stakeholder_id;
            }
            setMappings(map);
          }
        });
    }
  }, [isEditing, project?.id]);

  // Load stakeholder staff when mappings exist
  useEffect(() => {
    const ids = Object.values(mappings).filter(Boolean) as string[];
    if (ids.length > 0) {
      listStakeholderStaffByStakeholderIds(ids)
        .then(({ data }) => {
          if (data) {
            const grouped: Record<string, { id: string; full_name: string; job_title: string | null }[]> = {};
            for (const s of data as unknown as { id: string; stakeholder_id: string; full_name: string; job_title: string | null }[]) {
              if (!grouped[s.stakeholder_id]) grouped[s.stakeholder_id] = [];
              grouped[s.stakeholder_id].push({ id: s.id, full_name: s.full_name, job_title: s.job_title });
            }
            setStakeholderStaff(grouped);
          }
        });
    }
  }, [mappings]);

  // Load existing team members when editing
  useEffect(() => {
    if (isEditing && project.id && selectedTemplateId) {
      listProjectTeamMembersByProjectId(project.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const grouped: Record<string, TeamAssignment[]> = {};
            for (const m of data as unknown as {
              stakeholder_staff_id: string;
              role_on_project: string | null;
              project_stakeholder_teams: { stakeholder_id: string; team_name: string; placeholder_id: string | null };
            }[]) {
              const team = m.project_stakeholder_teams;
              const phId = team.placeholder_id;
              if (!phId) continue;
              const key = `${phId}::${team.team_name}`;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push({
                staffId: m.stakeholder_staff_id,
                staffName: "",
                roleOnProject: m.role_on_project ?? "",
              });
            }
            setTeamAssignments(grouped);
          }
        });
    }
  }, [isEditing, project?.id, selectedTemplateId]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      project_code: form.project_code.toUpperCase(),
      project_name: form.project_name,
      project_type: form.project_type,
      client_id: form.client_id || null,
      contract_type: form.contract_type || null,
      contract_number: form.contract_number || null,
      contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
      currency: form.currency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      project_status: form.project_status,
      project_manager_id: form.project_manager_id || null,
      project_director_id: form.project_director_id || null,
      engineering_manager_id: form.engineering_manager_id || null,
      planning_manager_id: form.planning_manager_id || null,
      description: form.description || null,
      short_name: form.short_name || null,
      category: form.category || null,
      building_type: form.building_type || null,
      location: form.location || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      time_zone: form.time_zone || "Asia/Phnom_Penh",
      dlp_period: form.dlp_period || null,
      retention: form.retention ? parseFloat(form.retention) : null,
      advance_payment: form.advance_payment ? parseFloat(form.advance_payment) : null,
      duration: form.duration || null,
    };

    let projectId: string;
    if (isEditing) {
      const { error } = await updateProjectByIdReturning(payload, project.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Project updated");
      projectId = project.id;
    } else {
      const { data, error } = await insertProjectsReturning(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Project created");
      projectId = data.id;
    }

    // Save stakeholder mappings
    if (selectedTemplateId && Object.values(mappings).some(Boolean)) {
      await deleteProjectStakeholderMappingsByProjectId(projectId);
      await deleteProjectStakeholdersByProjectId(projectId);
      await deleteProjectStakeholderTeamsByProjectId(projectId);

      for (const [placeholderId, stakeholderId] of Object.entries(mappings)) {
        if (!stakeholderId) continue;
        const placeholder = templatePlaceholders.find((ph) => ph.id === placeholderId);
        if (!placeholder) continue;

        await insertProjectStakeholderMapping({
          project_id: projectId,
          placeholder_id: placeholderId,
          stakeholder_id: stakeholderId,
        });

        await insertProjectStakeholder({
          project_id: projectId,
          stakeholder_id: stakeholderId,
          role_in_project: placeholder.label,
        });

        for (const team of placeholder.teams) {
          const { data: teamData } = await insertProjectStakeholderTeamReturning({
              project_id: projectId,
              stakeholder_id: stakeholderId,
              placeholder_id: placeholderId,
              team_name: team.name,
              description: team.description,
            });

          if (teamData) {
            const teamKey = `${placeholderId}::${team.name}`;
            const members = teamAssignments[teamKey] ?? [];
            for (const member of members) {
              await insertProjectTeamMember({
                project_stakeholder_team_id: teamData.id,
                stakeholder_staff_id: member.staffId,
                role_on_project: member.roleOnProject || null,
              });
            }
          }
        }
      }
    }

    setSaving(false);
    onSave({
      id: projectId,
      ...payload,
      contract_value: payload.contract_value ?? null,
    } as unknown as Project);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {isEditing ? form.project_name : "New Project"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEditing ? form.project_code : "Create a new project"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Info</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="project_code">Project Code *</Label>
                <input
                  id="project_code"
                  value={form.project_code}
                  onChange={(e) => update("project_code", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project_type">Project Type *</Label>
                <select
                  id="project_type"
                  value={form.project_type}
                  onChange={(e) => update("project_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="short_name">Short Name</Label>
                <input
                  id="short_name"
                  value={form.short_name}
                  onChange={(e) => update("short_name", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Sector</Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => { update("category", e.target.value); update("building_type", ""); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">Select sector</option>
                  {PROJECT_SECTORS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                  {form.category && !PROJECT_SECTORS.some((s) => s.value === form.category) && (
                    <option value={form.category}>{sectorLabel(form.category)}</option>
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="building_type">Building Type</Label>
                <select
                  id="building_type"
                  value={form.building_type}
                  disabled={!form.category}
                  onChange={(e) => update("building_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary disabled:opacity-50"
                >
                  <option value="">{form.category ? "Select building type" : "Select a sector first"}</option>
                  {buildingTypesForSector(form.category).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project_name">Project Name *</Label>
              <input
                id="project_name"
                value={form.project_name}
                onChange={(e) => update("project_name", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
              <Label htmlFor="location">Location</Label>
              <LocationPicker
                lat={form.latitude ? parseFloat(form.latitude) : null}
                lng={form.longitude ? parseFloat(form.longitude) : null}
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
                <Label htmlFor="time_zone">Time Zone</Label>
                <select
                  id="time_zone"
                  value={form.time_zone}
                  onChange={(e) => update("time_zone", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {TIME_ZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client & Contract</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client_id">Client</Label>
                <select
                  id="client_id"
                  value={form.client_id}
                  onChange={(e) => update("client_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">— Select Client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.organization_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract_number">Contract Number</Label>
                <input
                  id="contract_number"
                  value={form.contract_number}
                  onChange={(e) => update("contract_number", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contract_type">Contract Type</Label>
                <select
                  id="contract_type"
                  value={form.contract_type}
                  onChange={(e) => update("contract_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contract_value">Contract Value</Label>
              <input
                ref={contractValueRef}
                id="contract_value"
                type="text"
                inputMode="numeric"
                value={formatNumber(form.contract_value)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  update("contract_value", raw);
                  requestAnimationFrame(() => {
                    const el = contractValueRef.current;
                    if (!el) return;
                    const formatted = formatNumber(raw);
                    const pos = formatted.indexOf(".");
                    if (pos > 0) el.setSelectionRange(pos, pos);
                  });
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dlp_period">DLP Period</Label>
                <input
                  id="dlp_period"
                  value={form.dlp_period}
                  onChange={(e) => update("dlp_period", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration">Duration</Label>
                <input
                  id="duration"
                  value={form.duration}
                  onChange={(e) => update("duration", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="retention">Retention (%)</Label>
                <input
                  id="retention"
                  type="number"
                  step="0.01"
                  value={form.retention}
                  onChange={(e) => update("retention", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="advance_payment">Advance Payment (%)</Label>
                <input
                  id="advance_payment"
                  type="number"
                  step="0.01"
                  value={form.advance_payment}
                  onChange={(e) => update("advance_payment", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_date">Start Date</Label>
                <input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update("start_date", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_date">End Date</Label>
                <input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => update("end_date", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Management</legend>
            <div className="space-y-1.5">
              <Label htmlFor="project_manager">Project Manager</Label>
              <select
                id="project_manager"
                value={form.project_manager_id}
                onChange={(e) => update("project_manager_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— Select —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}{s.employee_id ? ` (${s.employee_id})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project_status">Status</Label>
              <select
                id="project_status"
                value={form.project_status}
                onChange={(e) => update("project_status", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stakeholders</legend>

            <div className="space-y-1.5">
              <Label htmlFor="mapping_template">Template</Label>
              <select
                id="mapping_template"
                value={selectedTemplateId}
                onChange={(e) => { setSelectedTemplateId(e.target.value); setMappings({}); }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— Select Template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {selectedTemplateId && templatePlaceholders.length > 0 && (
              <div className="space-y-2 pt-1">
                {templatePlaceholders.map((ph) => (
                  <div key={ph.id} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground min-w-[130px]">{ph.label}</span>
                    <select
                      value={mappings[ph.id] ?? ""}
                      onChange={(e) => setMappings((prev) => ({ ...prev, [ph.id]: e.target.value }))}
                      className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary"
                    >
                      <option value="">— Select —</option>
                      {clients.map((s) => (
                        <option key={s.id} value={s.id}>{s.organization_name}</option>
                      ))}
                    </select>
                    {mappings[ph.id] && (
                      <span className="text-xs text-emerald-600 font-medium">✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedTemplateId && templatePlaceholders.some((ph) => ph.teams.length > 0) && (
              <div className="rounded-md bg-muted/30 border border-border p-3 space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Teams to be created</span>
                {templatePlaceholders.filter((ph) => mappings[ph.id]).map((ph) => {
                  const orgName = clients.find((s) => s.id === mappings[ph.id])?.organization_name ?? "?";
                  return ph.teams.length > 0 ? (
                    <div key={ph.id} className="text-xs">
                      <span className="font-medium text-foreground">{ph.label}</span>
                      <span className="text-muted-foreground"> → {orgName}</span>
                      <ul className="list-disc list-inside text-muted-foreground pl-2 mt-0.5">
                        {ph.teams.map((team) => (
                          <li key={team.id}>{team.name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Members</legend>
            {(!selectedTemplateId || !Object.values(mappings).some(Boolean)) ? (
              <p className="text-xs text-muted-foreground py-2">Map stakeholders first to assign team members.</p>
            ) : templatePlaceholders.filter((ph) => mappings[ph.id]).length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Map at least one placeholder to a stakeholder to assign team members.</p>
            ) : (
              <div className="space-y-4">
                {templatePlaceholders
                  .filter((ph) => mappings[ph.id])
                  .map((ph) => {
                    const stakeholderId = mappings[ph.id];
                    const orgName = clients.find((s) => s.id === stakeholderId)?.organization_name ?? "?";
                    const staffList = stakeholderStaff[stakeholderId] ?? [];
                    return (
                      <div key={ph.id}>
                        <span className="text-sm font-medium text-foreground">{ph.label}</span>
                        <span className="text-xs text-muted-foreground"> → {orgName}</span>
                        <div className="mt-2 space-y-3">
                          {ph.teams.map((team) => {
                            const teamKey = `${ph.id}::${team.name}`;
                            const members = teamAssignments[teamKey] ?? [];
                            return (
                              <div key={team.id} className="rounded-md border border-border bg-muted/20 p-2.5">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium">{team.name}</span>
                                </div>
                                {members.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground mb-2">No members assigned.</p>
                                ) : (
                                  <div className="space-y-1 mb-2">
                                    {members.map((m, i) => {
                                      const staffName = staffList.find((s) => s.id === m.staffId)?.full_name ?? (m.staffName || "Unknown");
                                      const staffTitle = staffList.find((s) => s.id === m.staffId)?.job_title;
                                      return (
                                        <div key={`${m.staffId}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5">
                                          <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium">{staffName}</span>
                                            {staffTitle && <span className="text-[10px] text-muted-foreground ml-1">({staffTitle})</span>}
                                            {m.roleOnProject && <span className="text-[10px] text-muted-foreground ml-1">— {m.roleOnProject}</span>}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setTeamAssignments((prev) => ({
                                                ...prev,
                                                [teamKey]: prev[teamKey].filter((_, idx) => idx !== i),
                                              }));
                                            }}
                                            className="rounded p-0.5 text-muted-foreground hover:text-red-600 transition-colors"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {addingTeamKey === teamKey ? (
                                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                                    <select
                                      value={addMemberStaffId}
                                      onChange={(e) => setAddMemberStaffId(e.target.value)}
                                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary"
                                    >
                                      <option value="">— Select staff —</option>
                                      {staffList
                                        .filter((s) => !members.some((m) => m.staffId === s.id))
                                        .map((s) => (
                                          <option key={s.id} value={s.id}>{s.full_name}{s.job_title ? ` (${s.job_title})` : ""}</option>
                                        ))}
                                    </select>
                                    <input
                                      value={addMemberRole}
                                      onChange={(e) => setAddMemberRole(e.target.value)}
                                      placeholder="Role"
                                      className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!addMemberStaffId) return;
                                        const staffName = staffList.find((s) => s.id === addMemberStaffId)?.full_name ?? "";
                                        setTeamAssignments((prev) => ({
                                          ...prev,
                                          [teamKey]: [...(prev[teamKey] ?? []), { staffId: addMemberStaffId, staffName, roleOnProject: addMemberRole }],
                                        }));
                                        setAddMemberStaffId("");
                                        setAddMemberRole("");
                                        setAddingTeamKey(null);
                                      }}
                                      disabled={!addMemberStaffId}
                                      className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    >
                                      Add
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setAddingTeamKey(null); setAddMemberStaffId(""); setAddMemberRole(""); }}
                                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingTeamKey(teamKey);
                                      setAddMemberStaffId("");
                                      setAddMemberRole("");
                                    }}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Member
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </fieldset>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.project_code.trim() || !form.project_name.trim()}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            {isEditing ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
