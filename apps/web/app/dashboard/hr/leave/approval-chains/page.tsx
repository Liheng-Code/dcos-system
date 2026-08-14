"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeApprovalChainFromData, type ProfileData, type RoleData } from "@/lib/hr/approval-chain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  report_to: string | null;
}

type ChainStatus = "complete" | "missing_first" | "missing_hr" | "excluded" | "functional";

interface StaffChainRow {
  profile: ProfileRow;
  myRoleLabel: string;
  isExcluded: boolean;
  firstApprover: { name: string | null; roleLabel: string } | null;
  hrApprover: { name: string | null };
  status: ChainStatus;
  currentApprover1Id: string | null;
  currentApprover2Id: string | null;
  overrideApprover1Id: string | null;
  overrideApprover2Id: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusBadge(status: ChainStatus, hasOverride: boolean) {
  if (hasOverride)
    return <Badge className="bg-purple-100 text-purple-700 text-xs border-0">Manual</Badge>;
  switch (status) {
    case "complete":     return <Badge className="bg-green-100 text-green-700 text-xs border-0">✓ Complete</Badge>;
    case "missing_first": return <Badge className="bg-amber-100 text-amber-700 text-xs border-0">⚠ Missing First</Badge>;
    case "missing_hr":  return <Badge className="bg-red-100 text-red-700 text-xs border-0">⚠ No HR Manager</Badge>;
    case "excluded":    return <Badge className="bg-gray-100 text-gray-500 text-xs border-0">Excluded (L0)</Badge>;
    case "functional":  return <Badge className="bg-blue-100 text-blue-700 text-xs border-0">HR Direct</Badge>;
  }
}

// ── Assign / Edit modal ───────────────────────────────────────────────────────
function ChainModal({
  row,
  allProfiles,
  profileMap,
  saving,
  onSave,
  onClose,
}: {
  row: StaffChainRow;
  allProfiles: ProfileRow[];
  profileMap: Map<string, ProfileRow>;
  saving: boolean;
  onSave: (employeeId: string, a1: string, a2: string) => Promise<void>;
  onClose: () => void;
}) {
  const [a1, setA1] = useState(row.overrideApprover1Id ?? row.currentApprover1Id ?? "");
  const [a2, setA2] = useState(row.overrideApprover2Id ?? row.currentApprover2Id ?? "");

  const others = allProfiles.filter((p) => p.id !== row.profile.id);

  function label(p: ProfileRow) {
    return p.full_name + (p.job_title ? ` · ${p.job_title}` : "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Edit Approval Chain
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Employee info */}
        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="font-medium text-sm">{row.profile.full_name}</p>
          <p className="text-xs text-muted-foreground">{row.myRoleLabel || "Functional role"}</p>
          <p className="text-xs text-muted-foreground">{row.profile.email}</p>
        </div>

        {/* Approver selects */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              First Approver
            </label>
            <select
              value={a1}
              onChange={(e) => setA1(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Select first approver —</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>{label(p)}</option>
              ))}
            </select>
            {a1 && (
              <p className="text-xs text-muted-foreground pl-1">
                {profileMap.get(a1)?.email ?? ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Final Approver
            </label>
            <select
              value={a2}
              onChange={(e) => setA2(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Select final approver —</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>{label(p)}</option>
              ))}
            </select>
            {a2 && (
              <p className="text-xs text-muted-foreground pl-1">
                {profileMap.get(a2)?.email ?? ""}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Manual assignments override the role-hierarchy chain for this employee only.
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(row.profile.id, a1, a2)}
            disabled={saving || !a2}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ApprovalChainsPage() {
  const [rows, setRows]             = useState<StaffChainRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([]);
  const [profileMap, setProfileMap]  = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [canManage, setCanManage]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [modal, setModal]           = useState<{ row: StaffChainRow } | null>(null);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  async function loadData() {
    const supabase = createClient();

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const [profilesRes, rolesRes, overridesRes, meRoleRes, meProfileRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, job_title, report_to").order("full_name"),
      supabase.from("user_roles").select("user_id, role_code, roles(code, name, level, type)"),
      supabase.from("leave_approver_config")
        .select("employee_id, approver_level, approver_id")
        .eq("config_type", "personal")
        .eq("is_active", true),
      uid
        ? supabase.from("user_roles").select("role_code").eq("user_id", uid).in("role_code", ["HR_Manager", "admin"])
        : Promise.resolve({ data: [] }),
      uid
        ? supabase.from("profiles").select("role").eq("id", uid).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const profiles   = (profilesRes.data  ?? []) as ProfileRow[];
    const allRoles   = (rolesRes.data     ?? []) as any[];
    const overrides  = (overridesRes.data ?? []) as { employee_id: string; approver_level: number; approver_id: string }[];
    const meRoles    = (meRoleRes.data    ?? []) as any[];
    const isProfileAdmin = (meProfileRes.data as { role?: string } | null)?.role === "admin";

    setCanManage(meRoles.length > 0 || isProfileAdmin);

    const pMap = new Map<string, ProfileRow>(profiles.map((p) => [p.id, p]));
    setAllProfiles(profiles);
    setProfileMap(pMap);

    // Build per-employee override map
    const overrideMap = new Map<string, { a1: string | null; a2: string | null }>();
    for (const ov of overrides) {
      const entry = overrideMap.get(ov.employee_id) ?? { a1: null, a2: null };
      if (ov.approver_level === 1) entry.a1 = ov.approver_id;
      if (ov.approver_level === 2) entry.a2 = ov.approver_id;
      overrideMap.set(ov.employee_id, entry);
    }

    // Build role maps
    const personRolesMap = new Map<string, any[]>();
    const roleHolderMap  = new Map<string, ProfileRow>();
    for (const ur of allRoles) {
      const role = ur.roles;
      if (!role) continue;
      const arr = personRolesMap.get(ur.user_id) ?? [];
      arr.push(role);
      personRolesMap.set(ur.user_id, arr);
      if (!roleHolderMap.has(ur.role_code)) {
        const prof = pMap.get(ur.user_id);
        if (prof) roleHolderMap.set(ur.role_code, prof);
      }
    }

    const computed: StaffChainRow[] = profiles.map((profile) => {
      const ov = overrideMap.get(profile.id) ?? null;
      const ovA1Id = ov?.a1 ?? null;
      const ovA2Id = ov?.a2 ?? null;

      const personRoles = (personRolesMap.get(profile.id) ?? []) as RoleData[];

      const result = computeApprovalChainFromData(
        profile as ProfileData,
        personRoles,
        ovA1Id,
        ovA2Id,
        pMap as Map<string, ProfileData>,
        roleHolderMap as Map<string, ProfileData>,
      );

      const status: ChainStatus = result.isExcluded
        ? "excluded"
        : result.source === "manual"
          ? result.firstApprover && result.finalApprover
            ? "complete"
            : result.finalApprover
              ? "functional"
              : "missing_hr"
          : result.isFunctionalOnly
            ? result.finalApprover?.full_name
              ? "functional"
              : "missing_hr"
            : !result.firstApprover?.full_name
              ? "missing_first"
              : !result.finalApprover?.full_name
                ? "missing_hr"
                : "complete";

      return {
        profile: profile as any,
        myRoleLabel: result.myRoleLevel ?? (result.isFunctionalOnly ? "Functional" : ""),
        isExcluded: result.isExcluded,
        firstApprover: result.firstApprover
          ? { name: result.firstApprover.full_name, roleLabel: result.firstApprover.roleLabel }
          : null,
        hrApprover: { name: result.finalApprover?.full_name ?? null },
        status,
        currentApprover1Id: result.firstApprover?.id ?? null,
        currentApprover2Id: result.finalApprover?.id ?? null,
        overrideApprover1Id: result.source === "manual" ? result.firstApprover?.id ?? null : null,
        overrideApprover2Id: result.source === "manual" ? result.finalApprover?.id ?? null : null,
      };
    });

    setRows(computed);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // ── Save manual override ────────────────────────────────────────────────────
  async function handleSave(employeeId: string, a1Id: string, a2Id: string) {
    if (!canManage) {
      setSaveError("Only admin and HR Manager can edit approval chains.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const createdBy = userData.user?.id;

    // Delete existing personal entries for this employee
    const { error: deleteError } = await supabase.from("leave_approver_config")
      .delete()
      .eq("config_type", "personal")
      .eq("employee_id", employeeId);
    if (deleteError) { setSaveError(deleteError.message); setSaving(false); return; }

    const inserts = [];
    if (a1Id) inserts.push({ config_type: "personal", employee_id: employeeId, approver_level: 1, approver_id: a1Id, is_active: true, created_by: createdBy });
    if (a2Id) inserts.push({ config_type: "personal", employee_id: employeeId, approver_level: 2, approver_id: a2Id, is_active: true, created_by: createdBy });

    if (inserts.length > 0) {
      const { error } = await supabase.from("leave_approver_config").insert(inserts);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }

    setModal(null);
    setSaving(false);
    setLoading(true);
    await loadData();
  }

  // ── Default HR id for pre-filling final approver ────────────────────────────
  const complete = rows.filter((r) => r.status === "complete").length;
  const warnings = rows.filter((r) => r.status === "missing_first" || r.status === "missing_hr").length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="leave-page-header flex items-start justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">All Approval Chains</h2>
          <p className="text-muted-foreground">
            Leave approval chains for all staff — auto-derived from role hierarchy
          </p>
        </div>
        {!loading && (
          <div className="flex gap-3 text-sm">
            <span className="text-green-700 font-medium">{complete} complete</span>
            {warnings > 0 && <span className="text-amber-600 font-medium">{warnings} need attention</span>}
          </div>
        )}
      </div>

      {saveError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Computing chains for all staff…</p>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left font-medium py-3 px-4">Employee</th>
                <th className="text-left font-medium py-3 px-4">Role / Level</th>
                <th className="text-left font-medium py-3 px-4">First Approver</th>
                <th className="text-left font-medium py-3 px-4">Approver Role</th>
                <th className="text-left font-medium py-3 px-4">Final Approver</th>
                <th className="text-center font-medium py-3 px-4">Status</th>
                {canManage && <th className="text-center font-medium py-3 px-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="text-center py-10 text-muted-foreground">
                    No staff profiles found.
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.profile.id} className="border-b border-border hover:bg-muted/30">

                  <td className="py-3 px-4">
                    <p className="font-medium">{row.profile.full_name}</p>
                    <p className="text-xs text-muted-foreground">{row.profile.email}</p>
                    {row.profile.job_title && (
                      <p className="text-xs text-muted-foreground">{row.profile.job_title}</p>
                    )}
                  </td>

                  <td className="py-3 px-4 text-sm">{row.myRoleLabel || "—"}</td>

                  <td className="py-3 px-4">
                    {row.isExcluded ? (
                      <span className="text-muted-foreground">{"—"}</span>
                    ) : row.firstApprover?.name ? (
                      <span className="font-medium">{row.firstApprover.name}</span>
                    ) : row.firstApprover === null ? (
                      <span className="text-muted-foreground text-xs">Direct to HR</span>
                    ) : (
                      <span className="text-amber-600 text-xs">Not assigned</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    {row.isExcluded ? "—" : (row.firstApprover?.roleLabel || "—")}
                  </td>

                  <td className="py-3 px-4">
                    {row.isExcluded ? (
                      <span className="text-muted-foreground">{"—"}</span>
                    ) : row.hrApprover.name ? (
                      <span className="font-medium">{row.hrApprover.name}</span>
                    ) : (
                      <span className="text-red-600 text-xs">Not assigned</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center">
                    {statusBadge(row.status, !!(row.overrideApprover1Id || row.overrideApprover2Id))}
                  </td>

                  {canManage && (
                    <td className="py-3 px-4">
                      {row.isExcluded ? (
                        <span className="text-muted-foreground text-xs">{"—"}</span>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setModal({ row })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Chains auto-derive from RBAC role assignments. L0 is excluded from leave.
        Manual assignments (purple badge) override the hierarchy for that employee only.
      </p>

      {/* Modal */}
      {modal && (
        <ChainModal
          row={modal.row}
          allProfiles={allProfiles}
          profileMap={profileMap}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setModal(null); setSaveError(null); }}
        />
      )}
    </div>
  );
}
