"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Save,
  User,
  Briefcase,
  DollarSign,
  Receipt,
  Shield,
  Building2,
  Clock,
  FileText,
  History,
  CheckCircle2,
  AlertCircle,
  XCircle,
  KeyRound,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Role {
  code: string;
  name: string;
  type: string;
}

interface Profile {
  id: string;
  employee_id: string | null;
  user_code: string | null;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  phone: string | null;
  address: string | null;
  job_title: string | null;
  department: string | null;
  level: string | null;
  report_to: string | null;
  status: string;
  team_id: string | null;
  position_id: string | null;
  grade: string | null;
  employment_type: string | null;
  join_date: string | null;
  end_date: string | null;
  work_location: string | null;
  suspended_reason: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
  password_changed_at: string | null;
}

interface AuditLog {
  id: string;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

interface PayrollProfile {
  id?: string;
  payroll_type: string;
  currency: string;
  payroll_group: string;
  ot_eligible: boolean;
  tax_applicable: boolean;
  nssf_applicable: boolean;
  effective_date: string;
}

interface TaxProfile {
  id?: string;
  tax_residency: string;
  marital_status: string;
  spouse_dependent: boolean;
  num_children: number;
  tax_id: string;
  effective_date: string;
}

interface NSSFProfile {
  id?: string;
  nssf_applicable: boolean;
  nssf_number: string;
  pension_applicable: boolean;
  healthcare_applicable: boolean;
  occupational_risk_applicable: boolean;
  effective_date: string;
}

interface BankAccount {
  id?: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string;
  is_primary: boolean;
  payment_method: string;
}

interface SalaryLine {
  id: string;
  component: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

interface PayslipRow {
  id: string;
  period: string;
  gross: number;
  deductions: number;
  net: number;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "EM";
}
function labelize(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  suspended: "border-orange-200 bg-orange-50 text-orange-700",
  disabled: "border-red-200 bg-red-50 text-red-700",
  resigned: "border-slate-200 bg-slate-100 text-slate-600",
  terminated: "border-red-200 bg-red-50 text-red-700",
  archived: "border-gray-200 bg-gray-50 text-gray-500",
};
const PAYROLL_STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  paid: "bg-green-100 text-green-800",
};

function ProfileBadge({ complete, label }: { complete: boolean; label: string }) {
  return complete ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
      <CheckCircle2 className="h-3.5 w-3.5" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
      <AlertCircle className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function SwitchRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string }[]>([]);

