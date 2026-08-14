"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, Loader2, Save, AlertTriangle, Info } from "lucide-react";

interface LeaveType {
  id: string;
  leave_code: string;
  leave_name: string;
}

interface PolicyRow {
  id: string | null;
  employment_type: string;
  probation_status: string;
  leave_type_id: string;
  allowed: boolean;
  requires_hr: boolean;
  requires_attachment: boolean;
  monthly_accrual: boolean;
  usable: boolean;
}

type CellValue = "allowed" | "not_allowed" | "requires_hr";

const EMPLOYMENT_TYPES = ["permanent", "contract", "temporary", "intern"] as const;
const PROBATION_STATUSES = ["not_applicable", "active", "completed"] as const;

const STATUS_LABELS: Record<string, string> = {
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  intern: "Intern",
  not_applicable: "No Probation",
  active: "Active Probation",
  completed: "Probation Completed",
};

function cellValueFromRow(row: PolicyRow | undefined): CellValue {
  if (!row) return "not_allowed";
  if (row.requires_hr) return "requires_hr";
  if (row.allowed) return "allowed";
  return "not_allowed";
}

function rowFromCellValue(employment_type: string, probation_status: string, leave_type_id: string, value: CellValue): PolicyRow {
  return {
    id: null,
    employment_type,
    probation_status,
    leave_type_id,
    allowed: value === "allowed" || value === "requires_hr",
    requires_hr: value === "requires_hr",
    requires_attachment: false,
    monthly_accrual: value !== "not_allowed",
    usable: value !== "not_allowed",
  };
}

const cellCls = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

export default function ProbationPolicyPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  // Store changes as a map of "et|ps|ltid" -> CellValue
  const [changes, setChanges] = useState<Record<string, CellValue>>({});

  const supabase = useMemo(() => createClient(), []);

  const policyKey = useCallback((et: string, ps: string, ltid: string) => `${et}|${ps}|${ltid}`, []);

  const existingByKey = useMemo(() => {
    const map: Record<string, PolicyRow> = {};
    for (const p of policies) {
      map[policyKey(p.employment_type, p.probation_status, p.leave_type_id)] = p;
    }
    return map;
  }, [policies, policyKey]);

  const getCellValue = useCallback(
    (et: string, ps: string, ltid: string): CellValue => {
      const key = policyKey(et, ps, ltid);
      if (key in changes) return changes[key];
      return cellValueFromRow(existingByKey[key]);
    },
    [changes, existingByKey, policyKey],
  );

  const setCellValue = useCallback(
    (et: string, ps: string, ltid: string, value: CellValue) => {
      setChanges((prev) => ({ ...prev, [policyKey(et, ps, ltid)]: value }));
    },
    [policyKey],
  );

  const hasChanges = Object.keys(changes).length > 0;

  useEffect(() => {
    const u = createClient();
    u.auth.getUser().then(({ data }) => {
      if (!data.user) { setAdminChecked(true); setLoading(false); return; }
      const uid = data.user.id;
      Promise.all([
        u.from("profiles").select("role").eq("id", uid).single(),
        u.from("user_roles").select("role_code").eq("user_id", uid).in("role_code", ["HR_Manager", "admin"]),
      ]).then(([profileRes, roleRes]) => {
        const isProfileAdmin = profileRes.data?.role === "admin";
        const hasAdminRole = (roleRes.data ?? []).length > 0;
        setIsAdmin(isProfileAdmin || hasAdminRole);
        setAdminChecked(true);
      });
    });
  }, []);

  useEffect(() => {
    if (!adminChecked) return;
    if (!isAdmin) { setLoading(false); return; }
    const u = createClient();
    Promise.all([
      u.from("leave_types").select("id, leave_code, leave_name").eq("is_active", true).order("leave_name"),
      u.from("leave_employment_policy").select("*"),
    ]).then(([typesRes, policyRes]) => {
      setLeaveTypes(typesRes.data || []);
      setPolicies(policyRes.data || []);
      setLoading(false);
    });
  }, [adminChecked, isAdmin]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const rowsToUpsert: PolicyRow[] = [];
    for (const [key, value] of Object.entries(changes)) {
      const [et, ps, ltid] = key.split("|");
      rowsToUpsert.push(rowFromCellValue(et, ps, ltid, value));
    }

    const { error } = await supabase.from("leave_employment_policy").upsert(
      rowsToUpsert.map((r) => ({
        employment_type: r.employment_type,
        probation_status: r.probation_status,
        leave_type_id: r.leave_type_id,
        allowed: r.allowed,
        requires_hr: r.requires_hr,
        requires_attachment: r.requires_attachment,
        monthly_accrual: r.monthly_accrual,
        usable: r.usable,
      })),
      { onConflict: "employment_type, probation_status, leave_type_id" },
    );

    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess(true);
      const u = createClient();
      const { data } = await u.from("leave_employment_policy").select("*");
      setPolicies(data || []);
      setChanges({});
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  if (!adminChecked || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You need HR Manager or Admin role to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="leave-page-header flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-bold tracking-tight">Probation Leave Policy</h1>
          <p className="text-muted-foreground">Configure which leave types are available per employment status during probation</p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && <span className="text-xs text-green-600 font-medium">Saved successfully</span>}
          {saveError && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" /> {saveError}
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="sticky left-0 bg-muted/50 text-left px-3 py-2.5 font-semibold text-muted-foreground min-w-[140px]">
                Employment Status
              </th>
              {leaveTypes.map((lt) => (
                <th key={lt.id} className="text-center px-2 py-2.5 font-semibold text-muted-foreground min-w-[110px] max-w-[140px]">
                  <span className="truncate block">{lt.leave_name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EMPLOYMENT_TYPES.flatMap((et) =>
              PROBATION_STATUSES.map((ps) => {
                const combos = policies.filter(
                  (p) => p.employment_type === et && p.probation_status === ps,
                );
                const hasAnyPolicy = combos.length > 0;
                return (
                  <tr key={`${et}-${ps}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 bg-card px-3 py-2 text-[11px] font-medium text-foreground">
                      <div>{STATUS_LABELS[et] ?? et}</div>
                      <div className="text-[10px] text-muted-foreground">{STATUS_LABELS[ps] ?? ps}</div>
                    </td>
                    {leaveTypes.map((lt) => {
                      const val = getCellValue(et, ps, lt.id);
                      return (
                        <td key={lt.id} className="px-2 py-2 text-center">
                          <select
                            value={val}
                            onChange={(e) => setCellValue(et, ps, lt.id, e.target.value as CellValue)}
                            className={cellCls}
                          >
                            <option value="allowed">Allow</option>
                            <option value="not_allowed">Not Allowed</option>
                            <option value="requires_hr">Requires HR</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>
          <strong>Allow</strong> — leave type can be used normally.{" "}
          <strong>Not Allowed</strong> — leave type is blocked during this status.{" "}
          <strong>Requires HR</strong> — leave can be applied but requires HR approval. <br />
          Changes take effect immediately for new leave applications.
        </p>
      </div>
    </div>
  );
}
