"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { Field, NativeSelect } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function SystemAccessTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, profile, isArchived, sysRoles, assignedRoles, setAssignedRoles, sysForm, setSysForm, saveSystemAccess } = c;
  return (
    <TabsContent value="system-access" className="mt-6">
      <div className="space-y-4">
        {/* Onboarding Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Onboarding Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Account Created", done: true },
              { label: "Role Assigned", done: assignedRoles.length > 0 },
              { label: "Project Assigned", done: false },
              { label: "Password Changed", done: !!profile.password_changed_at },
              { label: "First Login Completed", done: !!profile.first_login_at },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
                {done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  : <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />}
                <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                <span className="ml-auto text-xs font-medium">{done ? "Done" : "Pending"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Account Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Account Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="User ID (System Generated)">
              <Input value={profile.user_code ?? "—"} disabled />
            </Field>
            <Field label="Employee ID (HR Assigned)">
              <Input value={profile.employee_id ?? "—"} disabled />
            </Field>
            <Field label="Username">
              <Input
                value={profile.full_name
                  .toLowerCase()
                  .replace(/\s+/g, ".")
                  .replace(/[^a-z0-9.]/g, "")}
                disabled
              />
            </Field>
          </CardContent>
        </Card>

        {/* Account Access */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Account Access</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="System Role">
              <NativeSelect value={sysForm.role} onChange={(v) => setSysForm((f) => ({ ...f, role: v }))}>
                {["admin", "project_manager", "department_manager", "contractor", "inspector", "viewer"].map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Account Status">
              <NativeSelect value={sysForm.status} onChange={(v) => setSysForm((f) => ({ ...f, status: v }))}>
                {[
                  { value: "pending",    label: "Pending — awaiting first login" },
                  { value: "active",     label: "Active — can use system" },
                  { value: "suspended",  label: "Suspended — temporarily blocked" },
                  { value: "disabled",   label: "Disabled — access removed" },
                  { value: "archived",   label: "Archived — historical record" },
                ].map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </NativeSelect>
            </Field>
            {sysForm.status === "suspended" && (
              <div className="md:col-span-2">
                <Field label="Suspension Reason">
                  <NativeSelect value={sysForm.suspended_reason} onChange={(v) => setSysForm((f) => ({ ...f, suspended_reason: v }))}>
                    <option value="">— Select reason —</option>
                    <option value="investigation">Investigation</option>
                    <option value="security_incident">Security Incident</option>
                    <option value="extended_leave">Extended Leave</option>
                    <option value="contract_expired">Contract Expired</option>
                  </NativeSelect>
                </Field>
              </div>
            )}
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={saveSystemAccess} disabled={saving || isArchived} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Access
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RBAC Role Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">RBAC Role Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {sysRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading roles…</p>
            ) : (
              <div className="space-y-1">
                {(["internal_level", "functional", "external"] as const).map((type) => {
                  const group = sysRoles.filter((r) => r.type === type);
                  if (group.length === 0) return null;
                  return (
                    <div key={type} className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {type === "internal_level" ? "Internal Hierarchy" : type === "functional" ? "Functional Roles" : "External Roles"}
                      </p>
                      {group.map((role) => (
                        <label
                          key={role.code}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={assignedRoles.includes(role.code)}
                            onChange={() =>
                              setAssignedRoles((prev) =>
                                prev.includes(role.code)
                                  ? prev.filter((c) => c !== role.code)
                                  : [...prev, role.code]
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{role.name}</p>
                            <p className="text-xs text-muted-foreground">{role.code}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={saveSystemAccess} disabled={saving || isArchived} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Role Assignments
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
