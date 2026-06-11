"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STANDARD_POSITION_GROUPS, isStandardPositionName } from "@/lib/hr/standard-positions";
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
  ClipboardCheck,
  FolderTree,
  MapPin,
  PackageCheck,
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
  khmer_name: string | null;
  english_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  phone: string | null;
  address: string | null;
  current_address: string | null;
  permanent_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_address: string | null;
  job_title: string | null;
  department: string | null;
  level: string | null;
  report_to: string | null;
  status: string;
  team_id: string | null;
  position_id: string | null;
  grade: string | null;
  employment_type: string | null;
  employment_category: string | null;
  join_date: string | null;
  work_location: string | null;
  company: string | null;
  division: string | null;
  section: string | null;
  cost_center: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  seniority_start_date: string | null;
  labor_category: string | null;
  leave_group: string | null;
  payroll_group: string | null;
  attendance_site: string | null;
  shift_group: string | null;
  national_id_number: string | null;
  national_id_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  visa_number: string | null;
  visa_expiry: string | null;
  work_permit_number: string | null;
  work_permit_expiry: string | null;
  tax_identification_number: string | null;
  employment_contract_number: string | null;
  rfid_card: string | null;
  fingerprint_id: string | null;
  face_recognition_id: string | null;
  door_access_group: string | null;
  parking_access: string | null;
  shirt_size: string | null;
  pant_size: string | null;
  safety_shoe_size: string | null;
  helmet_size: string | null;
  vest_size: string | null;
  suspended_reason: string | null;
  probation_status: string | null;
  probation_end_date: string | null;
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

interface HrHistoryLog {
  id: string;
  change_type: string;
  field_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  effective_date: string | null;
  approval_reference: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

interface EmployeeDocumentRow {
  id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  verified: boolean | null;
}

interface ChecklistStatusRow {
  id: string;
  status: string;
  waived_reason: string | null;
  document_id: string | null;
  employee_document_checklist_items: {
    label: string;
    document_type: string;
    is_mandatory: boolean;
  }[] | null;
}

interface AssignmentRow {
  id: string;
  project_id: string;
  role_in_project: string | null;
  allocation_percent: number;
  start_date: string;
  end_date: string | null;
  status: string;
  projects: { project_name: string | null; project_code: string | null } | null;
}

type AssignmentQueryRow = Omit<AssignmentRow, "allocation_percent"> & {
  allocation_percent: number | string;
};

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

