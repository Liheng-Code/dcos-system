"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save, Lock, Unlock, PauseCircle, Ban, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { StaffProfile } from "@/components/settings/staff-list-page";
import type { AccountStatus } from "@/lib/admin-users/admin-users-service";

interface Role {
  code: string;
  name: string;
  type: string;
}

interface DepartmentOption {
  id: string;
  department_name: string;
}

interface StaffEditSheetProps {
  profile: StaffProfile;
  departments: DepartmentOption[];
  onClose: () => void;
  onUpdate: (profile: StaffProfile) => void;
}

const LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"];

const ROLES = ["admin", "project_manager", "department_manager", "contractor", "inspector", "viewer"];

const STATUSES = ["active", "inactive", "resigned"];

// USR-04 — Security section badge colours, matching USR-01's account_status convention.
const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  INVITED: "bg-amber-500/10 text-amber-600 border-amber-200",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  LOCKED: "bg-red-500/10 text-red-600 border-red-200",
  SUSPENDED: "bg-orange-500/10 text-orange-600 border-orange-200",
  DISABLED: "bg-gray-500/10 text-gray-500 border-gray-200",
};

type ConfirmAction = "lock" | "unlock" | "suspend" | "disable" | "force-reset" | null;

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export function StaffEditSheet({ profile, departments, onClose, onUpdate }: StaffEditSheetProps) {
  const [form, setForm] = useState({ ...profile });
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState<ConfirmAction>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("roles").select("code, name, type").then(({ data }) => {
      if (data) setRoles(data as Role[]);
    });
    supabase
      .from("user_roles")
      .select("role_code")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        if (data) setAssignedRoles(data.map((r: { role_code: string }) => r.role_code));
      });
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, [profile.id]);

  function toggleRole(code: string) {
    setAssignedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code],
    );
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        email: form.email,
        job_title: form.job_title,
        department_id: form.department_id,
        level: form.level,
        role: form.role,
        status: form.status,
        employee_id: form.employee_id,
        report_to: form.report_to,
      })
      .eq("id", form.id);

    if (profileErr) {
      toast.error(profileErr.message);
      setSaving(false);
      return;
    }

    // Sync role assignments
    const { data: existing } = await supabase
      .from("user_roles")
      .select("role_code")
      .eq("user_id", form.id);

    const existingCodes = (existing ?? []).map((r: { role_code: string }) => r.role_code);
    const toAdd = assignedRoles.filter((c) => !existingCodes.includes(c));
    const toRemove = existingCodes.filter((c: string) => !assignedRoles.includes(c));

    if (toRemove.length > 0) {
      await supabase.from("user_roles").delete().eq("user_id", form.id).in("role_code", toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from("user_roles").insert(
        toAdd.map((code) => ({ user_id: form.id, role_code: code })),
      );
    }

    toast.success("Staff updated");
    onUpdate({ ...form });
    setSaving(false);
  }

  async function runAccountAction(action: "lock" | "unlock" | "suspend" | "disable") {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `Failed to ${action} account`);
      }
      const nextStatus = (data.account_status ?? form.account_status) as AccountStatus;
      setForm((f) => ({ ...f, account_status: nextStatus }));
      onUpdate({ ...form, account_status: nextStatus });
      toast.success(
        data.idempotent
          ? `Account is already ${nextStatus.toLowerCase()}.`
          : `Account ${action === "lock" ? "locked" : action === "unlock" ? "unlocked" : action === "suspend" ? "suspended" : "disabled"}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} account`);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
      setReason("");
    }
  }

  async function runForceReset() {
    setActionLoading("force-reset");
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/force-reset`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to send reset link");
      }
      toast.success(data.message ?? `Reset link sent to ${profile.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset link");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  }

  function handleConfirm() {
    if (confirmAction === "force-reset") {
      runForceReset();
    } else if (confirmAction) {
      runAccountAction(confirmAction);
    }
  }

  // USR-04 action visibility — only offer transitions that are actually valid from the
  // account's current state (mirrors ACCOUNT_STATUS_ACTIONS.validFrom in
  // apps/web/lib/admin-users/admin-users-service.ts), so the admin is never offered a button
  // that would just 409. Self-action on any of these four is never offered, full stop
  // (02-Functional-Specification.md UC06 Alternate Path B) — the DB/API-side self-target
  // check is the real boundary; this is the UI-level courtesy.
  const isSelf = currentUserId !== null && currentUserId === profile.id;
  const status = form.account_status;
  const canLock = status === "ACTIVE";
  const canSuspend = status === "ACTIVE";
  const canDisable = status === "ACTIVE" || status === "SUSPENDED" || status === "LOCKED";
  const canUnlock = status === "LOCKED" || status === "SUSPENDED" || status === "DISABLED";

  const CONFIRM_COPY: Record<Exclude<ConfirmAction, null>, { title: string; description: string }> = {
    lock: {
      title: "Lock this account?",
      description: "This user will be immediately signed out and unable to log in until unlocked.",
    },
    unlock: {
      title: "Unlock this account?",
      description: "This user will be able to log in again immediately.",
    },
    suspend: {
      title: "Suspend this account?",
      description: "This user will be immediately signed out. They can be reactivated at any time.",
    },
    disable: {
      title: "Disable this account?",
      description: "This user will be immediately signed out and their account disabled. Historical records they created are preserved.",
    },
    "force-reset": {
      title: "Send password reset link?",
      description: `A password reset link will be sent to ${profile.email}. You will not see or set their new password.`,
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{form.full_name}</h2>
            <p className="text-xs text-muted-foreground">{form.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* Basic Info */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Info</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="employee_id">Employee ID</Label>
                <Input id="employee_id" value={form.employee_id ?? ""} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name</Label>
                <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </fieldset>

          {/* Job Info */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job Info</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="job_title">Job Title</Label>
                <Input id="job_title" value={form.job_title ?? ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department_id">Department</Label>
                <select
                  id="department_id"
                  value={form.department_id ?? ""}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value || null })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.department_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="level">Level</Label>
                <select
                  id="level"
                  value={form.level ?? ""}
                  onChange={(e) => setForm({ ...form, level: e.target.value || null })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">HR Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report_to">Reports to</Label>
              <Input id="report_to" value={form.report_to ?? ""} onChange={(e) => setForm({ ...form, report_to: e.target.value || null })} />
            </div>
          </fieldset>

          {/* System Role */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Role</legend>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </fieldset>

          {/* Role Assignments */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RBAC Role Assignments</legend>
            <div className="space-y-1">
              {roles.map((role) => (
                <label
                  key={role.code}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={assignedRoles.includes(role.code)}
                    onChange={() => toggleRole(role.code)}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{role.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {role.code} · {role.type.replace(/_/g, " ")}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* USR-04 — Security (inline, per-user) */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security</legend>
            <div className="rounded-lg border border-border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Account Status</span>
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  ACCOUNT_STATUS_COLORS[form.account_status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                )}>
                  {form.account_status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last Login</span>
                <span className="text-xs">{formatDateTime(form.last_login_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Password Changed</span>
                <span className="text-xs">{formatDateTime(form.password_changed_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Activated / First Login</span>
                <span className="text-xs">{formatDateTime(form.first_login_at)}</span>
              </div>

              {isSelf ? (
                <p className="pt-1 text-xs text-muted-foreground italic">
                  Account-security actions are not available on your own account here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {canLock && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAction("lock")} disabled={actionLoading !== null}>
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                      Lock
                    </Button>
                  )}
                  {canUnlock && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAction("unlock")} disabled={actionLoading !== null}>
                      <Unlock className="mr-1.5 h-3.5 w-3.5" />
                      Unlock
                    </Button>
                  )}
                  {canSuspend && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAction("suspend")} disabled={actionLoading !== null}>
                      <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                      Suspend
                    </Button>
                  )}
                  {canDisable && (
                    <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmAction("disable")} disabled={actionLoading !== null}>
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Disable
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAction("force-reset")} disabled={actionLoading !== null}>
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                    Force Password Reset
                  </Button>
                </div>
              )}
            </div>
          </fieldset>
        </div>

        {/* Save */}
        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) { setConfirmAction(null); setReason(""); } }}>
        <AlertDialogContent>
          {confirmAction && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM_COPY[confirmAction].title}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM_COPY[confirmAction].description}</AlertDialogDescription>
              </AlertDialogHeader>
              {(confirmAction === "suspend" || confirmAction === "disable") && (
                <div className="space-y-1.5 px-1">
                  <Label htmlFor="reason" className="text-xs">Reason (optional)</Label>
                  <textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Extended leave — returning 2026-11-01"
                    rows={2}
                    className="min-h-[60px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-hidden focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={actionLoading !== null}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(
                    (confirmAction === "disable" || confirmAction === "suspend") &&
                      "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
                  )}
                  onClick={handleConfirm}
                  disabled={actionLoading !== null}
                >
                  {actionLoading !== null && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