  // Tab data
  const [payrollProfile, setPayrollProfile] = useState<PayrollProfile>({
    payroll_type: "monthly", currency: "USD", payroll_group: "staff",
    ot_eligible: true, tax_applicable: true, nssf_applicable: true, effective_date: "",
  });
  const [taxProfile, setTaxProfile] = useState<TaxProfile>({
    tax_residency: "resident", marital_status: "single", spouse_dependent: false,
    num_children: 0, tax_id: "", effective_date: "",
  });
  const [nssfProfile, setNSSFProfile] = useState<NSSFProfile>({
    nssf_applicable: true, nssf_number: "", pension_applicable: true,
    healthcare_applicable: true, occupational_risk_applicable: true, effective_date: "",
  });
  const [bankAccount, setBankAccount] = useState<BankAccount>({
    bank_name: "", account_name: "", account_number: "", branch: "",
    is_primary: true, payment_method: "bank_transfer",
  });
  const [salaryLines, setSalaryLines] = useState<SalaryLine[]>([]);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);

  // Track which tabs have saved data
  const [hasPayrollProfile, setHasPayrollProfile] = useState(false);
  const [hasTaxProfile, setHasTaxProfile] = useState(false);
  const [hasNSSFProfile, setHasNSSFProfile] = useState(false);
  const [hasBankAccount, setHasBankAccount] = useState(false);

  // Local editable form for profile
  const [profileForm, setProfileForm] = useState<Partial<Profile>>({});

  // System Access tab state
  const [sysRoles, setSysRoles] = useState<Role[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [sysForm, setSysForm] = useState({ role: "viewer", status: "pending", suspended_reason: "" });

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [refreshAudit, setRefreshAudit] = useState(0);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("employee_payroll_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("employee_tax_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("employee_nssf_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("employee_bank_accounts").select("*").eq("employee_id", id).eq("is_primary", true).maybeSingle(),
      supabase.from("employee_salary_structures")
        .select("id, amount, effective_from, effective_to, payroll_component_types(name)")
        .eq("employee_id", id)
        .order("effective_from", { ascending: false }),
      supabase.from("payroll_entries")
        .select("id, gross_salary, total_deductions, net_salary, status, payroll_periods(label, period_year, period_month)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]).then(([pRes, allRes, ppRes, tpRes, npRes, baRes, ssRes, psRes]) => {
      if (pRes.error || !pRes.data) { router.push("/dashboard/hr/employees"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pRes.data as any;
      setProfile(p);
      setProfileForm(p);
      setSysForm({ role: p.role ?? "viewer", status: p.status ?? "pending", suspended_reason: p.suspended_reason ?? "" });
      setAllProfiles((allRes.data ?? []) as { id: string; full_name: string }[]);

      if (ppRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = ppRes.data as any;
        setPayrollProfile({ id: d.id, payroll_type: d.payroll_type, currency: d.currency, payroll_group: d.payroll_group, ot_eligible: d.ot_eligible, tax_applicable: d.tax_applicable, nssf_applicable: d.nssf_applicable, effective_date: d.effective_date });
        setHasPayrollProfile(true);
      }
      if (tpRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = tpRes.data as any;
        setTaxProfile({ id: d.id, tax_residency: d.tax_residency, marital_status: d.marital_status, spouse_dependent: d.spouse_dependent, num_children: d.num_children, tax_id: d.tax_id ?? "", effective_date: d.effective_date });
        setHasTaxProfile(true);
      }
      if (npRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = npRes.data as any;
        setNSSFProfile({ id: d.id, nssf_applicable: d.nssf_applicable, nssf_number: d.nssf_number ?? "", pension_applicable: d.pension_applicable, healthcare_applicable: d.healthcare_applicable, occupational_risk_applicable: d.occupational_risk_applicable, effective_date: d.effective_date });
        setHasNSSFProfile(true);
      }
      if (baRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = baRes.data as any;
        setBankAccount({ id: d.id, bank_name: d.bank_name, account_name: d.account_name, account_number: d.account_number, branch: d.branch ?? "", is_primary: d.is_primary, payment_method: "bank_transfer" });
        setHasBankAccount(true);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSalaryLines(((ssRes.data ?? []) as any[]).map((s) => ({
        id: s.id,
        component: s.payroll_component_types?.name ?? "—",
        amount: Number(s.amount),
        effective_from: s.effective_from,
        effective_to: s.effective_to,
      })));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPayslips(((psRes.data ?? []) as any[]).map((e) => ({
        id: e.id,
        period: e.payroll_periods?.label ?? `${e.payroll_periods?.period_year}-${String(e.payroll_periods?.period_month).padStart(2, "0")}`,
        gross: Number(e.gross_salary),
        deductions: Number(e.total_deductions),
        net: Number(e.net_salary),
        status: e.status,
      })));

      setLoading(false);
    });
  }, [id, router]);

  // ── Save handlers ────────────────────────────────────────────────────────

  async function savePersonal() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      full_name: profileForm.full_name,
      gender: profileForm.gender || null,
      date_of_birth: profileForm.date_of_birth || null,
      phone: profileForm.phone || null,
      email: profileForm.email,
      address: profileForm.address || null,
      nationality: profileForm.nationality || null,
    }).eq("id", id);
    if (error) { toast.error(error.message); } else { toast.success("Personal info saved"); setProfile((p) => p ? { ...p, ...profileForm } : p); }
    setSaving(false);
  }

  async function saveEmployment() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const newStatus = profileForm.status ?? profile.status;

    // When HR marks resigned or terminated, disable system access automatically
    const systemStatus = (newStatus === "resigned" || newStatus === "terminated") ? "disabled" : newStatus;

    const { error } = await supabase.from("profiles").update({
      department: profileForm.department || null,
      job_title: profileForm.job_title || null,
      level: profileForm.level || null,
      employment_type: profileForm.employment_type || null,
      join_date: profileForm.join_date || null,
      end_date: (profileForm as Record<string, unknown>).end_date as string || null,
      report_to: profileForm.report_to || null,
      status: systemStatus,
      work_location: (profileForm as Record<string, unknown>).work_location as string || null,
    }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      if (systemStatus !== newStatus) {
        toast.success("Employment info saved — system account disabled");
        // Revoke sessions + write audit when auto-disabling
        await fetch(`/api/hr/employees/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "revoke_session",
            event_type: "account_disabled",
            old_value: { status: profile.status },
            new_value: { status: "disabled" },
            note: `Auto-disabled: employment status set to ${newStatus}`,
          }),
        });
        setRefreshAudit((n) => n + 1);
      } else {
        toast.success("Employment info saved");
      }
      setProfile((p) => p ? { ...p, ...profileForm, status: systemStatus } : p);
      setSysForm((f) => ({ ...f, status: systemStatus }));
    }
    setSaving(false);
  }

  async function savePayrollProfile() {
    setSaving(true);
    const supabase = createClient();
    const payload = { employee_id: id, ...payrollProfile };
    let error;
    if (payrollProfile.id) {
      ({ error } = await supabase.from("employee_payroll_profiles").update(payload).eq("id", payrollProfile.id));
    } else {
      const res = await supabase.from("employee_payroll_profiles").insert(payload).select("id").single();
      error = res.error;
      if (res.data) { setPayrollProfile((p) => ({ ...p, id: res.data!.id })); setHasPayrollProfile(true); }
    }
    if (error) { toast.error(error.message); } else { toast.success("Payroll profile saved"); }
    setSaving(false);
  }

  async function saveTaxProfile() {
    setSaving(true);
    const supabase = createClient();
    const payload = { employee_id: id, ...taxProfile };
    let error;
    if (taxProfile.id) {
      ({ error } = await supabase.from("employee_tax_profiles").update(payload).eq("id", taxProfile.id));
    } else {
      const res = await supabase.from("employee_tax_profiles").insert(payload).select("id").single();
      error = res.error;
      if (res.data) { setTaxProfile((p) => ({ ...p, id: res.data!.id })); setHasTaxProfile(true); }
    }
    if (error) { toast.error(error.message); } else { toast.success("Tax profile saved"); }
    setSaving(false);
  }

  async function saveNSSFProfile() {
    setSaving(true);
    const supabase = createClient();
    const payload = { employee_id: id, ...nssfProfile };
    let error;
    if (nssfProfile.id) {
      ({ error } = await supabase.from("employee_nssf_profiles").update(payload).eq("id", nssfProfile.id));
    } else {
      const res = await supabase.from("employee_nssf_profiles").insert(payload).select("id").single();
      error = res.error;
      if (res.data) { setNSSFProfile((p) => ({ ...p, id: res.data!.id })); setHasNSSFProfile(true); }
    }
    if (error) { toast.error(error.message); } else { toast.success("NSSF profile saved"); }
    setSaving(false);
  }

  async function saveBankAccount() {
    setSaving(true);
    const supabase = createClient();
    const payload = { employee_id: id, bank_name: bankAccount.bank_name, account_name: bankAccount.account_name, account_number: bankAccount.account_number, branch: bankAccount.branch || null, is_primary: true };
    let error;
    if (bankAccount.id) {
      ({ error } = await supabase.from("employee_bank_accounts").update(payload).eq("id", bankAccount.id));
    } else {
      const res = await supabase.from("employee_bank_accounts").insert(payload).select("id").single();
      error = res.error;
      if (res.data) { setBankAccount((p) => ({ ...p, id: res.data!.id })); setHasBankAccount(true); }
    }
    if (error) { toast.error(error.message); } else { toast.success("Bank account saved"); }
    setSaving(false);
  }

  // Fetch available RBAC roles + this employee's current assignments
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase.from("roles").select("code, name, type").order("name").then(({ data }) => {
      if (data) setSysRoles(data as Role[]);
    });
    supabase.from("user_roles").select("role_code").eq("user_id", id).then(({ data }) => {
      if (data) setAssignedRoles(data.map((r: { role_code: string }) => r.role_code));
    });
  }, [id]);

  // Fetch audit logs
  useEffect(() => {
    if (!id) return;
    fetch(`/api/hr/employees/${id}`)
      .then((r) => r.json())
      .then(({ logs }) => { if (logs) setAuditLogs(logs as AuditLog[]); })
      .catch(() => {});
  }, [id, refreshAudit]);

  async function saveSystemAccess() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();

    const oldRole = profile.role;
    const oldStatus = profile.status;
    const needsRevoke = ["disabled", "suspended", "archived"].includes(sysForm.status) && sysForm.status !== oldStatus;

    const { error } = await supabase.from("profiles").update({
      role: sysForm.role,
      status: sysForm.status,
      suspended_reason: sysForm.suspended_reason || null,
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }

    // Sync RBAC role assignments
    const { data: existing } = await supabase.from("user_roles").select("role_code").eq("user_id", id);
    const existingCodes = (existing ?? []).map((r: { role_code: string }) => r.role_code);
    const toAdd = assignedRoles.filter((c) => !existingCodes.includes(c));
    const toRemove = existingCodes.filter((c: string) => !assignedRoles.includes(c));
    if (toRemove.length > 0) await supabase.from("user_roles").delete().eq("user_id", id).in("role_code", toRemove);
    if (toAdd.length > 0) await supabase.from("user_roles").insert(toAdd.map((code) => ({ user_id: id, role_code: code })));

    // Determine what changed for audit log
    const events: { event_type: string; old_value: Record<string, unknown>; new_value: Record<string, unknown>; note?: string }[] = [];
    if (sysForm.role !== oldRole) {
      events.push({ event_type: "role_changed", old_value: { role: oldRole }, new_value: { role: sysForm.role } });
    }
    if (sysForm.status !== oldStatus) {
      events.push({
        event_type: "status_changed",
        old_value: { status: oldStatus },
        new_value: { status: sysForm.status },
        note: sysForm.status === "suspended" ? sysForm.suspended_reason : undefined,
      });
    }
    if (toAdd.length > 0 || toRemove.length > 0) {
      events.push({ event_type: "roles_updated", old_value: { removed: toRemove }, new_value: { added: toAdd } });
    }

    for (const ev of events) {
      await fetch(`/api/hr/employees/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(needsRevoke && ev === events[0] ? { action: "revoke_session" } : {}),
          ...ev,
        }),
      });
    }

    // If revoke needed but no events were logged, still revoke
    if (needsRevoke && events.length === 0) {
      await fetch(`/api/hr/employees/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_session", event_type: "session_revoked", old_value: { status: oldStatus }, new_value: { status: sysForm.status } }),
      });
    }

    toast.success("System access updated");
    setProfile((p) => p ? { ...p, role: sysForm.role, status: sysForm.status } : p);
    setRefreshAudit((n) => n + 1);
    setSaving(false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!profile) return null;

  const isArchived = profile.status === "archived";

  return (
    <div className="space-y-6">
      {/* Archived read-only banner */}
      {isArchived && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <XCircle className="h-4 w-4 shrink-0 text-gray-400" />
          <span>This account is <strong>Archived</strong> — all records are read-only. Changes cannot be saved.</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-0.5">
          <Link href="/dashboard/hr/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex flex-1 items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">{initials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight">{profile.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              {profile.employee_id ?? "—"} · {profile.job_title ?? labelize(profile.department)} · {profile.email}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("capitalize text-xs", STATUS_BADGE[profile.status] ?? "")}>
                {profile.status}
              </Badge>
              <ProfileBadge complete={hasPayrollProfile} label="Payroll Profile" />
              <ProfileBadge complete={hasTaxProfile} label="Tax Profile" />
              <ProfileBadge complete={hasNSSFProfile} label="NSSF Profile" />
              <ProfileBadge complete={hasBankAccount} label="Bank Account" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0 border-b border-border rounded-none pb-0">
          {[
            { value: "personal", icon: User, label: "Personal Info" },
            { value: "employment", icon: Briefcase, label: "Employment" },
            { value: "system-access", icon: KeyRound, label: "System Access" },
            { value: "payroll", icon: DollarSign, label: "Payroll Profile" },
            { value: "tax", icon: Receipt, label: "Tax Profile" },
            { value: "nssf", icon: Shield, label: "NSSF Profile" },
            { value: "bank", icon: Building2, label: "Bank Info" },
            { value: "salary-history", icon: Clock, label: "Salary History" },
            { value: "payslips", icon: FileText, label: "Payslips" },
            { value: "audit", icon: History, label: "Audit History" },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Personal Info ─────────────────────────────────────────────── */}
        <TabsContent value="personal" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Full Name (English)">
                <Input value={profileForm.full_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, full_name: e.target.value }))} />
              </Field>
              <Field label="Gender">
                <NativeSelect value={profileForm.gender ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, gender: v }))} placeholder="—">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </NativeSelect>
              </Field>
              <Field label="Date of Birth">
                <Input type="date" value={profileForm.date_of_birth ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
              </Field>
              <Field label="Nationality">
                <Input value={(profileForm as Record<string, unknown>).nationality as string ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, nationality: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input value={profileForm.phone ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
              </Field>
              <Field label="Email">
                <Input type="email" value={profileForm.email ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <Input value={profileForm.address ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} />
                </Field>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={savePersonal} disabled={saving || isArchived} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Employment Info ───────────────────────────────────────────── */}
        <TabsContent value="employment" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Employment Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Department">
                <Input value={profileForm.department ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, department: e.target.value }))} />
              </Field>
              <Field label="Job Title / Position">
                <Input value={profileForm.job_title ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, job_title: e.target.value }))} />
              </Field>
              <Field label="Line Manager">
                <NativeSelect value={profileForm.report_to ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, report_to: v }))} placeholder="—">
                  {allProfiles.filter((p) => p.id !== id).map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Employment Type">
                <NativeSelect value={profileForm.employment_type ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, employment_type: v }))} placeholder="—">
                  {["permanent", "contract", "probation", "intern"].map((t) => (
                    <option key={t} value={t}>{labelize(t)}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Join Date">
                <Input type="date" value={profileForm.join_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, join_date: e.target.value }))} />
              </Field>
              <Field label="End Date">
                <Input type="date" value={(profileForm as Record<string, unknown>).end_date as string ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, end_date: e.target.value }))} />
              </Field>
              <Field label="Work Location">
                <NativeSelect value={(profileForm as Record<string, unknown>).work_location as string ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, work_location: v }))} placeholder="—">
                  {["office", "site", "hybrid"].map((l) => <option key={l} value={l}>{labelize(l)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Status">
                <NativeSelect value={profileForm.status ?? "active"} onChange={(v) => setProfileForm((p) => ({ ...p, status: v }))}>
                  {["active", "inactive", "resigned", "terminated"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                </NativeSelect>
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveEmployment} disabled={saving || isArchived} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── System Access ─────────────────────────────────────────────── */}
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

        {/* ── Payroll Profile ───────────────────────────────────────────── */}
        <TabsContent value="payroll" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Payroll Profile
                {!hasPayrollProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Payroll Type">
                  <NativeSelect value={payrollProfile.payroll_type} onChange={(v) => setPayrollProfile((p) => ({ ...p, payroll_type: v }))}>
                    <option value="monthly">Monthly</option>
                  </NativeSelect>
                </Field>
                <Field label="Currency">
                  <NativeSelect value={payrollProfile.currency} onChange={(v) => setPayrollProfile((p) => ({ ...p, currency: v }))}>
                    <option value="USD">USD</option>
                    <option value="KHR">KHR</option>
                  </NativeSelect>
                </Field>
                <Field label="Payroll Group">
                  <NativeSelect value={payrollProfile.payroll_group} onChange={(v) => setPayrollProfile((p) => ({ ...p, payroll_group: v }))}>
                    <option value="staff">Staff</option>
                    <option value="site_staff">Site Staff</option>
                    <option value="management">Management</option>
                  </NativeSelect>
                </Field>
                <Field label="Effective Date">
                  <Input type="date" value={payrollProfile.effective_date} onChange={(e) => setPayrollProfile((p) => ({ ...p, effective_date: e.target.value }))} />
                </Field>
              </div>
              <div className="space-y-2">
                <SwitchRow label="OT Eligible" description="Employee qualifies for overtime pay" checked={payrollProfile.ot_eligible} onChange={(v) => setPayrollProfile((p) => ({ ...p, ot_eligible: v }))} />
                <SwitchRow label="Tax Applicable (TOS)" description="Cambodia Tax on Salary applies" checked={payrollProfile.tax_applicable} onChange={(v) => setPayrollProfile((p) => ({ ...p, tax_applicable: v }))} />
                <SwitchRow label="NSSF Applicable" description="National Social Security Fund contribution required" checked={payrollProfile.nssf_applicable} onChange={(v) => setPayrollProfile((p) => ({ ...p, nssf_applicable: v }))} />
              </div>
              <div className="flex justify-end">
                <Button onClick={savePayrollProfile} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Payroll Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tax Profile ───────────────────────────────────────────────── */}
        <TabsContent value="tax" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Tax Profile — Cambodia TOS
                {!hasTaxProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tax Residency">
                  <NativeSelect value={taxProfile.tax_residency} onChange={(v) => setTaxProfile((p) => ({ ...p, tax_residency: v }))}>
                    <option value="resident">Resident</option>
                    <option value="non_resident">Non-Resident (Flat 20%)</option>
                  </NativeSelect>
                </Field>
                <Field label="Marital Status">
                  <NativeSelect value={taxProfile.marital_status} onChange={(v) => setTaxProfile((p) => ({ ...p, marital_status: v }))}>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                  </NativeSelect>
                </Field>
                <Field label="Number of Children">
                  <Input type="number" min={0} value={taxProfile.num_children} onChange={(e) => setTaxProfile((p) => ({ ...p, num_children: parseInt(e.target.value) || 0 }))} />
                </Field>
                <Field label="Tax Identification Number (TIN)">
                  <Input value={taxProfile.tax_id} onChange={(e) => setTaxProfile((p) => ({ ...p, tax_id: e.target.value }))} placeholder="Optional" />
                </Field>
                <Field label="Effective Date">
                  <Input type="date" value={taxProfile.effective_date} onChange={(e) => setTaxProfile((p) => ({ ...p, effective_date: e.target.value }))} />
                </Field>
              </div>
              <SwitchRow
                label="Spouse Dependent Relief"
                description="Spouse is financially dependent — 150,000 KHR/month relief"
                checked={taxProfile.spouse_dependent}
                onChange={(v) => setTaxProfile((p) => ({ ...p, spouse_dependent: v }))}
              />
              {taxProfile.marital_status === "single" && taxProfile.spouse_dependent && (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Spouse relief requires marital status = Married
                </div>
              )}
              {taxProfile.num_children > 0 && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Child relief: {taxProfile.num_children} × 150,000 KHR = {(taxProfile.num_children * 150000).toLocaleString()} KHR/month
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={saveTaxProfile} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Tax Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── NSSF Profile ──────────────────────────────────────────────── */}
        <TabsContent value="nssf" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                NSSF Profile
                {!hasNSSFProfile && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow label="NSSF Applicable" description="Employee is enrolled in NSSF" checked={nssfProfile.nssf_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, nssf_applicable: v }))} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="NSSF Number">
                  <Input value={nssfProfile.nssf_number} onChange={(e) => setNSSFProfile((p) => ({ ...p, nssf_number: e.target.value }))} placeholder={nssfProfile.nssf_applicable ? "Required" : "N/A"} disabled={!nssfProfile.nssf_applicable} />
                </Field>
                <Field label="Effective Date">
                  <Input type="date" value={nssfProfile.effective_date} onChange={(e) => setNSSFProfile((p) => ({ ...p, effective_date: e.target.value }))} />
                </Field>
              </div>
              <div className="space-y-2">
                <SwitchRow label="Pension" description="2% employee + 2% employer contribution" checked={nssfProfile.pension_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, pension_applicable: v }))} />
                <SwitchRow label="Healthcare" description="Employer healthcare contribution" checked={nssfProfile.healthcare_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, healthcare_applicable: v }))} />
                <SwitchRow label="Occupational Risk" description="0.8% employer contribution" checked={nssfProfile.occupational_risk_applicable} onChange={(v) => setNSSFProfile((p) => ({ ...p, occupational_risk_applicable: v }))} />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveNSSFProfile} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save NSSF Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bank Info ─────────────────────────────────────────────────── */}
        <TabsContent value="bank" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Bank Account & Payment
                {!hasBankAccount && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">Not Set</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Payment Method">
                <NativeSelect value={bankAccount.payment_method} onChange={(v) => setBankAccount((p) => ({ ...p, payment_method: v }))}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </NativeSelect>
              </Field>
              <Field label="Bank Name">
                <Input value={bankAccount.bank_name} onChange={(e) => setBankAccount((p) => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. ABA Bank" disabled={bankAccount.payment_method !== "bank_transfer"} />
              </Field>
              <Field label="Account Name">
                <Input value={bankAccount.account_name} onChange={(e) => setBankAccount((p) => ({ ...p, account_name: e.target.value }))} disabled={bankAccount.payment_method !== "bank_transfer"} />
              </Field>
              <Field label="Account Number">
                <Input value={bankAccount.account_number} onChange={(e) => setBankAccount((p) => ({ ...p, account_number: e.target.value }))} disabled={bankAccount.payment_method !== "bank_transfer"} />
              </Field>
              <Field label="Branch">
                <Input value={bankAccount.branch} onChange={(e) => setBankAccount((p) => ({ ...p, branch: e.target.value }))} placeholder="Optional" disabled={bankAccount.payment_method !== "bank_transfer"} />
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveBankAccount} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Bank Info
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Salary History ────────────────────────────────────────────── */}
        <TabsContent value="salary-history" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Salary History</CardTitle>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dashboard/hr/payroll/setup`}>Edit Salary Structure</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {salaryLines.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No salary structure configured yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Component</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-left font-medium">From</th>
                      <th className="px-4 py-2.5 text-left font-medium">To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {salaryLines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{line.component}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(line.amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(line.effective_from)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{line.effective_to ? fmtDate(line.effective_to) : "Current"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payslips ──────────────────────────────────────────────────── */}
        <TabsContent value="payslips" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Payslip History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payslips.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No payslips generated yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Period</th>
                      <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                      <th className="px-4 py-2.5 text-right font-medium">Deductions</th>
                      <th className="px-4 py-2.5 text-right font-medium">Net Pay</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payslips.map((ps) => (
                      <tr key={ps.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{ps.period}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(ps.gross)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">-{fmtMoney(ps.deductions)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{fmtMoney(ps.net)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", PAYROLL_STATUS[ps.status] ?? "bg-gray-100 text-gray-600")}>
                            {ps.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/dashboard/hr/payroll/my-payslip?entry=${ps.id}`} className="text-xs text-primary hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Audit History ─────────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">User Management Audit Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <History className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No audit events yet. Events are recorded when account status, roles, or access change.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Event</th>
                      <th className="px-4 py-2.5 text-left font-medium">Details</th>
                      <th className="px-4 py-2.5 text-left font-medium">By</th>
                      <th className="px-4 py-2.5 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditLogs.map((log) => {
                      const label: Record<string, string> = {
                        user_created:      "Account Created",
                        status_changed:    "Status Changed",
                        role_changed:      "System Role Changed",
                        roles_updated:     "RBAC Roles Updated",
                        account_disabled:  "Account Disabled",
                        account_suspended: "Account Suspended",
                        session_revoked:   "Sessions Revoked",
                        employment_updated:"Employment Updated",
                      };
                      const oldStatus = log.old_value?.status as string | undefined;
                      const newStatus = log.new_value?.status as string | undefined;
                      const detail = log.note
                        ? log.note
                        : oldStatus && newStatus
                          ? `${labelize(oldStatus)} → ${labelize(newStatus)}`
                          : log.old_value && log.new_value
                            ? JSON.stringify(log.new_value)
                            : "—";
                      return (
                        <tr key={log.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{label[log.event_type] ?? log.event_type}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{detail}</td>
                          <td className="px-4 py-3 text-muted-foreground">{log.actor?.full_name ?? "System"}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
