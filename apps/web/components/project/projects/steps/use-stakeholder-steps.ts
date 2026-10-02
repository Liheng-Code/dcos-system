"use client";

import { useState, useEffect } from "react";
import { deleteProjectStakeholderMappingsByProjectId, deleteProjectStakeholderTeamsByProjectId, deleteProjectStakeholdersByProjectId, insertProjectStakeholder, insertProjectStakeholderMapping, insertProjectStakeholderTeamsReturning, insertProjectTeamMembers, listProjectStakeholderMappingsByProjectId, listProjectStakeholderTeamsByProjectId, listProjectStakeholdersByProjectId, listProjectTeamMembersByProjectStakeholderTeamIds, listRolesOrderedByTypeAndLevel, listStakeholderStaffByStakeholderId, listStakeholderTemplatesWithTemplatePlaceholders, listStakeholders } from "@/lib/project/projects/projects-queries";

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
    listStakeholders()
      .then(({ data }) => { if (data) setStakeholders(data as StakeholderEntry[]); });
    listRolesOrderedByTypeAndLevel()
      .then(({ data }) => { if (data) setRoles(data as { code: string; name: string; type: string }[]); });
    listStakeholderTemplatesWithTemplatePlaceholders()
      .then(({ data }) => { if (data) setTemplates(data as StakeholderTemplate[]); });
  }, []);

  // Load existing assignments when editing a project (waits for stakeholders list to be ready)
  useEffect(() => {
    if (!projectId || stakeholders.length === 0) return;
    (async () => {
      const { data: rows } = await listProjectStakeholdersByProjectId(projectId, "stakeholder_id");
      if (!rows || rows.length === 0) return;

      const ids = (rows as { stakeholder_id: string }[]).map((r) => r.stakeholder_id);
      setSelectedStakeholderIds(new Set(ids));

      const staffMap: Record<string, StakeholderStaffEntry[]> = {};
      for (const id of ids) {
        const { data: staffRows } = await listStakeholderStaffByStakeholderId(id);
        if (staffRows) staffMap[id] = staffRows as StakeholderStaffEntry[];
      }
      setStakeholderStaff(staffMap);

      const { data: teams } = await listProjectStakeholderTeamsByProjectId(projectId, "id, stakeholder_id");
      if (teams && teams.length > 0) {
        const teamMap: Record<string, string> = {};
        for (const t of teams as { id: string; stakeholder_id: string }[]) teamMap[t.id] = t.stakeholder_id;
        const { data: members } = await listProjectTeamMembersByProjectStakeholderTeamIds((teams as { id: string }[]).map((t) => t.id), "project_stakeholder_team_id, stakeholder_staff_id, role_on_project");
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
      const { data: mappingRows } = await listProjectStakeholderMappingsByProjectId(projectId, "placeholder_id, stakeholder_id");
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
    listStakeholderStaffByStakeholderId(id).then(({ data }) => {
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

    await deleteProjectStakeholdersByProjectId(targetProjectId);
    await deleteProjectStakeholderTeamsByProjectId(targetProjectId);
    await deleteProjectStakeholderMappingsByProjectId(targetProjectId);

    for (const stakeholderId of selectedStakeholderIds) {
      const stakeholder = stakeholders.find((s) => s.id === stakeholderId);
      await insertProjectStakeholder({
        project_id: targetProjectId,
        stakeholder_id: stakeholderId,
        role_in_project: stakeholder?.stakeholder_type ?? null,
      });

      // Resolve placeholder_id when template mode is active
      const placeholderId = useTemplate
        ? (Object.entries(placeholderMappings).find(([, sid]) => sid === stakeholderId)?.[0] ?? null)
        : null;

      if (useTemplate && placeholderId) {
        await insertProjectStakeholderMapping({
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

      const { data: team } = await insertProjectStakeholderTeamsReturning(teamInsert);
      if (!team) continue;

      await insertProjectTeamMembers(members.map((m) => ({
          project_stakeholder_team_id: team.id,
          stakeholder_staff_id: m.staffId,
          role_on_project: m.roleOnProject,
        })));
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
