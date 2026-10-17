"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getStakeholderById, listProfilesOfIdAndFullName, updateProjectByIdReturning } from "@/lib/project/projects/projects-queries";
import type { Project } from "@/lib/project/projects/project-types";
import { settingsHref } from "@/lib/project/projects/project-routes";
import { durationAfterDateChange } from "@/lib/project/projects/project-dates";
import { sectorLabel, buildingTypeLabel } from "@/lib/project-categories";

// Status is set here except Active, which goes through activation (the setup checklist).
const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];
const STATUS_LABELS: Record<string, string> = { active: "Active", ...Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])) };

type EditField = "pm" | "dates" | "status";

interface KeyFactsCardProps {
  project: Project;
  onUpdated: (project: Project) => void;
}

// The facts people change most often are edited in place (PM, dates, status); the rest open the
// matching section of Settings.
export function KeyFactsCard({ project, onUpdated }: KeyFactsCardProps) {
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ pm: "", start: "", end: "", status: "" });

  useEffect(() => {
    listProfilesOfIdAndFullName("id, full_name").then(({ data }) => setStaff((data ?? []) as { id: string; full_name: string }[]));
  }, []);
  useEffect(() => {
    if (!project.client_id) return;
    getStakeholderById(project.client_id).then(({ data }) => setClientName((data as { organization_name: string } | null)?.organization_name ?? null));
  }, [project.client_id]);

  function startEdit(field: EditField) {
    setDraft({
      pm: project.project_manager_id ?? "",
      start: project.start_date ?? "",
      end: project.end_date ?? "",
      status: project.project_status,
    });
    setEditing(field);
  }

  async function save(patch: Partial<Project>) {
    setSaving(true);
    const { data, error } = await updateProjectByIdReturning({ ...patch, updated_at: new Date().toISOString() }, project.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    onUpdated(data as Project);
    toast.success("Saved");
  }

  function saveDates() {
    const start = draft.start || null;
    const end = draft.end || null;
    if (start && end && end < start) { toast.error("The end date is before the start date."); return; }
    void save({ start_date: start, end_date: end, duration: durationAfterDateChange(project, start, end) });
  }

  const pmName = project.project_manager_id ? (staff.find((s) => s.id === project.project_manager_id)?.full_name ?? "…") : null;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);
  const keyHandler = (onEnter: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onEnter();
    if (e.key === "Escape") setEditing(null);
  };
  const inputClass = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-hidden focus:border-primary";

  return (
    <section className="rounded-xl border border-border bg-card">
      <h3 className="border-b px-5 py-3 text-sm font-semibold">Key facts</h3>
      <dl className="divide-y text-sm">
        <Fact label="Project manager" editable={!editing} onEdit={() => startEdit("pm")}>
          {editing === "pm" ? (
            <select
              autoFocus
              disabled={saving}
              value={draft.pm}
              onChange={(e) => void save({ project_manager_id: e.target.value || null })}
              onKeyDown={keyHandler(() => setEditing(null))}
              onBlur={() => !saving && setEditing(null)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          ) : (pmName ?? <Muted>Unassigned</Muted>)}
        </Fact>

        <Fact label="Dates" editable={!editing} onEdit={() => startEdit("dates")}>
          {editing === "dates" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="date" autoFocus value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} onKeyDown={keyHandler(saveDates)} className={cn(inputClass, "w-auto")} aria-label="Start date" />
              <span className="text-muted-foreground">→</span>
              <input type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} onKeyDown={keyHandler(saveDates)} className={cn(inputClass, "w-auto")} aria-label="End date" />
              <button type="button" onClick={saveDates} disabled={saving} className="rounded p-1 text-emerald-600 hover:bg-muted" aria-label="Save dates">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : project.start_date || project.end_date ? (
            <span>
              {fmt(project.start_date) ?? "—"} → {fmt(project.end_date) ?? "—"}
              {project.duration && <span className="text-muted-foreground"> · {project.duration} months</span>}
            </span>
          ) : <Muted>Not set</Muted>}
        </Fact>

        <Fact label="Status" editable={!editing} onEdit={() => startEdit("status")}>
          {editing === "status" ? (
            <select
              autoFocus
              disabled={saving}
              value={draft.status}
              onChange={(e) => void save({ project_status: e.target.value })}
              onKeyDown={keyHandler(() => setEditing(null))}
              onBlur={() => !saving && setEditing(null)}
              className={inputClass}
            >
              {(project.project_status === "active" || project.project_status === "on_hold" || project.project_status === "archived") && (
                <option value="active">Active</option>
              )}
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (STATUS_LABELS[project.project_status] ?? project.project_status)}
        </Fact>

        <Fact label="Client" href={settingsHref(project.project_code, "contract")}>{clientName ?? (project.client_id ? "…" : <Muted>Not set</Muted>)}</Fact>
        <Fact label="Contract" href={settingsHref(project.project_code, "contract")}>
          {project.contract_value != null
            ? <span>{project.currency} {project.contract_value.toLocaleString()}{project.contract_type && <span className="text-muted-foreground"> · {project.contract_type.replace(/_/g, " ")}</span>}</span>
            : <Muted>Not set</Muted>}
        </Fact>
        <Fact label="Sector" href={settingsHref(project.project_code, "general")}>
          {project.category ? `${sectorLabel(project.category)}${project.building_type ? ` › ${buildingTypeLabel(project.building_type)}` : ""}` : <Muted>Not set</Muted>}
        </Fact>
        <Fact label="Location" href={settingsHref(project.project_code, "general")}>{project.location ?? <Muted>Not set</Muted>}</Fact>
      </dl>
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function Fact({ label, children, editable, onEdit, href }: {
  label: string;
  children: ReactNode;
  editable?: boolean;
  onEdit?: () => void;
  href?: string;
}) {
  return (
    <div className="group flex items-start gap-3 px-5 py-2.5">
      <dt className="w-32 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
      {onEdit && editable && (
        <button type="button" onClick={onEdit} className="shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label={`Edit ${label.toLowerCase()}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {href && (
        <Link href={href} className="shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label={`Change ${label.toLowerCase()}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
