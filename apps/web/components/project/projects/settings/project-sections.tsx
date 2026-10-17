"use client";

import { LocationPicker } from "@/components/ui/location-picker";
import { cn } from "@/lib/utils";
import { updateProjectByIdReturning } from "@/lib/project/projects/projects-queries";
import type { Project } from "@/lib/project/projects/project-types";
import { calcMonths } from "@/lib/project/projects/project-dates";
import { ClientField, Field, SectorFields, StaffSelect, inputClass, useStaff } from "@/components/project/projects/fields/project-fields";
import { ProjectCodeField } from "@/components/project/projects/project-code-field";
import { SectionFrame, useSection, type SectionMode } from "@/components/project/projects/settings/section-frame";

// The two sections stored on the project row itself.

const TIME_ZONES = [
  "Asia/Phnom_Penh", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Jakarta",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC",
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

interface ProjectSectionProps {
  project: Project;
  onProjectUpdated: (project: Project) => void;
  mode?: SectionMode;
}

async function saveProject(id: string, patch: Partial<Project>, onUpdated: (p: Project) => void) {
  const { data, error } = await updateProjectByIdReturning({ ...patch, updated_at: new Date().toISOString() }, id);
  if (error) throw new Error(error.message);
  onUpdated(data as Project);
}

const text = (v: string | null | undefined) => v ?? "";
const numText = (v: number | null | undefined) => (v == null ? "" : String(v));
const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

export function GeneralSection({ project, onProjectUpdated, mode }: ProjectSectionProps) {
  const s = useSection(
    async () => ({
      project_name: project.project_name,
      short_name: text(project.short_name),
      category: text(project.category),
      building_type: text(project.building_type),
      location: text(project.location),
      latitude: project.latitude,
      longitude: project.longitude,
      time_zone: project.time_zone ?? "Asia/Phnom_Penh",
      description: text(project.description),
    }),
    async (v) => {
      if (!v.project_name.trim()) throw new Error("The project name cannot be empty.");
      if (!v.category) throw new Error("Choose a sector.");
      await saveProject(project.id, {
        project_name: v.project_name.trim(),
        short_name: v.short_name || null,
        category: v.category || null,
        building_type: v.building_type || null,
        location: v.location || null,
        latitude: v.latitude,
        longitude: v.longitude,
        time_zone: v.time_zone,
        description: v.description || null,
      }, onProjectUpdated);
    },
    mode,
  );
  const v = s.value;
  return (
    <SectionFrame id="general" title="General" description="Name, sector and location." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="grid gap-4 md:grid-cols-2">
          <ProjectCodeField code={project.project_code} className="space-y-1.5" inputClassName="rounded-lg py-2" />
          <Field label="Short name" htmlFor="st_short"><input id="st_short" value={v.short_name} onChange={(e) => s.patch({ short_name: e.target.value })} className={inputClass} /></Field>
          <Field label="Project name *" htmlFor="st_name" className="md:col-span-2"><input id="st_name" value={v.project_name} onChange={(e) => s.patch({ project_name: e.target.value })} className={inputClass} /></Field>
          <SectorFields idPrefix="st" category={v.category} buildingType={v.building_type} onChange={(n) => s.patch({ category: n.category, building_type: n.buildingType })} />
          <Field label="Location" className="md:col-span-2">
            <LocationPicker
              lat={v.latitude}
              lng={v.longitude}
              address={v.location}
              country="kh"
              onChange={(lat, lng, address) => s.patch({ latitude: lat, longitude: lng, location: address })}
            />
          </Field>
          <Field label="Time zone" htmlFor="st_tz">
            <select id="st_tz" value={v.time_zone} onChange={(e) => s.patch({ time_zone: e.target.value })} className={inputClass}>
              {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
          <Field label="Description" htmlFor="st_desc" className="md:col-span-2">
            <textarea id="st_desc" rows={3} value={v.description} onChange={(e) => s.patch({ description: e.target.value })} className={cn(inputClass, "resize-none")} />
          </Field>
        </div>
      )}
    </SectionFrame>
  );
}

