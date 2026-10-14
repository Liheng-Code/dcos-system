"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getProjectApprovalFlows, upsertProjectApprovalFlows,
  getProjectBudgetSettings, upsertProjectBudgetSettings,
  getProjectCalendar, upsertProjectCalendar,
  getProjectNotificationRules, upsertProjectNotificationRules,
  getProjectNumberingRules, upsertProjectNumberingRules,
  getProjectWbsSetup, upsertProjectWbsSetup,
  type ProjectApprovalFlow,
  type ProjectNotificationRule,
} from "@/lib/project-setup-service";
import { listWbsTemplates, setProjectWbsTemplateId, type WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";
import type { Project } from "@/lib/project/projects/project-types";
import { DEFAULT_BUDGET, DEFAULT_CALENDAR, DEFAULT_NUMBERING, DEFAULT_WBS_METHOD } from "@/lib/project/projects/setup-defaults";
import { Field, inputClass } from "@/components/project/projects/fields/project-fields";
import { SectionFrame, useSection, type SectionMode } from "@/components/project/projects/settings/section-frame";

// The sections stored in the project_* setup tables. Each starts from the company defaults when
// nothing has been saved yet, and saves its own table.

interface SetupSectionProps {
  project: Project;
  mode?: SectionMode;
}

const list = (csv: string) => csv.split(",").map((x) => x.trim()).filter(Boolean);

export function CalendarSection({ project, mode }: SetupSectionProps) {
  const s = useSection(
    async () => {
      const cal = await getProjectCalendar(project.id);
      return {
        working_days: cal?.working_days || DEFAULT_CALENDAR.working_days,
        working_hours: cal?.working_hours || DEFAULT_CALENDAR.working_hours,
        weekend_rule: cal?.weekend_rule || DEFAULT_CALENDAR.weekend_rule,
        holiday_calendar: cal?.holiday_calendar || DEFAULT_CALENDAR.holiday_calendar,
        shift_type: cal?.shift_type || DEFAULT_CALENDAR.shift_type,
        exception_days: cal?.exception_days || "",
      };
    },
    (v) => upsertProjectCalendar({ project_id: project.id, ...v }),
    mode,
  );
  const v = s.value;
  const select = (key: keyof NonNullable<typeof v>, label: string, options: string[]) => v && (
    <Field label={label} htmlFor={`cal_${key}`}>
      <select id={`cal_${key}`} value={v[key]} onChange={(e) => s.patch({ [key]: e.target.value })} className={inputClass}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Field>
  );
  return (
    <SectionFrame id="calendar" title="Calendar" description="Working days and hours used by the programme." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="grid gap-4 md:grid-cols-2">
          {select("working_days", "Working days", ["Monday to Saturday", "Monday to Friday", "Sunday to Thursday"])}
          <Field label="Working hours" htmlFor="cal_hours"><input id="cal_hours" value={v.working_hours} onChange={(e) => s.patch({ working_hours: e.target.value })} className={inputClass} /></Field>
          {select("weekend_rule", "Weekend rule", ["Sunday Off", "Saturday & Sunday Off", "Friday Off"])}
          {select("holiday_calendar", "Holiday calendar", ["Cambodia National Calendar", "International Calendar"])}
          {select("shift_type", "Shift type", ["Day Shift", "Night Shift", "Rotating Shift"])}
          <Field label="Exception days" htmlFor="cal_exc"><input id="cal_exc" value={v.exception_days} onChange={(e) => s.patch({ exception_days: e.target.value })} className={inputClass} /></Field>
        </div>
      )}
    </SectionFrame>
  );
}

const WBS_METHODS = [
  { value: "use_template", label: "Company WBS template", desc: "Sections and activities, repeated per floor; applied from the WBS builder" },
  { value: "create_manually", label: "Build manually", desc: "Define the structure from scratch" },
  { value: "import_excel", label: "Import from Excel", desc: "Upload the WBS as a spreadsheet" },
  { value: "clone_project", label: "Clone another project", desc: "Copy the WBS of an existing project" },
];

