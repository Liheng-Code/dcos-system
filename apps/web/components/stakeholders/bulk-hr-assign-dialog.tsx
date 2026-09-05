"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { connectStakeholder } from "@/lib/stakeholder-assignment";
import { initials, AVATAR_COLORS } from "@/components/stakeholders/constants";
import type { Stakeholder } from "@/components/stakeholders/stakeholder-edit-sheet";

interface StaffRow {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface BulkHrAssignDialogProps {
  stakeholder: Stakeholder;
  projectId: string;
  projectName: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function BulkHrAssignDialog({
  stakeholder, projectId, projectName, onClose, onDone,
}: BulkHrAssignDialogProps) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const supabase = createClient();
      const [staffRes, rolesRes, teamRes] = await Promise.all([
        supabase.from("stakeholder_staff")
          .select("id, full_name, job_title")
          .eq("stakeholder_id", stakeholder.id)
          .order("full_name"),
        supabase.from("roles").select("code, name").order("level"),
        supabase.from("project_stakeholder_teams")
          .select("id")
          .eq("project_id", projectId)
          .eq("stakeholder_id", stakeholder.id),
      ]);

      const teamIds = (teamRes.data ?? []).map((t: { id: string }) => t.id);
      let assigned = new Set<string>();
      if (teamIds.length > 0) {
        const { data: members } = await supabase.from("project_team_members")
          .select("stakeholder_staff_id")
          .in("project_stakeholder_team_id", teamIds);
        assigned = new Set((members ?? []).map((m: { stakeholder_staff_id: string }) => m.stakeholder_staff_id));
      }

      if (cancelled) return;
      if (staffRes.data) setStaff(staffRes.data as StaffRow[]);
      if (rolesRes.data) setRoles(rolesRes.data as { code: string; name: string }[]);
      setAssignedIds(assigned);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [projectId, stakeholder.id]);

  const assignable = staff.filter((s) => !assignedIds.has(s.id));
  const allSelected = assignable.length > 0 && assignable.every((s) => selectedIds.has(s.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(assignable.map((s) => s.id)));
  }

  async function handleAssign() {
    if (selectedIds.size === 0) return;
    setSaving(true);
    const supabase = createClient();

    const { error: linkErr } = await connectStakeholder(supabase, projectId, stakeholder);
    if (linkErr) { toast.error(linkErr.message); setSaving(false); return; }

    // Find or create the stakeholder's team on this project.
    let teamId: string;
    const { data: existing } = await supabase.from("project_stakeholder_teams")
      .select("id")
      .eq("project_id", projectId)
      .eq("stakeholder_id", stakeholder.id)
      .limit(1);
    if (existing && existing.length > 0) {
      teamId = existing[0].id;
    } else {
      const { data: team, error: teamErr } = await supabase.from("project_stakeholder_teams")
        .insert({ project_id: projectId, stakeholder_id: stakeholder.id, team_name: "Default Team" })
        .select("id")
        .single();
      if (teamErr || !team) { toast.error("Failed to create project team"); setSaving(false); return; }
      teamId = team.id;
    }

    const rows = [...selectedIds].map((staffId) => ({
      project_stakeholder_team_id: teamId,
      stakeholder_staff_id: staffId,
      role_on_project: role || null,
    }));
    const { error } = await supabase.from("project_team_members")
      .upsert(rows, { onConflict: "project_stakeholder_team_id,stakeholder_staff_id", ignoreDuplicates: true });

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} member${rows.length !== 1 ? "s" : ""} assigned to ${projectName ?? "project"}`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Users2 className="h-4 w-4" /> Bulk HR Assign
            </h2>
            <p className="text-xs text-muted-foreground">
              {stakeholder.organization_name} → {projectName ?? "current project"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!projectId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Select a project first.</p>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : staff.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This company has no registered personnel.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={assignable.length === 0}
                  />
                  Select all ({assignable.length})
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  <option value="">Role on project…</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                {staff.map((s, i) => {
                  const already = assignedIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2",
                        already ? "opacity-50" : "cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={already || selectedIds.has(s.id)}
                        disabled={already}
                        onChange={() => toggle(s.id)}
                      />
                      <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                        AVATAR_COLORS[i % AVATAR_COLORS.length],
                      )}>
                        {initials(s.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{s.full_name}</p>
                        {s.job_title && (
                          <p className="truncate text-[10px] text-muted-foreground">{s.job_title}</p>
                        )}
                      </div>
                      {already && <span className="text-[10px] text-muted-foreground">Assigned</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={saving || selectedIds.size === 0 || !projectId}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Assign ${selectedIds.size || ""}`.trim()}
          </Button>
        </div>
      </div>
    </div>
  );
}
