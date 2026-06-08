"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface StakeholderRow {
  id: string;
  organization_name: string;
  stakeholder_type: string;
}

interface TeamMemberRow {
  id: string;
  stakeholder_staff_id: string;
  role_on_project: string | null;
  full_name: string;
  job_title: string | null;
}

interface TeamRow {
  id: string;
  team_name: string;
  placeholder_label: string | null;
  members: TeamMemberRow[];
}

interface ProjectStakeholderEntry {
  id: string;
  stakeholder_id: string;
  role_in_project: string | null;
  organization_name: string;
  stakeholder_type: string;
  teams: TeamRow[];
}

interface StaffEntry {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface ProjectStakeholdersTabProps {
  projectId: string;
}

export function ProjectStakeholdersTab({ projectId }: ProjectStakeholdersTabProps) {
  const supabase = useMemo(() => createClient(), []);

  const [entries, setEntries] = useState<ProjectStakeholderEntry[]>([]);
  const [allStakeholders, setAllStakeholders] = useState<StakeholderRow[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Add stakeholder panel state
  const [addingStakeholder, setAddingStakeholder] = useState(false);
  const [newStakeholderId, setNewStakeholderId] = useState("");
  const [saving, setSaving] = useState(false);

  // Add member panel state: key = project_stakeholder_teams.id
  const [addingMemberForTeam, setAddingMemberForTeam] = useState<string | null>(null);
  const [teamStaffCache, setTeamStaffCache] = useState<Record<string, StaffEntry[]>>({});
  const [newMemberStaffId, setNewMemberStaffId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");

  async function load() {
    setLoading(true);
    const [psRes, teamRes, allSRes, rolesRes] = await Promise.all([
      supabase.from("project_stakeholders")
        .select("id, stakeholder_id, role_in_project, stakeholders(organization_name, stakeholder_type)")
        .eq("project_id", projectId),
      supabase.from("project_stakeholder_teams")
        .select("id, stakeholder_id, team_name, placeholder_id, template_placeholders(label)")
        .eq("project_id", projectId),
      supabase.from("stakeholders").select("id, organization_name, stakeholder_type").order("organization_name"),
      supabase.from("roles").select("code, name").order("level"),
    ]);

    if (allSRes.data) setAllStakeholders(allSRes.data as StakeholderRow[]);
    if (rolesRes.data) setRoles(rolesRes.data as { code: string; name: string }[]);

    const teamsMap: Record<string, TeamRow[]> = {};
    const teamIds: string[] = [];
    if (teamRes.data) {
      for (const t of teamRes.data as unknown as {
        id: string; stakeholder_id: string; team_name: string;
        placeholder_id: string | null;
        template_placeholders: { label: string } | null;
      }[]) {
        if (!teamsMap[t.stakeholder_id]) teamsMap[t.stakeholder_id] = [];
        teamsMap[t.stakeholder_id].push({
          id: t.id,
          team_name: t.team_name,
          placeholder_label: t.template_placeholders?.label ?? null,
          members: [],
        });
        teamIds.push(t.id);
      }
    }

    if (teamIds.length > 0) {
      const { data: memberData } = await supabase
        .from("project_team_members")
        .select("id, project_stakeholder_team_id, stakeholder_staff_id, role_on_project, stakeholder_staff(full_name, job_title)")
        .in("project_stakeholder_team_id", teamIds);
      if (memberData) {
        for (const m of memberData as unknown as {
          id: string; project_stakeholder_team_id: string; stakeholder_staff_id: string;
          role_on_project: string | null;
          stakeholder_staff: { full_name: string; job_title: string | null } | null;
        }[]) {
          for (const teams of Object.values(teamsMap)) {
            const team = teams.find((t) => t.id === m.project_stakeholder_team_id);
            if (team) {
              team.members.push({
                id: m.id,
                stakeholder_staff_id: m.stakeholder_staff_id,
                role_on_project: m.role_on_project,
                full_name: m.stakeholder_staff?.full_name ?? "—",
                job_title: m.stakeholder_staff?.job_title ?? null,
              });
            }
          }
        }
      }
    }

    const result: ProjectStakeholderEntry[] = [];
    if (psRes.data) {
      for (const row of psRes.data as unknown as {
        id: string; stakeholder_id: string; role_in_project: string | null;
        stakeholders: { organization_name: string; stakeholder_type: string } | null;
      }[]) {
        result.push({
          id: row.id,
          stakeholder_id: row.stakeholder_id,
          role_in_project: row.role_in_project,
          organization_name: row.stakeholders?.organization_name ?? "—",
          stakeholder_type: row.stakeholders?.stakeholder_type ?? "—",
          teams: teamsMap[row.stakeholder_id] ?? [],
        });
      }
    }

    setEntries(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]);

  async function loadStaffForStakeholder(stakeholderId: string) {
    if (teamStaffCache[stakeholderId]) return;
    const { data } = await supabase.from("stakeholder_staff")
      .select("id, full_name, job_title")
      .eq("stakeholder_id", stakeholderId);
    if (data) setTeamStaffCache((prev) => ({ ...prev, [stakeholderId]: data as StaffEntry[] }));
  }

  async function handleAddStakeholder() {
    if (!newStakeholderId) return;
    setSaving(true);
    const stakeholder = allStakeholders.find((s) => s.id === newStakeholderId);
    const { error } = await supabase.from("project_stakeholders").insert({
      project_id: projectId,
      stakeholder_id: newStakeholderId,
      role_in_project: stakeholder?.stakeholder_type ?? null,
    });
    if (error) { toast.error(error.message); }
    else { toast.success("Stakeholder added"); setNewStakeholderId(""); setAddingStakeholder(false); await load(); }
    setSaving(false);
  }

  async function handleRemoveStakeholder(psId: string, stakeholderId: string) {
    setSaving(true);
    // Cascade: delete teams and members first
    const { data: teams } = await supabase.from("project_stakeholder_teams")
      .select("id").eq("project_id", projectId).eq("stakeholder_id", stakeholderId);
    if (teams && teams.length > 0) {
      await supabase.from("project_team_members")
        .delete().in("project_stakeholder_team_id", teams.map((t: { id: string }) => t.id));
      await supabase.from("project_stakeholder_teams")
        .delete().eq("project_id", projectId).eq("stakeholder_id", stakeholderId);
    }
    await supabase.from("project_stakeholder_mappings")
      .delete().eq("project_id", projectId).eq("stakeholder_id", stakeholderId);
    const { error } = await supabase.from("project_stakeholders").delete().eq("id", psId);
    if (error) toast.error(error.message);
    else { toast.success("Stakeholder removed"); await load(); }
    setSaving(false);
  }

  async function handleAddMember(teamId: string, stakeholderId: string) {
    if (!newMemberStaffId) return;
    setSaving(true);

    // Ensure a team row exists (create one if the stakeholder has no teams yet)
    let targetTeamId = teamId;
    if (!targetTeamId) {
      const { data: team, error: tErr } = await supabase.from("project_stakeholder_teams").insert({
        project_id: projectId,
        stakeholder_id: stakeholderId,
        team_name: "Default Team",
      }).select().single();
      if (tErr || !team) { toast.error("Failed to create team"); setSaving(false); return; }
      targetTeamId = team.id;
    }

    const { error } = await supabase.from("project_team_members").insert({
      project_stakeholder_team_id: targetTeamId,
      stakeholder_staff_id: newMemberStaffId,
      role_on_project: newMemberRole || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Team member added"); setNewMemberStaffId(""); setNewMemberRole(""); setAddingMemberForTeam(null); await load(); }
    setSaving(false);
  }

  async function handleRemoveMember(memberId: string) {
    setSaving(true);
    const { error } = await supabase.from("project_team_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else { toast.success("Member removed"); await load(); }
    setSaving(false);
  }

  const assignedIds = new Set(entries.map((e) => e.stakeholder_id));
  const unassigned = allStakeholders.filter((s) => !assignedIds.has(s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Project Team & Stakeholders</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{entries.length}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg"
          onClick={() => setAddingStakeholder(!addingStakeholder)}>
          <Plus className="h-3 w-3 mr-1" /> Add Stakeholder
        </Button>
      </div>

      {/* Add stakeholder inline form */}
      {addingStakeholder && (
        <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 p-3">
          <select
            value={newStakeholderId}
            onChange={(e) => setNewStakeholderId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-hidden"
          >
            <option value="">— Select stakeholder —</option>
            {unassigned.map((s) => (
              <option key={s.id} value={s.id}>{s.organization_name}</option>
            ))}
          </select>
          <Button size="sm" className="h-7 text-xs rounded-lg" onClick={handleAddStakeholder} disabled={saving || !newStakeholderId}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => setAddingStakeholder(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !addingStakeholder && (
        <div className="rounded-2xl border border-dashed bg-muted/20 py-10 text-center">
          <p className="text-sm text-muted-foreground">No stakeholders assigned to this project yet.</p>
        </div>
      )}

      {/* Stakeholder cards */}
      {entries.map((entry) => {
        const allMembers = entry.teams.flatMap((t) => t.members);
        const teamId = entry.teams[0]?.id ?? "";
        const isAddingMember = addingMemberForTeam === entry.stakeholder_id;
        const staffList = teamStaffCache[entry.stakeholder_id] ?? [];

        return (
          <div key={entry.id} className="rounded-2xl border bg-white">
            {/* Stakeholder header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="font-semibold text-sm">{entry.organization_name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.stakeholder_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  {entry.teams[0]?.placeholder_label && (
                    <span className="ml-2 text-primary">· {entry.teams[0].placeholder_label}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm" variant="outline" className="h-7 text-xs rounded-lg"
                  onClick={() => {
                    if (isAddingMember) {
                      setAddingMemberForTeam(null);
                    } else {
                      setAddingMemberForTeam(entry.stakeholder_id);
                      loadStaffForStakeholder(entry.stakeholder_id);
                    }
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Member
                </Button>
                <button
                  type="button"
                  onClick={() => handleRemoveStakeholder(entry.id, entry.stakeholder_id)}
                  disabled={saving}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Add member form */}
            {isAddingMember && (
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
                <select
                  value={newMemberStaffId}
                  onChange={(e) => setNewMemberStaffId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden"
                >
                  <option value="">Select staff...</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}{s.job_title ? ` — ${s.job_title}` : ""}</option>
                  ))}
                </select>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  className="w-36 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden"
                >
                  <option value="">Role...</option>
                  {roles.map((r) => (<option key={r.code} value={r.code}>{r.name}</option>))}
                </select>
                <Button size="sm" className="h-7 text-xs rounded-lg" onClick={() => handleAddMember(teamId, entry.stakeholder_id)} disabled={saving || !newMemberStaffId}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </Button>
              </div>
            )}

            {/* Members list */}
            <div className="px-4 py-2">
              {allMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No team members assigned.</p>
              ) : (
                <div className="space-y-1">
                  {allMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium">{m.full_name}</span>
                        {m.job_title && <span className="ml-1.5 text-muted-foreground">{m.job_title}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.role_on_project && (
                          <span className="text-muted-foreground">{m.role_on_project}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          disabled={saving}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
