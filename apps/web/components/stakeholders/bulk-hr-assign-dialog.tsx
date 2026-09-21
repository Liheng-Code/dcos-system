"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Users2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { connectStakeholder } from "@/lib/stakeholder-assignment";
import { initials, AVATAR_COLORS } from "@/components/stakeholders/constants";
import type { Stakeholder } from "@/components/stakeholders/stakeholder-edit-sheet";

interface Candidate {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  employee_id?: string | null;
  department?: string | null;
}

interface HREmployee {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
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
  const isInternal = stakeholder.category === "internal";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [staffByProfileId, setStaffByProfileId] = useState<Record<string, { id: string }>>({});
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
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
      const [rolesRes, teamRes, rosterRes] = await Promise.all([
        supabase.from("roles").select("code, name").order("level"),
        supabase.from("project_stakeholder_teams")
          .select("id")
          .eq("project_id", projectId)
          .eq("stakeholder_id", stakeholder.id),
        supabase.from("stakeholder_staff")
          .select("id, profile_id, full_name, job_title, email")
          .eq("stakeholder_id", stakeholder.id),
      ]);

      const teamIds = (teamRes.data ?? []).map((t: { id: string }) => t.id);
      const roster = rosterRes.data ?? [];
      const staffById = new Map(roster.map((s) => [s.id, s]));
      const profileMap: Record<string, { id: string }> = {};
      for (const s of roster) {
        if (s.profile_id) profileMap[s.profile_id] = { id: s.id };
      }

      const assigned = new Set<string>();
      if (teamIds.length > 0) {
        const { data: members } = await supabase.from("project_team_members")
          .select("stakeholder_staff_id")
          .in("project_stakeholder_team_id", teamIds);
        for (const m of members ?? []) {
          if (isInternal) {
            const staffRow = staffById.get(m.stakeholder_staff_id);
            if (staffRow?.profile_id) assigned.add(staffRow.profile_id);
          } else {
            assigned.add(m.stakeholder_staff_id);
          }
        }
      }

      if (cancelled) return;

      if (isInternal) {
        const { data: employees } = await supabase.from("profiles")
          .select("id, employee_id, full_name, email, job_title, department, status")
          .eq("status", "active")
          .order("full_name");
        setCandidates((employees ?? []).map((e: HREmployee) => ({
          id: e.id,
          full_name: e.full_name,
          job_title: e.job_title,
          email: e.email,
          employee_id: e.employee_id,
          department: e.department,
        })));
        setStaffByProfileId(profileMap);
      } else {
        setCandidates(roster.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          job_title: s.job_title,
          email: s.email,
        })));
      }

      if (rolesRes.data) setRoles(rolesRes.data as { code: string; name: string }[]);
      setAssignedIds(assigned);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [projectId, stakeholder.id, isInternal]);

  const filtered = useMemo(() => {
    if (!isInternal) return candidates;
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      return [
        c.full_name,
        c.employee_id ?? "",
        c.department ?? "",
        c.job_title ?? "",
        c.email ?? "",
      ].some((field) => field.toLowerCase().includes(q));
    });
  }, [candidates, search, isInternal]);

  const assignable = filtered.filter((c) => !assignedIds.has(c.id));
  const allSelected = assignable.length > 0 && assignable.every((c) => selectedIds.has(c.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(assignable.map((c) => c.id)));
  }

  async function ensureStaffRow(supabase: ReturnType<typeof createClient>, profileId: string) {
    if (staffByProfileId[profileId]) return staffByProfileId[profileId].id;
    const profile = candidates.find((c) => c.id === profileId);
    const { data, error } = await supabase.from("stakeholder_staff").insert({
      stakeholder_id: stakeholder.id,
      full_name: profile?.full_name ?? "",
      job_title: profile?.job_title ?? null,
      email: profile?.email ?? null,
      profile_id: profileId,
    }).select("id").single();
    if (error || !data) throw error ?? new Error("Failed to register member");
    return data.id;
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

    try {
      let staffIds: string[];
      if (isInternal) {
        staffIds = [];
        for (const profileId of selectedIds) {
          staffIds.push(await ensureStaffRow(supabase, profileId));
        }
      } else {
        staffIds = [...selectedIds];
      }

      const rows = staffIds.map((staffId) => ({
        project_stakeholder_team_id: teamId,
        stakeholder_staff_id: staffId,
        role_on_project: role || null,
      }));
      const { error } = await supabase.from("project_team_members")
        .upsert(rows, { onConflict: "project_stakeholder_team_id,stakeholder_staff_id", ignoreDuplicates: true });
      if (error) { toast.error(error.message); setSaving(false); return; }

      toast.success(`${rows.length} member${rows.length !== 1 ? "s" : ""} assigned to ${projectName ?? "project"}`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign members");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Users2 className="h-4 w-4" /> Member Assign
            </h2>
            <p className="text-xs text-muted-foreground">
              {isInternal
                ? `${stakeholder.organization_name} · pick from Employee Master`
                : `${stakeholder.organization_name} → ${projectName ?? "current project"}`}
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
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isInternal
                ? "No active employees found in Employee Master."
                : "This company has no registered personnel."}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {isInternal && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, employee ID, department, title…"
                      className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
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
              </div>

              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No match for current search.</p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((c, i) => {
                    const already = assignedIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2",
                          already ? "opacity-50" : "cursor-pointer hover:bg-muted/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={already || selectedIds.has(c.id)}
                          disabled={already}
                          onChange={() => toggle(c.id)}
                        />
                        <div className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                          AVATAR_COLORS[i % AVATAR_COLORS.length],
                        )}>
                          {initials(c.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-medium">{c.full_name}</p>
                            {c.employee_id && (
                              <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                                {c.employee_id}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {[c.job_title, c.department].filter(Boolean).join(" · ") || "\u00A0"}
                          </p>
                        </div>
                        {already && <span className="text-[10px] text-muted-foreground">Assigned</span>}
                      </label>
                    );
                  })}
                </div>
              )}
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