  // Probation confirmation
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // System Access tab state
  const [sysRoles, setSysRoles] = useState<Role[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [sysForm, setSysForm] = useState({ role: "viewer", status: "pending", suspended_reason: "" });

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [hrHistoryLogs, setHrHistoryLogs] = useState<HrHistoryLog[]>([]);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [checklistStatuses, setChecklistStatuses] = useState<ChecklistStatusRow[]>([]);
  const [projectAssignments, setProjectAssignments] = useState<AssignmentRow[]>([]);
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
      supabase.from("employee_documents")
        .select("id, document_type, document_name, expiry_date, verified")
        .eq("employee_id", id)
        .order("document_type"),
      supabase.from("employee_document_checklist_status")
        .select("id, status, waived_reason, document_id, employee_document_checklist_items(label, document_type, is_mandatory)")
        .eq("employee_id", id),
      supabase.from("employee_project_assignments")
        .select("id, project_id, role_in_project, allocation_percent, start_date, end_date, status, projects(project_name, project_code)")
        .eq("employee_id", id)
        .order("start_date", { ascending: false }),
    ]).then(([pRes, allRes, ppRes, tpRes, npRes, baRes, ssRes, psRes, docRes, checklistRes, assignmentRes]) => {
      if (pRes.error || !pRes.data) { router.push("/dashboard/hr/employees"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pRes.data as any;
      setProfile(p);
      setProfileForm({ ...p, current_address: p.current_address ?? p.address ?? null });
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

      setEmployeeDocuments((docRes.data ?? []) as EmployeeDocumentRow[]);
      setChecklistStatuses((checklistRes.data ?? []) as ChecklistStatusRow[]);
      setProjectAssignments(((assignmentRes.data ?? []) as AssignmentQueryRow[]).map((row) => ({
        ...row,
        allocation_percent: Number(row.allocation_percent),
      })) as AssignmentRow[]);

      setLoading(false);
    });
  }, [id, router]);

  // ── Save handlers ────────────────────────────────────────────────────────

  async function saveProfileSection(updates: Record<string, unknown>, successMessage: string, reason?: string) {
    setSaving(true);
    const res = await fetch(`/api/hr/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates,
        reason: reason ?? "Employee Master profile update",
        effective_date: new Date().toISOString().slice(0, 10),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to save employee profile");
      setSaving(false);
      return false;
    }
    toast.success(successMessage);
    const supabase = createClient();
    const { data: refreshed } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (refreshed) {
      setProfile(refreshed as Profile);
      setProfileForm(refreshed as Profile);
    }
    setRefreshAudit((n) => n + 1);
    setSaving(false);
    return true;
  }

  async function savePersonal() {
    if (!profile) return;
    await saveProfileSection({
      full_name: profileForm.full_name,
      khmer_name: profileForm.khmer_name || null,
      gender: profileForm.gender || null,
      date_of_birth: profileForm.date_of_birth || null,
      phone: profileForm.phone || null,
      nationality: profileForm.nationality || null,
      current_address: profileForm.current_address || profileForm.address || null,
      emergency_contact_name: profileForm.emergency_contact_name || null,
      emergency_contact_relationship: profileForm.emergency_contact_relationship || null,
      emergency_contact_phone: profileForm.emergency_contact_phone || null,
      emergency_contact_address: profileForm.emergency_contact_address || null,
    }, "Personal info saved");
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
      employment_category: profileForm.employment_category || null,
      grade: profileForm.grade || null,
      email: profileForm.email,
      join_date: profileForm.join_date || null,
      work_location: profileForm.work_location || null,
      company: profileForm.company || null,
      division: profileForm.division || null,
      section: profileForm.section || null,
      cost_center: profileForm.cost_center || null,
      contract_start_date: profileForm.contract_start_date || null,
      contract_end_date: profileForm.contract_end_date || null,
      seniority_start_date: profileForm.seniority_start_date || null,
      labor_category: profileForm.labor_category || null,
      report_to: profileForm.report_to || null,
      status: systemStatus,
      probation_status: (profileForm as Record<string, unknown>).probation_status as string || null,
      probation_end_date: (profileForm as Record<string, unknown>).probation_end_date as string || null,
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
      const { data: refreshed } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (refreshed) {
        setProfile(refreshed as Profile);
        setProfileForm(refreshed as Profile);
      }
      setSysForm((f) => ({ ...f, status: systemStatus }));
    }
    setSaving(false);
  }

  async function saveCompliance() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      national_id_number: profileForm.national_id_number || null,
      national_id_expiry: profileForm.national_id_expiry || null,
      passport_number: profileForm.passport_number || null,
      passport_expiry: profileForm.passport_expiry || null,
      visa_number: profileForm.visa_number || null,
      visa_expiry: profileForm.visa_expiry || null,
      work_permit_number: profileForm.work_permit_number || null,
      work_permit_expiry: profileForm.work_permit_expiry || null,
      tax_identification_number: profileForm.tax_identification_number || null,
      employment_contract_number: profileForm.employment_contract_number || null,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Compliance info saved");
    setSaving(false);
  }

  async function saveAttendanceAssets() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      leave_group: profileForm.leave_group || null,
      payroll_group: profileForm.payroll_group || null,
      attendance_site: profileForm.attendance_site || null,
      shift_group: profileForm.shift_group || null,
      rfid_card: profileForm.rfid_card || null,
      fingerprint_id: profileForm.fingerprint_id || null,
      face_recognition_id: profileForm.face_recognition_id || null,
      door_access_group: profileForm.door_access_group || null,
      parking_access: profileForm.parking_access || null,
      shirt_size: profileForm.shirt_size || null,
      pant_size: profileForm.pant_size || null,
      safety_shoe_size: profileForm.safety_shoe_size || null,
      helmet_size: profileForm.helmet_size || null,
      vest_size: profileForm.vest_size || null,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Leave, attendance, asset, and access setup saved");
    setSaving(false);
  }

  async function runLifecycleAction(action: string, label: string) {
    if (!profile) return;
    const reason = window.prompt(`Reason for ${label.toLowerCase()}:`);
    if (reason === null) return;
    setSaving(true);
    const res = await fetch(`/api/hr/employees/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reason: reason.trim() || label,
        effective_date: new Date().toISOString().slice(0, 10),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || `Failed to ${label.toLowerCase()}`);
    } else {
      toast.success(label);
      const supabase = createClient();
      const { data: refreshed } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (refreshed) {
        setProfile(refreshed as Profile);
        setProfileForm(refreshed as Profile);
        setSysForm((f) => ({ ...f, status: (refreshed as Profile).status }));
      }
      setRefreshAudit((n) => n + 1);
    }
    setSaving(false);
  }

  async function confirmProbation() {
    setConfirming(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({
      probation_status: "completed",
      confirmation_date: new Date().toISOString().split("T")[0],
      confirmed_by: userData?.user?.id ?? null,
    }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Probation confirmed successfully");
      setProfileForm((p) => ({
        ...p,
        probation_status: "completed",
        confirmation_date: new Date().toISOString().split("T")[0],
      }));
      setProfile((p) => p ? {
        ...p,
        probation_status: "completed",
        confirmation_date: new Date().toISOString().split("T")[0],
      } : p);
      setShowConfirmDialog(false);
    }
    setConfirming(false);
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
      .then(({ logs, history }) => {
        if (logs) setAuditLogs(logs as AuditLog[]);
        if (history) setHrHistoryLogs(history as HrHistoryLog[]);
      })
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
    <>
    <div className="space-y-6">
      {/* Archived read-only banner */}
      {isArchived && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <XCircle className="h-4 w-4 shrink-0 text-gray-400" />
          <span>This account is <strong>Archived</strong> — all records are read-only. Changes cannot be saved.</span>
        </div>
      )}
      {/* Header */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-background via-background to-muted/30 p-5">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="-ml-2 mt-0.5 shrink-0">
            <Link href="/dashboard/hr/employees"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex flex-1 items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 ring-2 ring-border ring-offset-2 ring-offset-background">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials(profile.full_name)}</AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background",
                profile.status === "active" ? "bg-emerald-500" : "bg-amber-400"
              )} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">
                {profile.employee_id ?? "—"} · {profile.job_title ?? labelize(profile.department)} · {profile.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className={cn("capitalize text-xs", STATUS_BADGE[profile.status] ?? "")}>
                  {profile.status}
                </Badge>
              </div>
            </div>
          </div>
          {/* Profile completion mini-bar */}
          <div className="hidden sm:flex sm:items-center sm:gap-3">
            {[
              { label: "Payroll", ok: hasPayrollProfile },
              { label: "Tax", ok: hasTaxProfile },
              { label: "NSSF", ok: hasNSSFProfile },
              { label: "Bank", ok: hasBankAccount },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5">
                <div className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-500" : "bg-amber-300")} />
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
        {!isArchived && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("submit", "Submitted for approval")}>Submit</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("approve", "Approved")}>Approve</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("activate", "Activated")}>Activate</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("suspend", "Suspended")}>Suspend</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("resign", "Resigned")}>Resign</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("terminate", "Terminated")}>Terminate</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("archive", "Archived")}>Archive</Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/40 p-1.5 rounded-xl border border-border">
          {[
            { value: "personal", icon: User, label: "Personal Info" },
            { value: "employment", icon: Briefcase, label: "Employment" },
            { value: "system-access", icon: KeyRound, label: "System Access" },
            { value: "compliance", icon: Shield, label: "Compliance" },
            { value: "documents", icon: ClipboardCheck, label: "Documents" },
            { value: "assignments", icon: FolderTree, label: "Assignments" },
            { value: "attendance-assets", icon: MapPin, label: "Leave / Assets" },
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
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted-foreground/10 data-[active]:bg-emerald-50 data-[active]:text-emerald-700 data-[active]:shadow-sm data-[active]:ring-1 data-[active]:ring-emerald-200"
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
              <Field label="Khmer Name">
                <Input value={profileForm.khmer_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, khmer_name: e.target.value }))} />
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
              <div className="md:col-span-2">
                <Field label="Current Address">
                  <Input
                    value={profileForm.current_address ?? profileForm.address ?? ""}
                    onChange={(e) => setProfileForm((p) => ({ ...p, current_address: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Emergency Contact">
                <Input value={profileForm.emergency_contact_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
              </Field>
              <Field label="Emergency Relationship">
                <Input value={profileForm.emergency_contact_relationship ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_relationship: e.target.value }))} />
              </Field>
              <Field label="Emergency Phone">
                <Input value={profileForm.emergency_contact_phone ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
              </Field>
              <Field label="Emergency Address">
                <Input value={profileForm.emergency_contact_address ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_address: e.target.value }))} />
              </Field>
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
              <div className="md:col-span-2">
                <Field label="Employee ID (HR Assigned)">
                  <Input value={profileForm.employee_id ?? ""} disabled placeholder="Generated after join date is saved" />
                </Field>
              </div>
              <Field label="Department">
                <NativeSelect value={profileForm.department ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, department: v }))} placeholder="Select department">
                  {["Management", "Architecture", "Structure", "MEP", "Procurement", "Quantity Surveying", "Construction", "Account & Finance", "HR & Admin"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Job Title / Position">
                <NativeSelect value={profileForm.job_title ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, job_title: v }))} placeholder="Select position">
                  {profileForm.job_title && !isStandardPositionName(profileForm.job_title) && (
                    <option value={profileForm.job_title}>{profileForm.job_title} (Current)</option>
                  )}
                  {STANDARD_POSITION_GROUPS.map(({ group, positions }) => (
                    <optgroup key={group} label={group}>
                      {positions.map((position) => (
                        <option key={position.code} value={position.name}>
                          {position.code} - {position.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </Field>
              <div className="md:col-span-2">
                <Field label="Email">
                  <Input type="email" value={profileForm.email ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
                </Field>
              </div>
              <Field label="Line Manager">
                <NativeSelect value={profileForm.report_to ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, report_to: v }))} placeholder="—">
                  {allProfiles.filter((p) => p.id !== id).map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Employment Type">
                <NativeSelect value={profileForm.employment_type ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, employment_type: v }))} placeholder="—">
                  {["permanent", "contract", "temporary", "intern"].map((t) => (
                    <option key={t} value={t}>{labelize(t)}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Grade">
                <NativeSelect value={profileForm.grade ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, grade: v }))} placeholder="—">
                  {["L1", "L2", "L3", "L4", "L5", "L6"].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Join Date">
                <Input type="date" value={profileForm.join_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, join_date: e.target.value }))} />
              </Field>
              <Field label="Work Location">
                <NativeSelect value={(profileForm as Record<string, unknown>).work_location as string ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, work_location: v }))} placeholder="—">
                  {["office", "site", "hybrid"].map((l) => <option key={l} value={l}>{labelize(l)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Company">
                <Input value={profileForm.company ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, company: e.target.value }))} />
              </Field>
              <Field label="Division">
                <Input value={profileForm.division ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, division: e.target.value }))} />
              </Field>
              <Field label="Section">
                <Input value={profileForm.section ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, section: e.target.value }))} />
              </Field>
              <Field label="Cost Center">
                <Input value={profileForm.cost_center ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, cost_center: e.target.value }))} />
              </Field>
              <Field label="Employment Category">
                <NativeSelect value={profileForm.employment_category ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, employment_category: v }))} placeholder="Select category">
                  {["executive", "management", "professional", "technical", "administration", "site_staff", "labor", "intern"].map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Labor Category">
                <Input value={profileForm.labor_category ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, labor_category: e.target.value }))} />
              </Field>
              <Field label="Contract Start Date">
                <Input type="date" value={profileForm.contract_start_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, contract_start_date: e.target.value }))} />
              </Field>
              <Field label="Contract End Date">
                <Input type="date" value={profileForm.contract_end_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, contract_end_date: e.target.value }))} />
              </Field>
              <Field label="Seniority Start Date">
                <Input type="date" value={profileForm.seniority_start_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, seniority_start_date: e.target.value }))} />
              </Field>
              <Field label="Probation Status">
                <NativeSelect value={profileForm.probation_status ?? "not_applicable"} onChange={(v) => setProfileForm((p) => ({ ...p, probation_status: v }))}>
                  {["not_applicable", "active", "completed", "extended", "failed"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Probation End Date">
                <Input type="date" value={profileForm.probation_end_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, probation_end_date: e.target.value }))} />
              </Field>
              {profileForm.probation_status === "active" && (
                <div className="md:col-span-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-amber-800">Probation In Progress</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {profileForm.probation_end_date
                            ? `Probation ends ${fmtDate(profileForm.probation_end_date)}`
                            : "No probation end date set"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowConfirmDialog(true)}
                        className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm Probation
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
        <TabsContent value="compliance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Cambodia Compliance Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="National ID Number"><Input value={profileForm.national_id_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, national_id_number: e.target.value }))} /></Field>
              <Field label="National ID Expiry"><Input type="date" value={profileForm.national_id_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, national_id_expiry: e.target.value }))} /></Field>
              <Field label="Passport Number"><Input value={profileForm.passport_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, passport_number: e.target.value }))} /></Field>
              <Field label="Passport Expiry"><Input type="date" value={profileForm.passport_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, passport_expiry: e.target.value }))} /></Field>
              <Field label="Visa Number"><Input value={profileForm.visa_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, visa_number: e.target.value }))} /></Field>
              <Field label="Visa Expiry"><Input type="date" value={profileForm.visa_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, visa_expiry: e.target.value }))} /></Field>
              <Field label="Work Permit Number"><Input value={profileForm.work_permit_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, work_permit_number: e.target.value }))} /></Field>
              <Field label="Work Permit Expiry"><Input type="date" value={profileForm.work_permit_expiry ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, work_permit_expiry: e.target.value }))} /></Field>
              <Field label="TIN"><Input value={profileForm.tax_identification_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, tax_identification_number: e.target.value }))} /></Field>
              <Field label="Employment Contract Number"><Input value={profileForm.employment_contract_number ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, employment_contract_number: e.target.value }))} /></Field>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveCompliance} disabled={saving || isArchived} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Compliance</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">Document Checklist</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {checklistStatuses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No checklist status generated yet.</p> : checklistStatuses.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{item.employee_document_checklist_items?.[0]?.label ?? "Document"}</p>
                      <p className="text-xs text-muted-foreground">{item.employee_document_checklist_items?.[0]?.is_mandatory ? "Mandatory" : "Optional"}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{labelize(item.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">Uploaded Documents</CardTitle></CardHeader>
              <CardContent className="p-0">
                {employeeDocuments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No documents uploaded yet.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground"><th className="px-4 py-2.5 text-left font-medium">Document</th><th className="px-4 py-2.5 text-left font-medium">Expiry</th><th className="px-4 py-2.5 text-center font-medium">Verified</th></tr></thead>
                    <tbody className="divide-y divide-border">{employeeDocuments.map((doc) => (
                      <tr key={doc.id}><td className="px-4 py-3"><p className="font-medium">{doc.document_name}</p><p className="text-xs text-muted-foreground">{labelize(doc.document_type)}</p></td><td className="px-4 py-3 text-muted-foreground">{fmtDate(doc.expiry_date)}</td><td className="px-4 py-3 text-center">{doc.verified ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : <AlertCircle className="mx-auto h-4 w-4 text-amber-500" />}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Project / WBS Assignment</CardTitle></CardHeader>
            <CardContent className="p-0">
              {projectAssignments.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No active project assignments.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground"><th className="px-4 py-2.5 text-left font-medium">Project</th><th className="px-4 py-2.5 text-left font-medium">Role</th><th className="px-4 py-2.5 text-right font-medium">Allocation</th><th className="px-4 py-2.5 text-left font-medium">Period</th><th className="px-4 py-2.5 text-center font-medium">Status</th></tr></thead>
                  <tbody className="divide-y divide-border">{projectAssignments.map((assignment) => (
                    <tr key={assignment.id}><td className="px-4 py-3"><p className="font-medium">{assignment.projects?.project_name ?? "Project"}</p><p className="text-xs text-muted-foreground">{assignment.projects?.project_code ?? assignment.project_id}</p></td><td className="px-4 py-3 text-muted-foreground">{assignment.role_in_project ?? "-"}</td><td className="px-4 py-3 text-right tabular-nums">{assignment.allocation_percent}%</td><td className="px-4 py-3 text-muted-foreground">{fmtDate(assignment.start_date)} - {assignment.end_date ? fmtDate(assignment.end_date) : "Current"}</td><td className="px-4 py-3 text-center"><Badge variant="outline" className="capitalize">{labelize(assignment.status)}</Badge></td></tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance-assets" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4" /> Leave, Attendance, Asset & Access Setup</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Leave Group"><Input value={profileForm.leave_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, leave_group: e.target.value }))} /></Field>
              <Field label="Payroll Group"><Input value={profileForm.payroll_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, payroll_group: e.target.value }))} /></Field>
              <Field label="Attendance Site"><Input value={profileForm.attendance_site ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, attendance_site: e.target.value }))} /></Field>
              <Field label="Shift / Work Calendar"><Input value={profileForm.shift_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, shift_group: e.target.value }))} /></Field>
              <Field label="RFID Card"><Input value={profileForm.rfid_card ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, rfid_card: e.target.value }))} /></Field>
              <Field label="Fingerprint ID"><Input value={profileForm.fingerprint_id ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, fingerprint_id: e.target.value }))} /></Field>
              <Field label="Face Recognition ID"><Input value={profileForm.face_recognition_id ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, face_recognition_id: e.target.value }))} /></Field>
              <Field label="Door Access Group"><Input value={profileForm.door_access_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, door_access_group: e.target.value }))} /></Field>
              <Field label="Parking Access"><Input value={profileForm.parking_access ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, parking_access: e.target.value }))} /></Field>
              <Field label="Shirt Size"><Input value={profileForm.shirt_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, shirt_size: e.target.value }))} /></Field>
              <Field label="Pant Size"><Input value={profileForm.pant_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, pant_size: e.target.value }))} /></Field>
              <Field label="Safety Shoe Size"><Input value={profileForm.safety_shoe_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, safety_shoe_size: e.target.value }))} /></Field>
              <Field label="Helmet Size"><Input value={profileForm.helmet_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, helmet_size: e.target.value }))} /></Field>
              <Field label="Vest Size"><Input value={profileForm.vest_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, vest_size: e.target.value }))} /></Field>
              <div className="md:col-span-2 flex justify-end"><Button onClick={saveAttendanceAssets} disabled={saving || isArchived} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Setup</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

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
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Employee Master HR History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {hrHistoryLogs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <History className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No HR history events yet.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Change</th>
                      <th className="px-4 py-2.5 text-left font-medium">Field</th>
                      <th className="px-4 py-2.5 text-left font-medium">Reason</th>
                      <th className="px-4 py-2.5 text-left font-medium">By</th>
                      <th className="px-4 py-2.5 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hrHistoryLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{labelize(log.change_type)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{labelize(log.field_name)}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{log.reason ?? log.approval_reference ?? "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{log.actor?.full_name ?? "System"}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>

      {/* ── Probation confirmation dialog ──────────────────── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirmDialog(false)}>
          <div className="bg-background rounded-xl shadow-xl w-96 max-w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Confirm Probation</h3>
              <button type="button" onClick={() => setShowConfirmDialog(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirm that <strong>{profile?.full_name}</strong> has completed their probation period.
              </p>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Probation Status</span>
                  <span className="font-medium text-amber-600">Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End Date</span>
                  <span className="font-medium">{fmtDate(profileForm.probation_end_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New Status</span>
                  <span className="font-medium text-emerald-600">Completed</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This action will mark the employee as probation completed, record the confirmation date, and unlock their leave balance.
              </p>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={confirmProbation} disabled={confirming} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
