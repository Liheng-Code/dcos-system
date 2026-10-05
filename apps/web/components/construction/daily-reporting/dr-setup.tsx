"use client";

// Daily Reporting setup for one project (design §13.1): reporting units and
// their reporters, WBS scope, the reporting schedule, the approvers, and the
// per-project switch from the legacy site diary.

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addApprover,
  addUnitMember,
  getProjectDrEnabled,
  getProjectSchedule,
  getUnitScope,
  listApprovers,
  listSubcontracts,
  listUnitMembers,
  listUnits,
  listWbsNodes,
  removeApprover,
  saveProjectSchedule,
  saveUnit,
  searchProfiles,
  setProjectDrEnabled,
  setUnitMemberStatus,
  setUnitScope,
  type DrCapabilities,
  type ProfileOption,
  type ProjectApprover,
  type ReportingSchedule,
  type SubcontractOption,
  type UnitMember,
  type WbsNodeOption,
} from "@/lib/construction/daily-reporting/service";
import { SECTION_LABELS } from "@/lib/construction/daily-reporting/status";
import type { ReportingUnit, SectionKey } from "@/lib/construction/daily-reporting/types";
import { DrTelegramBindings } from "./dr-telegram";
import { Field, Flag, inputClass, SectionCard, todayIso } from "./dr-ui";

