"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export interface StakeholderEntry {
  id: string;
  organization_name: string;
  stakeholder_type: string;
}

export interface StakeholderStaffEntry {
  id: string;
  full_name: string;
  job_title: string | null;
}

export interface TeamAssignment {
  staffId: string;
  staffName: string;
  roleOnProject: string;
}

export interface TemplatePlaceholder {
  id: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export interface StakeholderTemplate {
  id: string;
  name: string;
  description: string | null;
  template_placeholders: TemplatePlaceholder[];
}

export function useStakeholderSteps(projectId: string | null) {
  const supabase = useMemo(() => createClient(), []);

  const [stakeholders, setStakeholders] = useState<StakeholderEntry[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string; type: string }[]>([]);
  const [templates, setTemplates] = useState<StakeholderTemplate[]>([]);

  const [selectedStakeholderIds, setSelectedStakeholderIds] = useState<Set<string>>(new Set());
  const [teamAssignments, setTeamAssignments] = useState<Record<string, TeamAssignment[]>>({});
  const [stakeholderStaff, setStakeholderStaff] = useState<Record<string, StakeholderStaffEntry[]>>({});
  const [addingStakeholderKey, setAddingStakeholderKey] = useState<string | null>(null);
  const [addMemberStaffId, setAddMemberStaffId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("");

  // Template mode
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // placeholder_id -> stakeholder_id
  const [placeholderMappings, setPlaceholderMappings] = useState<Record<string, string>>({});

  // Load reference data
  useEffect(() => {
    supabase.from("stakeholders").select("id, organization_name, stakeholder_type").order("organization_name")
      .then(({ data }) => { if (data) setStakeholders(data as StakeholderEntry[]); });
    supabase.from("roles").select("code, name, type").order("type").order("level")
      .then(({ data }) => { if (data) setRoles(data as { code: string; name: string; type: string }[]); });
    supabase.from("stakeholder_templates")
      .select("id, name, description, template_placeholders(id, label, description, sort_order)")
      .then(({ data }) => { if (data) setTemplates(data as StakeholderTemplate[]); });
  }, [supabase]);

  // Load existing assignments when editing a project (waits for stakeholders list to be ready)
  useEffect(() => {
    if (!projectId || stakeholders.length === 0) return;
    (async () => {
      const { data: rows } = await supabase
        .from("project_stakeholders")
        .select("stakeholder_id")
        .eq("project_id", projectId);
      if (!rows || rows.length === 0) return;

      const ids = (rows as { stakeholder_id: string }[]).map((r) => r.stakeholder_id);
      setSelectedStakeholderIds(new Set(ids));

      const staffMap: Record<string, StakeholderStaffEntry[]> = {};
      for (const id of ids) {
        const { data: staffRows } = await supabase
          .from("stakeholder_staff")
          .select("id, full_name, job_title")
          .eq("stakeholder_id", id);
        if (staffRows) staffMap[id] = staffRows as StakeholderStaffEntry[];
      }
      setStakeholderStaff(staffMap);

      const { data: teams } = await supabase
        .from("project_stakeholder_teams")
        .select("id, stakeholder_id")
        .eq("project_id", projectId);
      if (teams && teams.length > 0) {
        const teamMap: Record<string, string> = {};
        for (const t of teams as { id: string; stakeholder_id: string }[]) teamMap[t.id] = t.stakeholder_id;
        const { data: members } = await supabase
          .from("project_team_members")
          .select("project_stakeholder_team_id, stakeholder_staff_id, role_on_project")
          .in("project_stakeholder_team_id", (teams as { id: string }[]).map((t) => t.id));
        if (members) {
          const assignments: Record<string, TeamAssignment[]> = {};
          for (const m of members as { project_stakeholder_team_id: string; stakeholder_staff_id: string; role_on_project: string | null }[]) {
            const sid = teamMap[m.project_stakeholder_team_id];
            if (!sid) continue;
            const staffName = staffMap[sid]?.find((p) => p.id === m.stakeholder_staff_id)?.full_name ?? m.stakeholder_staff_id;
            if (!assignments[sid]) assignments[sid] = [];
            assignments[sid].push({ staffId: m.stakeholder_staff_id, staffName, roleOnProject: m.role_on_project ?? "" });
          }
          setTeamAssignments(assignments);
        }
      }

      // Load template mappings if they exist
      const { data: mappingRows } = await supabase
        .from("project_stakeholder_mappings")
        .select("placeholder_id, stakeholder_id")
        .eq("project_id", projectId);
      if (mappingRows && mappingRows.length > 0) {
        const map: Record<string, string> = {};
        for (const m of mappingRows as { placeholder_id: string; stakeholder_id: string }[]) {
          map[m.placeholder_id] = m.stakeholder_id;
        }
        setPlaceholderMappings(map);
        setUseTemplate(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stakeholders.length]);

  function loadStaffForStakeholder(id: string) {
    if (stakeholderStaff[id]) return;
    supabase.from("stakeholder_staff").select("id, full_name, job_title").eq("stakeholder_id", id).then(({ data }) => {
      if (data) setStakeholderStaff((prev) => ({ ...prev, [id]: data as StakeholderStaffEntry[] }));
    });
  }

  function handleToggleStakeholder(id: string) {
    setSelectedStakeholderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    loadStaffForStakeholder(id);
  }

  function handleMapPlaceholder(placeholderId: string, stakeholderId: string) {
    setPlaceholderMappings((prev) => ({ ...prev, [placeholderId]: stakeholderId }));
    if (stakeholderId) {
      setSelectedStakeholderIds((prev) => new Set([...prev, stakeholderId]));
      loadStaffForStakeholder(stakeholderId);
    }
  }

  function handleAddTeamMember(stakeholderId: string) {
    if (!addMemberStaffId) return;
    const staffName = stakeholderStaff[stakeholderId]?.find((s) => s.id === addMemberStaffId)?.full_name ?? addMemberStaffId;
    setTeamAssignments((prev) => ({
      ...prev,
      [stakeholderId]: [...(prev[stakeholderId] ?? []), { staffId: addMemberStaffId, staffName, roleOnProject: addMemberRole }],
    }));
    setAddMemberStaffId("");
    setAddMemberRole("");
    setAddingStakeholderKey(null);
  }

  function handleRemoveTeamMember(stakeholderId: string, index: number) {
    setTeamAssignments((prev) => ({
      ...prev,
      [stakeholderId]: prev[stakeholderId].filter((_, i) => i !== index),
    }));
  }

  async function saveStakeholderAssignments(targetProjectId: string) {
    if (selectedStakeholderIds.size === 0) return;

    await supabase.from("project_stakeholders").delete().eq("project_id", targetProjectId);
    await supabase.from("project_stakeholder_teams").delete().eq("project_id", targetProjectId);
    await supabase.from("project_stakeholder_mappings").delete().eq("project_id", targetProjectId);

    for (const stakeholderId of selectedStakeholderIds) {
      const stakeholder = stakeholders.find((s) => s.id === stakeholderId);
      await supabase.from("project_stakeholders").insert({
        project_id: targetProjectId,
        stakeholder_id: stakeholderId,
        role_in_project: stakeholder?.stakeholder_type ?? null,
      });

      // Resolve placeholder_id when template mode is active
      const placeholderId = useTemplate
        ? (Object.entries(placeholderMappings).find(([, sid]) => sid === stakeholderId)?.[0] ?? null)
        : null;

      if (useTemplate && placeholderId) {
        await supabase.from("project_stakeholder_mappings").insert({
          project_id: targetProjectId,
          placeholder_id: placeholderId,
          stakeholder_id: stakeholderId,
        });
      }

      const members = teamAssignments[stakeholderId] ?? [];
      if (members.length === 0) continue;

      const teamInsert: Record<string, unknown> = {
        project_id: targetProjectId,
        stakeholder_id: stakeholderId,
        team_name: "Default Team",
      };
      if (placeholderId) teamInsert.placeholder_id = placeholderId;

      const { data: team } = await supabase
        .from("project_stakeholder_teams")
        .insert(teamInsert)
        .select()
        .single();
      if (!team) continue;

      await supabase.from("project_team_members").insert(
        members.map((m) => ({
          project_stakeholder_team_id: team.id,
          stakeholder_staff_id: m.staffId,
          role_on_project: m.roleOnProject,
        }))
      );
    }
  }

  return {
    stakeholders,
    roles,
    templates,
    selectedStakeholderIds,
    teamAssignments,
    stakeholderStaff,
    addingStakeholderKey,
    setAddingStakeholderKey,
    addMemberStaffId,
    setAddMemberStaffId,
    addMemberRole,
    setAddMemberRole,
    useTemplate,
    setUseTemplate,
    selectedTemplateId,
    setSelectedTemplateId,
    placeholderMappings,
    handleToggleStakeholder,
    handleMapPlaceholder,
    handleAddTeamMember,
    handleRemoveTeamMember,
    saveStakeholderAssignments,
  };
}