export function WbsSection({ project, mode }: SetupSectionProps) {
  const [templates, setTemplates] = useState<WbsTemplate[]>([]);
  useEffect(() => {
    listWbsTemplates({ activeOnly: true }).then(setTemplates).catch(() => setTemplates([]));
  }, []);
  const s = useSection(
    async () => {
      const wbs = await getProjectWbsSetup(project.id);
      return {
        method: wbs?.setup_method || DEFAULT_WBS_METHOD,
        templateId: (project as { wbs_template_id?: string | null }).wbs_template_id ?? "",
      };
    },
    async (v) => {
      await upsertProjectWbsSetup({ project_id: project.id, setup_method: v.method });
      await setProjectWbsTemplateId(project.id, v.method === "use_template" ? v.templateId || null : null);
    },
    mode,
  );
  const v = s.value;
  return (
    <SectionFrame id="wbs" title="WBS" description="How the work breakdown structure is built." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="grid gap-3 md:grid-cols-2">
          {WBS_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={v.method === m.value}
              onClick={() => s.patch({ method: m.value })}
              className={cn("rounded-lg border-2 p-4 text-left transition-colors", v.method === m.value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30")}
            >
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{m.desc}</p>
            </button>
          ))}
          {v.method === "use_template" && (
            <Field
              label="WBS template"
              htmlFor="wbs_tpl"
              className="md:col-span-2"
              hint={templates.length
                ? "Apply it from the WBS builder (Apply WBS template); you pick the buildings and levels there."
                : "No WBS templates yet: create one in Master Libraries › WBS Templates, or use Save as template on a project's WBS."}
            >
              <select id="wbs_tpl" value={v.templateId} onChange={(e) => s.patch({ templateId: e.target.value })} className={inputClass}>
                <option value="">— Choose later —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
    </SectionFrame>
  );
}

export function NumberingSection({ project, mode }: SetupSectionProps) {
  const s = useSection(
    async () => {
      const n = await getProjectNumberingRules(project.id);
      return {
        format_mask: n?.format_mask || DEFAULT_NUMBERING.format_mask,
        discipline_codes: (n?.discipline_codes ?? DEFAULT_NUMBERING.discipline_codes).join(", "),
        document_types: (n?.document_types ?? DEFAULT_NUMBERING.document_types).join(", "),
        revision_format: n?.revision_format || DEFAULT_NUMBERING.revision_format,
      };
    },
    (v) => upsertProjectNumberingRules({
      project_id: project.id,
      format_mask: v.format_mask,
      discipline_codes: list(v.discipline_codes),
      document_types: list(v.document_types),
      revision_format: v.revision_format,
    }),
    mode,
  );
  const v = s.value;
  return (
    <SectionFrame id="numbering" title="Document numbering" description="How drawings and documents on this project are numbered." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="font-mono text-sm">{v.format_mask}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">Example: {project.project_code}-STR-DWG-B01-L05-001-R02</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Format mask" htmlFor="num_mask"><input id="num_mask" value={v.format_mask} onChange={(e) => s.patch({ format_mask: e.target.value })} className={cn(inputClass, "font-mono")} /></Field>
            <Field label="Revision format" htmlFor="num_rev">
              <select id="num_rev" value={v.revision_format} onChange={(e) => s.patch({ revision_format: e.target.value })} className={inputClass}>
                {["R00, R01, R02", "Rev 0, Rev 1", "A, B, C"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Discipline codes (comma-separated)" htmlFor="num_disc"><input id="num_disc" value={v.discipline_codes} onChange={(e) => s.patch({ discipline_codes: e.target.value })} className={inputClass} /></Field>
            <Field label="Document types (comma-separated)" htmlFor="num_types"><input id="num_types" value={v.document_types} onChange={(e) => s.patch({ document_types: e.target.value })} className={inputClass} /></Field>
          </div>
        </div>
      )}
    </SectionFrame>
  );
}

const FLOW_TYPES = [
  { value: "drawing_approval", label: "Drawing approval" },
  { value: "rfi_response", label: "RFI response" },
  { value: "material_approval", label: "Material approval" },
  { value: "method_statement", label: "Method statement" },
  { value: "pr_po_approval", label: "PR / PO approval" },
  { value: "inspection_request", label: "Inspection request" },
  { value: "ncr_closeout", label: "NCR close-out" },
];

export function ApprovalsSection({ project, mode }: SetupSectionProps) {
  // Edited as text per flow ("Engineer → Lead → PM"), stored as role chains.
  const s = useSection(
    async () => {
      const flows = await getProjectApprovalFlows(project.id);
      return Object.fromEntries(FLOW_TYPES.map((f) => [f.value, (flows.find((x) => x.flow_type === f.value)?.role_chain ?? []).join(" → ")]));
    },
    (v) => upsertProjectApprovalFlows(project.id, Object.entries(v)
      .map(([flow_type, chain]): ProjectApprovalFlow => ({ project_id: project.id, flow_type, role_chain: chain.split(/→|->/).map((x) => x.trim()).filter(Boolean) }))
      .filter((f) => f.role_chain.length > 0)),
    mode,
  );
  const v = s.value;
  return (
    <SectionFrame id="approvals" title="Approval flows" description="Who approves what, in order. Separate roles with →." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="space-y-2">
          {FLOW_TYPES.map((f) => (
            <div key={f.value} className="grid items-center gap-2 md:grid-cols-[12rem_1fr]">
              <label htmlFor={`fl_${f.value}`} className="flex items-center gap-1.5 text-sm">
                {v[f.value] ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />}
                {f.label}
              </label>
              <input id={`fl_${f.value}`} placeholder="Engineer → Discipline Lead → PM → Consultant" value={v[f.value]} onChange={(e) => s.patch({ [f.value]: e.target.value })} className={inputClass} />
            </div>
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

export function BudgetSection({ project, mode }: SetupSectionProps) {
  const s = useSection(
    async () => {
      const b = await getProjectBudgetSettings(project.id);
      return {
        contingency: String(b?.contingency ?? DEFAULT_BUDGET.contingency),
        cost_code_template: b?.cost_code_template || DEFAULT_BUDGET.cost_code_template,
        approval_limit_rule: b?.approval_limit_rule || DEFAULT_BUDGET.approval_limit_rule,
      };
    },
    (v) => upsertProjectBudgetSettings({
      project_id: project.id,
      contingency: Number(v.contingency) || 0,
      cost_code_template: v.cost_code_template,
      approval_limit_rule: v.approval_limit_rule,
    }),
    mode,
  );
  const v = s.value;
  return (
    <SectionFrame id="budget" title="Budget" description="Contingency and cost control rules." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Main contract value">
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm tabular-nums">
              {project.contract_value != null ? `${project.currency} ${project.contract_value.toLocaleString()}` : "Not set (Contract & people)"}
            </div>
          </Field>
          <Field label="Contingency (%)" htmlFor="bud_cont"><input id="bud_cont" type="number" value={v.contingency} onChange={(e) => s.patch({ contingency: e.target.value })} className={inputClass} /></Field>
          <Field label="Cost code template" htmlFor="bud_cc">
            <select id="bud_cc" value={v.cost_code_template} onChange={(e) => s.patch({ cost_code_template: e.target.value })} className={inputClass}>
              {["Company Standard Cost Code", "Project Specific"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Approval limit rule" htmlFor="bud_lim">
            <select id="bud_lim" value={v.approval_limit_rule} onChange={(e) => s.patch({ approval_limit_rule: e.target.value })} className={inputClass}>
              {["By Role and Amount", "By Role Only"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      )}
    </SectionFrame>
  );
}

const RULES = [
  { value: "task_assigned", label: "Task assigned" },
  { value: "task_overdue", label: "Task overdue" },
  { value: "document_submitted", label: "Document submitted" },
  { value: "rfi_overdue", label: "RFI overdue" },
  { value: "pr_approval", label: "PR approval required" },
  { value: "ncr_created", label: "NCR created" },
  { value: "safety_incident", label: "Safety incident" },
  { value: "payment_approval", label: "Payment approval" },
];

export function NotificationsSection({ project, mode }: SetupSectionProps) {
  // rule_type -> channel; a rule that is off is absent.
  const s = useSection(
    async () => Object.fromEntries((await getProjectNotificationRules(project.id)).map((r) => [r.rule_type, r.channel])) as Record<string, string>,
    (v) => upsertProjectNotificationRules(project.id, Object.entries(v).map(([rule_type, channel]): ProjectNotificationRule => ({ project_id: project.id, rule_type, channel, enabled: true }))),
    mode,
  );
  const v = s.value;
  function toggle(rule: string) {
    if (!v) return;
    const next = { ...v };
    if (next[rule]) delete next[rule];
    else next[rule] = "in_app";
    s.setValue(next);
  }
  return (
    <SectionFrame id="notifications" title="Notifications" description="Which events notify the team, and how." mode={mode} dirty={s.dirty} saving={s.saving} loading={!v} onSave={s.submit} onReset={s.reset}>
      {v && (
        <div className="grid gap-2 md:grid-cols-2">
          {RULES.map((r) => (
            <div key={r.value} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", v[r.value] ? "border-primary/40 bg-primary/5" : "border-border")}>
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={!!v[r.value]} onChange={() => toggle(r.value)} className="h-4 w-4 accent-foreground" />
                {r.label}
              </label>
              {v[r.value] && (
                <select aria-label={`${r.label} channel`} value={v[r.value]} onChange={(e) => s.setValue({ ...v, [r.value]: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                  <option value="in_app">In-app</option>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="all">All channels</option>
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionFrame>
  );
}
