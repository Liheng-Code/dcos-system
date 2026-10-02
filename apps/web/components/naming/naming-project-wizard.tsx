"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { countWbsNodesByProjectId, getProjectById, insertProjectsReturning, insertWbsNodeReturning, insertWbsNodes, insertWbsNodesReturning, listLevelNamingTemplatesWithIsActive, listProfiles, updateProjectByIdReturning } from "@/lib/naming/naming-queries";
import { X, Loader2, Save, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/ui/location-picker";
import type { Project } from "@/components/project/projects/project-edit-sheet";
import { STEPS, formStateFromProject, formToPayload, type WizardFormState } from "@/components/project/projects/steps/step-panel";
import { PROJECT_SECTORS, buildingTypesForSector, sectorLabel } from "@/lib/project-categories";
import { useStakeholderSteps } from "@/components/project/projects/steps/use-stakeholder-steps";
import { NamingProjectCodeGen } from "./naming-project-code-gen";
import { WbsBuildingConfig } from "./naming-wbs-building-config";
import { WbsLevelConfig } from "./naming-wbs-level-config";
import { WbsZoneConfig } from "./naming-wbs-zone-config";
import { WbsRoomNumbering } from "./naming-wbs-room-numbering";
import { WbsCodePreview } from "./naming-wbs-code-preview";
import { generateLevels, generateZones, generateRooms, buildWbsInsertPayloads, type WbsConfigState, type LevelNamingTemplateRecord, type LevelEntry } from "./naming-wbs-types";
import { NamingNumberingRules } from "./naming-numbering-rules";
import { NamingBudgetPackages } from "./naming-budget-packages";

interface NamingProjectWizardProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => void;
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
  { value: "tender", label: "Tender" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "JPY", "EUR"];

export function NamingProjectWizard({ project, onClose, onSave }: NamingProjectWizardProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WizardFormState>(() => formStateFromProject(project));
  const [staff, setStaff] = useState<{ id: string; full_name: string; employee_id: string | null }[]>([]);

  const sh = useStakeholderSteps(project?.id ?? null);
  const [durationManual, setDurationManual] = useState(() => {
    if (!project?.duration) return false;
    return true;
  });

  const [levelTemplates, setLevelTemplates] = useState<LevelNamingTemplateRecord[]>([]);

  const [wbsConfig, setWbsConfig] = useState<WbsConfigState>({
    buildingCode: "",
    buildingName: "",
    levelEntries: [],
    designZones: [],
    constructionZones: [],
    startRoom: 1,
    selectedTemplateId: null,
  });

  const wbsLevels = useMemo(() => generateLevels(wbsConfig.buildingCode, wbsConfig.levelEntries), [wbsConfig.buildingCode, wbsConfig.levelEntries]);
  const wbsZones = useMemo(() => generateZones(wbsLevels, wbsConfig.designZones, wbsConfig.constructionZones), [wbsLevels, wbsConfig.designZones, wbsConfig.constructionZones]);
  const wbsRooms = useMemo(() => generateRooms(wbsLevels, wbsConfig.startRoom, wbsConfig), [wbsLevels, wbsConfig.startRoom, wbsConfig]);

  const durationMonths = useMemo(() => calcMonths(form.start_date, form.end_date), [form.start_date, form.end_date]);

  useEffect(() => {
    if (!durationManual) setForm((prev) => ({ ...prev, duration: durationMonths }));
  }, [durationMonths, durationManual]);

  useEffect(() => {
    listProfiles().then(({ data }) => {
      if (data) setStaff(data as { id: string; full_name: string; employee_id: string | null }[]);
    });
    listLevelNamingTemplatesWithIsActive().then(({ data }) => {
      if (data) setLevelTemplates(data as LevelNamingTemplateRecord[]);
    });
  }, []);

  const handleProjectCodeChange = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, project_code: v }));
  }, []);

  const handleShortNameChange = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, short_name: v }));
  }, []);

  const [savedProjectId, setSavedProjectId] = useState<string | null>(project?.id ?? null);
  const fv = (v: unknown): string => (v ?? "") as string;
  const isEditing = !!project;
  const effectiveProjectId = savedProjectId;

  function update(field: keyof WizardFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function calcMonths(start: string, end: string): string {
    if (!start || !end) return "";
    const s = new Date(start), e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
    return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())).toString();
  }

  async function generateWbsNodes(projectId: string) {
    const { count } = await countWbsNodesByProjectId(projectId);
    if (count && count > 0) return;

    if (!wbsConfig.buildingCode) return;

    const { building, levels, zonesByLevel, roomsByLevel } = buildWbsInsertPayloads(
      projectId, wbsConfig, wbsLevels, wbsZones, wbsRooms,
    );

    const { data: buildingNode, error: bErr } = await insertWbsNodesReturning(building);
    if (bErr || !buildingNode) { toast.error("Failed to create building node"); return; }

    for (const item of levels) {
      const { data: levelNode, error: lErr } = await insertWbsNodeReturning({ ...item.payload, parent_id: buildingNode.id });
      if (lErr || !levelNode) { toast.error("Failed to create level node"); continue; }

      const levelZones = zonesByLevel[item.levelCode] || [];
      if (levelZones.length > 0) {
        const { error: zErr } = await insertWbsNodes(levelZones.map((z) => ({ ...z, parent_id: levelNode.id })));
        if (zErr) toast.error("Failed to create zone nodes");
      }

      const levelRooms = roomsByLevel[item.levelCode] || [];
      if (levelRooms.length > 0) {
        const { error: rErr } = await insertWbsNodes(levelRooms.map((r) => ({ ...r, parent_id: levelNode.id })));
        if (rErr) toast.error("Failed to create room nodes");
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      ...formToPayload(form),
      level_naming_template_id: wbsConfig.selectedTemplateId ?? null,
    };
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
      setSavedProjectId(data.id);
      projectId = data.id;
    }

    await generateWbsNodes(projectId);
    await sh.saveStakeholderAssignments(projectId);

    setSaving(false);
    const { data: updated } = await getProjectById(projectId, "*");
    if (updated) onSave(updated as Project);
    else onSave({ ...payload, id: projectId } as unknown as Project);
  }

  const active = useMemo(() => STEPS.find((s) => s.id === activeStep), [activeStep]);

  function renderStepContent() {
    switch (activeStep) {
      case 1: return renderBasicInfo();
      case 2: return renderContract();
      case 3: return renderStakeholders();
      case 4: return renderTeam();
      case 5: return renderPlaceholder("Calendar setup");
      case 6: return renderWbsSetup();
      case 7: return renderNumberingRules();
      case 8: return renderPlaceholder("Approval flows");
      case 9: return renderBudgetSettings();
      case 10: return renderPlaceholder("Notification rules");
      case 11: return renderPlaceholder("Activation");
      default: return null;
    }
  }

  function handleTemplateChange(templateId: string | null) {
    setWbsConfig((p) => ({ ...p, selectedTemplateId: templateId }));
  }

  function renderWbsSetup() {
    return (
      <div className="space-y-4">
        <WbsBuildingConfig
          buildingCode={wbsConfig.buildingCode}
          buildingName={wbsConfig.buildingName}
          onBuildingCodeChange={(v) => setWbsConfig((p) => ({ ...p, buildingCode: v }))}
          onBuildingNameChange={(v) => setWbsConfig((p) => ({ ...p, buildingName: v }))}
        />
        {wbsConfig.buildingCode && (
          <>
            <WbsLevelConfig
              buildingCode={wbsConfig.buildingCode}
              levelEntries={wbsConfig.levelEntries}
              templates={levelTemplates}
              selectedTemplateId={wbsConfig.selectedTemplateId}
              onLevelEntriesChange={(v) => setWbsConfig((p) => ({ ...p, levelEntries: v }))}
              onTemplateChange={handleTemplateChange}
            />
            <WbsZoneConfig
              designZones={wbsConfig.designZones}
              constructionZones={wbsConfig.constructionZones}
              onDesignZonesChange={(v) => setWbsConfig((p) => ({ ...p, designZones: v }))}
              onConstructionZonesChange={(v) => setWbsConfig((p) => ({ ...p, constructionZones: v }))}
            />
            <WbsRoomNumbering
              startRoom={wbsConfig.startRoom}
              levels={wbsLevels}
              config={wbsConfig}
              onStartRoomChange={(v) => setWbsConfig((p) => ({ ...p, startRoom: v }))}
            />
            <WbsCodePreview
              config={wbsConfig}
              levels={wbsLevels}
              zones={wbsZones}
              rooms={wbsRooms}
            />
          </>
        )}
      </div>
    );
  }

  function renderNumberingRules() {
    return (
      <NamingNumberingRules
        projectId={effectiveProjectId}
        onSaved={() => {}}
      />
    );
  }

  function renderBudgetSettings() {
    return (
      <NamingBudgetPackages
        projectId={effectiveProjectId}
        contractValue={form.contract_value ? parseFloat(form.contract_value) : null}
        onSaved={() => {}}
      />
    );
  }

  function renderStakeholders() {
    const selectedTemplate = sh.useTemplate && sh.selectedTemplateId
      ? sh.templates.find((t) => t.id === sh.selectedTemplateId) ?? null
      : null;

    return (
      <div className="space-y-4">
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

  function renderPlaceholder(title: string) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">{title} — coming soon</p>
      </div>
    );
  }

  function renderBasicInfo() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <NamingProjectCodeGen
            projectName={form.project_name}
            projectCode={form.project_code}
            shortName={form.short_name}
            onProjectCodeChange={handleProjectCodeChange}
            onShortNameChange={handleShortNameChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_project_type">Project Type *</Label>
          <select id="nwz_project_type" value={fv(form.project_type)} onChange={(e) => update("project_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {PROJECT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_category">Sector *</Label>
          <select id="nwz_category" value={fv(form.category)}
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
          <Label htmlFor="nwz_building_type">Building Type</Label>
          <select id="nwz_building_type" value={fv(form.building_type)} disabled={!form.category}
            onChange={(e) => update("building_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary disabled:opacity-50">
            <option value="">{form.category ? "Select building type" : "Select a sector first"}</option>
            {buildingTypesForSector(form.category).map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="nwz_project_name">Project Name *</Label>
          <input id="nwz_project_name" value={fv(form.project_name)} onChange={(e) => update("project_name", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="nwz_location">Location</Label>
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
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="nwz_description">Description</Label>
          <textarea id="nwz_description" value={fv(form.description)} onChange={(e) => update("description", e.target.value)} rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary resize-none" />
        </div>
      </div>
    );
  }

  function renderContract() {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="nwz_client_id">Client</Label>
          <select id="nwz_client_id" value={fv(form.client_id)} onChange={(e) => update("client_id", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">— Select Client —</option>
            {sh.stakeholders.map((c) => (<option key={c.id} value={c.id}>{c.organization_name}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_contract_type">Contract Type</Label>
          <select id="nwz_contract_type" value={fv(form.contract_type)} onChange={(e) => update("contract_type", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">—</option>
            {CONTRACT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_currency">Currency</Label>
          <select id="nwz_currency" value={fv(form.currency)} onChange={(e) => update("currency", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_contract_value">Contract Value ($)</Label>
          <input id="nwz_contract_value" type="text" inputMode="decimal" value={fv(form.contract_value)}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "");
              if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) update("contract_value", raw);
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_start_date">Start Date</Label>
          <input id="nwz_start_date" type="date" value={fv(form.start_date)} onChange={(e) => update("start_date", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_end_date">Finish Date</Label>
          <input id="nwz_end_date" type="date" value={fv(form.end_date)} onChange={(e) => update("end_date", e.target.value)}
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
          <Label htmlFor="nwz_dlp_period">DLP Period (Months)</Label>
          <input id="nwz_dlp_period" value={fv(form.dlp_period)} onChange={(e) => update("dlp_period", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_retention">Retention (%)</Label>
          <input id="nwz_retention" type="number" step="0.01" value={fv(form.retention)} onChange={(e) => update("retention", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_advance_payment">Advance Payment (%)</Label>
          <input id="nwz_advance_payment" type="number" step="0.01" value={fv(form.advance_payment)} onChange={(e) => update("advance_payment", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_project_manager">Project Manager</Label>
          <select id="nwz_project_manager" value={fv(form.project_manager_id)} onChange={(e) => update("project_manager_id", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            <option value="">— Select PM —</option>
            {staff.map((s) => (<option key={s.id} value={s.id}>{s.full_name}{s.employee_id ? ` (${s.employee_id})` : ""}</option>))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nwz_project_status">Status</Label>
          <select id="nwz_project_status" value={fv(form.project_status)} onChange={(e) => update("project_status", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary">
            {STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" key="naming-wizard">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{isEditing ? "Edit Project" : "New Project"} (Template)</h2>
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-0.5">
            NCS-001
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <div className="flex gap-1 px-6 py-3 border-b bg-muted/20">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStep(s.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeStep === s.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="hidden sm:inline">{s.title}</span>
            <span className="sm:hidden">{s.id}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
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
  );
}
