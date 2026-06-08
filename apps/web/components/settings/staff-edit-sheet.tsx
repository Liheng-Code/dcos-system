"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface StaffProfile {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  level: string | null;
  role: string;
  status: string;
  report_to: string | null;
}

interface Role {
  code: string;
  name: string;
  type: string;
}

interface StaffEditSheetProps {
  profile: StaffProfile;
  onClose: () => void;
  onUpdate: (profile: StaffProfile) => void;
}

const DEPARTMENTS = [
  "management", "architecture", "structural", "procurement",
  "construction", "hr", "accounting", "mep",
];

const LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"];

const ROLES = ["admin", "project_manager", "department_manager", "contractor", "inspector", "viewer"];

const STATUSES = ["active", "inactive", "resigned"];

export function StaffEditSheet({ profile, onClose, onUpdate }: StaffEditSheetProps) {
  const [form, setForm] = useState({ ...profile });
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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
        department: form.department,
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
    onUpdate({ ...form } as StaffProfile);
    setSaving(false);
  }

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
                <Label htmlFor="department">Department</Label>
                <select
                  id="department"
                  value={form.department ?? ""}
                  onChange={(e) => setForm({ ...form, department: e.target.value || null })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
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
                <Label htmlFor="status">Status</Label>
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
    </div>
  );
}