export function ContractSection({ project, onProjectUpdated, mode }: ProjectSectionProps) {
  const staff = useStaff();
  const s = useSection(
    async () => ({
      client_id: text(project.client_id),
      contract_number: text(project.contract_number),
      contract_type: text(project.contract_type),
      currency: project.currency ?? "USD",
      contract_value: numText(project.contract_value),
      start_date: text(project.start_date),
      end_date: text(project.end_date),
      duration: text(project.duration),
      duration_manual: !!project.duration && project.duration !== calcMonths(text(project.start_date), text(project.end_date)),
      dlp_period: text(project.dlp_period),
      retention: numText(project.retention),
      advance_payment: numText(project.advance_payment),
      project_manager_id: text(project.project_manager_id),
      project_director_id: text(project.project_director_id),
      engineering_manager_id: text(project.engineering_manager_id),
      planning_manager_id: text(project.planning_manager_id),
    }),
    async (v) => {
      if (v.start_date && v.end_date && v.end_date < v.start_date) throw new Error("The finish date is before the start date.");
      if (v.contract_value && Number.isNaN(Number(v.contract_value))) throw new Error("The contract value is not a number.");
      await saveProject(project.id, {
        client_id: v.client_id || null,
        contract_number: v.contract_number || null,
        contract_type: v.contract_type || null,
        currency: v.currency,
        contract_value: toNum(v.contract_value),
        start_date: v.start_date || null,
        end_date: v.end_date || null,
        duration: (v.duration_manual ? v.duration : calcMonths(v.start_date, v.end_date)) || null,
        dlp_period: v.dlp_period || null,
        retention: toNum(v.retention),
        advance_payment: toNum(v.advance_payment),
        project_manager_id: v.project_manager_id || null,
        project_director_id: v.project_director_id || null,
        engineering_manager_id: v.engineering_manager_id || null,
        planning_manager_id: v.planning_manager_id || null,
      }, onProjectUpdated);
    },
    mode,
  );
  const v = s.value;
  const autoMonths = v ? calcMonths(v.start_date, v.end_date) : "";
  return (
    <SectionFrame id="contract" title="Contract & people" description="Client, contract terms, dates and key roles." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Client" htmlFor="st_client"><ClientField id="st_client" value={v.client_id} onChange={(id) => s.patch({ client_id: id })} /></Field>
            <Field label="Contract number" htmlFor="st_cno"><input id="st_cno" value={v.contract_number} onChange={(e) => s.patch({ contract_number: e.target.value })} className={cn(inputClass, "font-mono")} /></Field>
            <Field label="Contract type" htmlFor="st_ctype">
              <select id="st_ctype" value={v.contract_type} onChange={(e) => s.patch({ contract_type: e.target.value })} className={inputClass}>
                <option value="">—</option>
                {CONTRACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Currency" htmlFor="st_cur">
              <select id="st_cur" value={v.currency} onChange={(e) => s.patch({ currency: e.target.value })} className={inputClass}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={`Contract value (${v.currency})`} htmlFor="st_cval">
              <input id="st_cval" inputMode="decimal" value={v.contract_value} onChange={(e) => s.patch({ contract_value: e.target.value.replace(/,/g, "") })} className={cn(inputClass, "tabular-nums")} />
            </Field>
            <Field label="DLP period (months)" htmlFor="st_dlp"><input id="st_dlp" value={v.dlp_period} onChange={(e) => s.patch({ dlp_period: e.target.value })} className={inputClass} /></Field>
            <Field label="Start date" htmlFor="st_start"><input id="st_start" type="date" value={v.start_date} onChange={(e) => s.patch({ start_date: e.target.value })} className={inputClass} /></Field>
            <Field label="Finish date" htmlFor="st_end"><input id="st_end" type="date" value={v.end_date} onChange={(e) => s.patch({ end_date: e.target.value })} className={inputClass} /></Field>
            <Field label="Duration (months)" htmlFor="st_dur">
              <div className="flex items-center gap-2">
                {v.duration_manual ? (
                  <input id="st_dur" type="number" min="0" value={v.duration} onChange={(e) => s.patch({ duration: e.target.value })} className={inputClass} />
                ) : (
                  <div className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{autoMonths || "—"}</div>
                )}
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={v.duration_manual} onChange={(e) => s.patch({ duration_manual: e.target.checked, duration: e.target.checked ? v.duration || autoMonths : v.duration })} className="h-3.5 w-3.5 accent-foreground" />
                  Manual
                </label>
              </div>
            </Field>
            <Field label="Retention (%)" htmlFor="st_ret"><input id="st_ret" type="number" step="0.01" value={v.retention} onChange={(e) => s.patch({ retention: e.target.value })} className={inputClass} /></Field>
            <Field label="Advance payment (%)" htmlFor="st_adv"><input id="st_adv" type="number" step="0.01" value={v.advance_payment} onChange={(e) => s.patch({ advance_payment: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
            <Field label="Project manager" htmlFor="st_pm"><StaffSelect id="st_pm" value={v.project_manager_id} onChange={(id) => s.patch({ project_manager_id: id })} staff={staff} /></Field>
            <Field label="Project director" htmlFor="st_pd"><StaffSelect id="st_pd" value={v.project_director_id} onChange={(id) => s.patch({ project_director_id: id })} staff={staff} /></Field>
            <Field label="Engineering manager" htmlFor="st_em"><StaffSelect id="st_em" value={v.engineering_manager_id} onChange={(id) => s.patch({ engineering_manager_id: id })} staff={staff} /></Field>
            <Field label="Planning manager" htmlFor="st_plm"><StaffSelect id="st_plm" value={v.planning_manager_id} onChange={(id) => s.patch({ planning_manager_id: id })} staff={staff} /></Field>
          </div>
        </div>
      )}
    </SectionFrame>
  );
}