const OPTIONAL_SECTIONS: SectionKey[] = ["equipment", "materials"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNIT_STATUSES: ReportingUnit["status"][] = ["Planned", "Active", "Suspended", "Demobilised"];

function PersonPicker({ onPick, label }: { onPick: (p: ProfileOption) => void; label: string }) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<ProfileOption[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      searchProfiles(term).then(setOptions).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  return (
    <div className="relative">
      <input className={inputClass} placeholder={label} value={term} onChange={(e) => setTerm(e.target.value)} />
      {options.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(o);
                  setTerm("");
                  setOptions([]);
                }}
              >
                {o.full_name ?? o.email} <span className="text-xs text-muted-foreground">{o.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DrSetup({ projectId, capabilities }: { projectId: string; capabilities: DrCapabilities }) {
  const [units, setUnits] = useState<ReportingUnit[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);
  const [nodes, setNodes] = useState<WbsNodeOption[]>([]);
  const [schedule, setSchedule] = useState<ReportingSchedule | null>(null);
  const [approvers, setApprovers] = useState<ProjectApprover[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Partial<ReportingUnit> | null>(null);
  const [members, setMembers] = useState<UnitMember[]>([]);
  const [scope, setScope] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [approverRole, setApproverRole] = useState<"PRIMARY" | "ALTERNATE">("ALTERNATE");
  const [approverUntil, setApproverUntil] = useState("");

  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listUnits(projectId),
      listSubcontracts(projectId),
      listWbsNodes(projectId),
      getProjectSchedule(projectId),
      listApprovers(projectId),
      getProjectDrEnabled(projectId),
    ])
      .then(([u, s, n, sch, a, en]) => {
        if (cancelled) return;
        setUnits(u);
        setSubcontracts(s);
        setNodes(n);
        setSchedule(
          sch ?? { project_id: projectId, name: "Default", deadline_time: "18:00", reminder_time: "16:00", late_window_hours: 15, working_days: [1, 2, 3, 4, 5, 6], timezone: null },
        );
        setApprovers(a);
        setEnabled(en);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, refresh]);

  async function selectUnit(unit: Partial<ReportingUnit>) {
    setSelected(unit);
    if (unit.id) {
      const [m, sc] = await Promise.all([listUnitMembers(unit.id), getUnitScope(unit.id)]);
      setMembers(m);
      setScope(sc);
    } else {
      setMembers([]);
      setScope([]);
    }
  }

  async function saveSelected() {
    if (!selected) return;
    if (!selected.unit_code?.trim() || !selected.display_name?.trim()) return void toast.error("Unit code and name are required.");
    setSaving(true);
    try {
      const saved = await saveUnit({
        id: selected.id,
        project_id: projectId,
        unit_code: selected.unit_code.trim(),
        unit_type: selected.unit_type ?? "SUBCONTRACTOR",
        display_name: selected.display_name.trim(),
        subcontract_id: selected.unit_type === "IN_HOUSE_TEAM" ? null : selected.subcontract_id ?? null,
        status: selected.status ?? "Planned",
        mobilised_at: selected.mobilised_at ?? null,
        demobilised_at: selected.demobilised_at ?? null,
        required_sections: selected.required_sections ?? [],
        evidence_min_policy: selected.evidence_min_policy ?? { per_activity: 1, per_report: 0, severity: "WARNING" },
      });
      await setUnitScope(saved.id, scope);
      toast.success("Reporting unit saved.");
      reload();
      await selectUnit(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const policy = selected?.evidence_min_policy ?? {};
  const activeReporters = members.filter((m) => m.status === "active" && m.member_role === "REPORTER").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        title="Daily Reporting for this project"
        action={<Flag tone={enabled ? "good" : "neutral"}>{enabled ? "Switched on" : "Switched off"}</Flag>}
      >
        <p className="text-sm text-muted-foreground">
          When switched on, reminders, missing-report checks and escalations run for this project&apos;s active units. Reports can be
          submitted and approved either way. Switch it on only after the units, reporters and approver below are set up.
        </p>
        <Button
          className="mt-3"
          variant={enabled ? "outline" : "default"}
          onClick={async () => {
            try {
              await setProjectDrEnabled(projectId, !enabled);
              setEnabled(!enabled);
              toast.success(!enabled ? "Daily Reporting switched on." : "Daily Reporting switched off.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {enabled ? "Switch off" : "Switch on"}
        </Button>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard
          title="Reporting units"
          action={
            <Button size="sm" variant="outline" onClick={() => void selectUnit({ unit_type: "SUBCONTRACTOR", status: "Planned", required_sections: [] })}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          }
        >
          {units.length === 0 ? <p className="text-sm text-muted-foreground">No units yet. Create one per subcontractor or in-house crew.</p> : null}
          <ul className="space-y-1">
            {units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => void selectUnit(u)}
                  className={cn("w-full rounded-md border px-3 py-2 text-left text-sm", selected?.id === u.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
                >
                  <span className="font-medium">{u.display_name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {u.unit_code} · {u.unit_type === "SUBCONTRACTOR" ? "Subcontractor" : "In-house"}
                    <Flag tone={u.status === "Active" ? "good" : "neutral"}>{u.status}</Flag>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-4 md:col-span-2">
          {!selected ? (
            <SectionCard title="Unit details">
              <p className="text-sm text-muted-foreground">Select a unit, or create a new one.</p>
            </SectionCard>
          ) : (
            <>
              <SectionCard
                title={selected.id ? "Unit details" : "New reporting unit"}
                action={
                  <Button size="sm" disabled={saving} onClick={() => void saveSelected()}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save
                  </Button>
                }
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Unit code" hint="e.g. SC-A2, IH-A1">
                    <input className={inputClass} value={selected.unit_code ?? ""} onChange={(e) => setSelected({ ...selected, unit_code: e.target.value })} />
                  </Field>
                  <Field label="Name">
                    <input className={inputClass} value={selected.display_name ?? ""} onChange={(e) => setSelected({ ...selected, display_name: e.target.value })} />
                  </Field>
                  <Field label="Type">
                    <select className={inputClass} value={selected.unit_type ?? "SUBCONTRACTOR"} onChange={(e) => setSelected({ ...selected, unit_type: e.target.value as ReportingUnit["unit_type"] })}>
                      <option value="SUBCONTRACTOR">Subcontractor</option>
                      <option value="IN_HOUSE_TEAM">In-house team</option>
                    </select>
                  </Field>
                  {selected.unit_type !== "IN_HOUSE_TEAM" ? (
                    <Field label="Subcontract">
                      <select className={inputClass} value={selected.subcontract_id ?? ""} onChange={(e) => setSelected({ ...selected, subcontract_id: e.target.value || null })}>
                        <option value="">Not linked</option>
                        {subcontracts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.subcontract_no} {s.scope_of_work ? `— ${s.scope_of_work.slice(0, 40)}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Status" hint="Missing-report checks run only while Active.">
                    <select className={inputClass} value={selected.status ?? "Planned"} onChange={(e) => setSelected({ ...selected, status: e.target.value as ReportingUnit["status"] })}>
                      {UNIT_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Mobilised on">
                    <input type="date" className={inputClass} value={selected.mobilised_at ?? ""} onChange={(e) => setSelected({ ...selected, mobilised_at: e.target.value || null })} />
                  </Field>
                  <Field label="Photos required per activity">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={policy.per_activity ?? 0}
                      onChange={(e) => setSelected({ ...selected, evidence_min_policy: { ...policy, per_activity: Number(e.target.value) || 0 } })}
                    />
                  </Field>
                  <Field label="If photos are missing">
                    <select className={inputClass} value={policy.severity ?? "WARNING"} onChange={(e) => setSelected({ ...selected, evidence_min_policy: { ...policy, severity: e.target.value as "ERROR" | "WARNING" } })}>
                      <option value="WARNING">Warn the PM</option>
                      <option value="ERROR">Block submission</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-medium">Extra required sections</p>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {OPTIONAL_SECTIONS.map((s) => {
                      const on = (selected.required_sections ?? []).includes(s);
                      return (
                        <label key={s} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={on}
                            onChange={() =>
                              setSelected({
                                ...selected,
                                required_sections: on ? (selected.required_sections ?? []).filter((x) => x !== s) : [...(selected.required_sections ?? []), s],
                              })
                            }
                          />
                          {SECTION_LABELS[s]}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-medium">WBS scope</p>
                  <p className="text-xs text-muted-foreground">
                    The unit can report only on activities under the selected nodes. Nothing selected = the whole project.
                  </p>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {nodes.length === 0 ? <p className="text-xs text-muted-foreground">This project has no WBS yet.</p> : null}
                    {nodes.map((n) => (
                      <label key={n.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={scope.includes(n.id)}
                          onChange={() => setScope((sc) => (sc.includes(n.id) ? sc.filter((x) => x !== n.id) : [...sc, n.id]))}
                        />
                        <span className="tabular-nums text-muted-foreground">{n.wbs_code}</span> {n.wbs_name}
                      </label>
                    ))}
                  </div>
                </div>
                {selected.status === "Active" && selected.id && activeReporters === 0 ? (
                  <p className="mt-3 text-sm text-amber-700">This unit is Active but has no reporter. Nobody can submit its report.</p>
                ) : null}
              </SectionCard>

              {selected.id ? (
                <SectionCard title="Reporters and viewers">
                  <div className="mb-3 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <PersonPicker
                        label="Add a person by name or email"
                        onPick={async (p) => {
                          try {
                            await addUnitMember({ unit_id: selected.id as string, user_id: p.id, member_role: "REPORTER", is_lead: members.length === 0, valid_to: null });
                            setMembers(await listUnitMembers(selected.id as string));
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      />
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    A reporter must already have a DCOS account. Create subcontractor accounts in User Management with the Subcontractor role first.
                  </p>
                  {members.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : null}
                  <ul className="space-y-1">
                    {members.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <span>
                          {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                          {m.is_lead ? <span className="ml-2"><Flag tone="info">Lead</Flag></span> : null}
                          <span className="ml-2 text-xs text-muted-foreground">{m.member_role.toLowerCase()}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Flag tone={m.status === "active" ? "good" : "neutral"}>{m.status}</Flag>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await setUnitMemberStatus(m.id, m.status === "active" ? "revoked" : "active");
                                setMembers(await listUnitMembers(selected.id as string));
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : String(e));
                              }
                            }}
                          >
                            {m.status === "active" ? "Revoke" : "Restore"}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
            </>
          )}
        </div>
      </div>

      {schedule ? (
        <SectionCard
          title="Reporting schedule"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await saveProjectSchedule(schedule);
                  toast.success("Schedule saved.");
                  reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              <Save className="mr-1 h-4 w-4" /> Save
            </Button>
          }
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Reminder">
              <input type="time" className={inputClass} value={schedule.reminder_time.slice(0, 5)} onChange={(e) => setSchedule({ ...schedule, reminder_time: e.target.value })} />
            </Field>
            <Field label="Deadline">
              <input type="time" className={inputClass} value={schedule.deadline_time.slice(0, 5)} onChange={(e) => setSchedule({ ...schedule, deadline_time: e.target.value })} />
            </Field>
            <Field label="Late window (hours)" hint="After this a report is flagged backdated.">
              <input type="number" min={0} max={72} className={inputClass} value={schedule.late_window_hours} onChange={(e) => setSchedule({ ...schedule, late_window_hours: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Time zone" hint="Blank = the project's time zone.">
              <input className={inputClass} placeholder="Asia/Phnom_Penh" value={schedule.timezone ?? ""} onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value || null })} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const day = i + 1;
              const on = schedule.working_days.includes(day);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSchedule({ ...schedule, working_days: on ? schedule.working_days.filter((x) => x !== day) : [...schedule.working_days, day].sort() })}
                  className={cn("h-9 rounded-md border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      <DrTelegramBindings projectId={projectId} units={units} canManage={capabilities.canReview} />

      <SectionCard title="Approvers">
        <p className="text-sm text-muted-foreground">
          The primary approver reviews and approves reports and publishes the daily summary. With no primary approver set, the project&apos;s
          Project Manager is the approver. An alternate has the same authority inside its dates, for leave or absence. Only a system
          administrator can change approvers.
        </p>
        <ul className="mt-3 space-y-1">
          {approvers.length === 0 ? <li className="text-sm text-muted-foreground">No approvers set — the Project Manager approves.</li> : null}
          {approvers.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span>
                {a.profile?.full_name ?? a.profile?.email ?? a.user_id}
                <span className="ml-2"><Flag tone={a.approver_role === "PRIMARY" ? "info" : "neutral"}>{a.approver_role === "PRIMARY" ? "Primary" : "Alternate"}</Flag></span>
                <span className="ml-2 text-xs text-muted-foreground">
                  from {a.valid_from}
                  {a.valid_to ? ` to ${a.valid_to}` : ""}
                </span>
              </span>
              {capabilities.isSystemAdmin ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await removeApprover(a.id);
                      setApprovers(await listApprovers(projectId));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {capabilities.isSystemAdmin ? (
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select aria-label="Approver role" className={inputClass} value={approverRole} onChange={(e) => setApproverRole(e.target.value as "PRIMARY" | "ALTERNATE")}>
              <option value="ALTERNATE">Alternate</option>
              <option value="PRIMARY">Primary</option>
            </select>
            <input type="date" aria-label="Valid until" className={inputClass} value={approverUntil} min={todayIso()} onChange={(e) => setApproverUntil(e.target.value)} />
            <div className="md:col-span-2">
              <PersonPicker
                label="Add an approver by name or email"
                onPick={async (p) => {
                  try {
                    await addApprover({ project_id: projectId, user_id: p.id, approver_role: approverRole, valid_from: todayIso(), valid_to: approverUntil || null });
                    setApprovers(await listApprovers(projectId));
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
