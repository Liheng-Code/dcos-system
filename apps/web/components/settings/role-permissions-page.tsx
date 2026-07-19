"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronDown, ChevronRight, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ApprovalThresholdPanel } from "@/components/settings/approval-threshold-panel";

interface Role {
  code: string;
  name: string;
  type: string;
  level: number | null;
}

interface Permission {
  role_code: string;
  module: string;
  action: string;
  view: boolean;
  can_create: boolean;
  edit: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  export: boolean;
  transmit: boolean;
  configure: boolean;
  reassign: boolean;
  scope: string | null;
}

const MODULES: { key: string; label: string }[] = [
  { key: "task_management", label: "Task Management" },
  { key: "document_control", label: "Document Control" },
  { key: "procurement", label: "Procurement" },
  { key: "tender", label: "Pre-Contract / Tendering" },
  { key: "qs", label: "Quantity Surveying" },
  { key: "inventory", label: "Inventory / Stock" },
  { key: "construction", label: "Construction" },
  { key: "qa_qc", label: "QA / QC" },
  { key: "hse", label: "HSE" },
  { key: "hr", label: "HR" },
  { key: "account_finance", label: "Account / Finance" },
  { key: "planning", label: "Planning & Scheduling" },
  { key: "commissioning_handover", label: "Commissioning & Handover" },
  { key: "reporting_kpi", label: "Reporting & KPI" },
  { key: "admin_config", label: "Admin Configuration" },
];

const PERM_COLS: { key: string; label: string }[] = [
  { key: "view", label: "V" },
  { key: "can_create", label: "C" },
  { key: "edit", label: "E" },
  { key: "delete", label: "D" },
  { key: "submit", label: "S" },
  { key: "approve", label: "A" },
  { key: "reject", label: "R" },
  { key: "export", label: "X" },
  { key: "transmit", label: "T" },
  { key: "configure", label: "CF" },
  { key: "reassign", label: "RS" },
];

export function RolePermissionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Map<string, Permission>>(new Map());
  const [allActions, setAllActions] = useState<Map<string, Set<string>>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["admin_config"]));

  useEffect(() => {
    supabase.from("roles").select("*").order("level", { ascending: true, nullsFirst: false }).then(({ data }) => {
      if (data) setRoles(data as Role[]);
    });
  }, [supabase]);

  // Fetch all distinct (module, action) pairs across all roles as the matrix template
  useEffect(() => {
    supabase.from("role_permissions").select("module, action").then(({ data }) => {
      const map = new Map<string, Set<string>>();
      if (data) {
        for (const row of data as { module: string; action: string }[]) {
          if (!map.has(row.module)) map.set(row.module, new Set());
          map.get(row.module)!.add(row.action);
        }
      }
      setAllActions(map);
    });
  }, [supabase]);

  // Fetch permissions for the selected role
  useEffect(() => {
    if (!selectedRole) return;
    supabase.from("role_permissions").select("*").eq("role_code", selectedRole).then(({ data }) => {
      const map = new Map<string, Permission>();
      if (data) {
        for (const p of data as Permission[]) {
          map.set(`${p.module}__${p.action}`, p);
        }
      }
      setPermissions(map);
      setDirty(false);
    });
  }, [selectedRole, supabase]);

  async function handleSave() {
    if (!selectedRole) return;
    setSaving(true);
    const rows = Array.from(permissions.values());

    const { error } = await supabase.from("role_permissions").upsert(
      rows.map((p) => ({ ...p, role_code: selectedRole })),
      { onConflict: "role_code, module, action" },
    );

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Permissions saved");
      setDirty(false);
    }
    setSaving(false);
  }

  function togglePerm(module: string, action: string, field: string) {
    const key = `${module}__${action}`;
    const existing = permissions.get(key);
    const updated: Permission = existing
      ? { ...existing, [field]: !(existing as unknown as Record<string, boolean>)[field] }
      : {
          role_code: selectedRole!,
          module,
          action,
          view: false,
          can_create: false,
          edit: false,
          delete: false,
          submit: false,
          approve: false,
          reject: false,
          export: false,
          transmit: false,
          configure: false,
          reassign: false,
          scope: null,
          [field]: true,
        } as unknown as Permission;
    const newMap = new Map(permissions);
    newMap.set(key, updated);
    setPermissions(newMap);
    setDirty(true);
  }

  function hasPerm(module: string, action: string, field: string): boolean {
    const p = permissions.get(`${module}__${action}`);
    return p ? (p as unknown as Record<string, boolean>)[field] ?? false : false;
  }

  const groupedRoles = useMemo(() => {
    const groups: { label: string; roles: Role[] }[] = [];
    const types = [
      { type: "internal_level", label: "Internal Hierarchy" },
      { type: "functional", label: "Functional Roles" },
      { type: "external", label: "External Roles" },
    ];
    for (const t of types) {
      const filtered = roles.filter((r) => r.type === t.type);
      if (filtered.length > 0) groups.push({ label: t.label, roles: filtered });
    }
    return groups;
  }, [roles]);

  if (roles.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-0 -mx-6 -mb-6 min-h-[calc(100vh-12rem)]">
      {/* Left: Role List */}
      <div className="w-56 shrink-0 border-r border-border p-3 space-y-4 overflow-y-auto">
        {groupedRoles.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.roles.map((role) => (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => setSelectedRole(role.code)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    selectedRole === role.code
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-xs">{role.code}</span>
                  <span className="ml-2">{role.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Right: Permission Matrix */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedRole ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a role to edit permissions
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <p className="text-sm font-semibold">{roles.find((r) => r.code === selectedRole)?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedRole}</p>
              </div>
              <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {MODULES.map((mod) => {
                const actions = allActions.get(mod.key);
                const expanded = expandedModules.has(mod.key);
                if (!actions || actions.size === 0) return null;

                return (
                  <div key={mod.key} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(expandedModules);
                        if (expanded) next.delete(mod.key);
                        else next.add(mod.key);
                        setExpandedModules(next);
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {mod.label}
                      <span className="ml-auto text-xs text-muted-foreground">{actions.size} actions</span>
                    </button>
                    {expanded && (
                      <div className="border-t border-border overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="sticky left-0 bg-muted/30 px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">
                                Action
                              </th>
                              {PERM_COLS.map((c) => (
                                <th key={c.key} className="px-2 py-2 text-center font-medium text-muted-foreground w-8" title={c.key}>
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(actions).map((action) => (
                              <tr key={action} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                                <td className="sticky left-0 bg-background px-3 py-1.5 text-muted-foreground font-medium">
                                  {action.replace(/_/g, " ")}
                                </td>
                                {PERM_COLS.map((c) => (
                                  <td key={c.key} className="px-2 py-1.5 text-center">
                                    <input
                                      type="checkbox"
                                      checked={hasPerm(mod.key, action, c.key)}
                                      onChange={() => togglePerm(mod.key, action, c.key)}
                                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Approval Thresholds */}
              <ApprovalThresholdPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
