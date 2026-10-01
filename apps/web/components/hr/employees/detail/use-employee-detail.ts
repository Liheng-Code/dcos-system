"use client";

// State and actions for the Employee Master detail page. The page and its tab
// components render from the object this hook returns; all data access goes
// through lib/hr/employee-detail-service.ts.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  confirmEmployeeProbation,
  employeeApi,
  fetchEmployeeProfile,
  fetchRoles,
  fetchUserRoleCodes,
  loadEmployeeDetail,
  saveEmployeeRecord,
  syncUserRoles,
  updateEmployeeProfile,
} from "@/lib/hr/employee-detail-service";
import type {
  AssignmentRow,
  AuditLog,
  BankAccount,
  ChecklistStatusRow,
  EmployeeDocumentRow,
  HrHistoryLog,
  NSSFProfile,
  PayrollProfile,
  PayslipRow,
  Profile,
  Role,
  SalaryLine,
  TaxProfile,
} from "@/lib/hr/employee-detail-types";

export function useEmployeeDetail(id: string) {
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

    loadEmployeeDetail(id).then((detail) => {
      if (!detail) { router.push("/dashboard/hr/employees"); return; }

      const p = detail.profile;
      setProfile(p);
      setProfileForm({ ...p, current_address: p.current_address ?? p.address ?? null });
      setSysForm({ role: p.role ?? "viewer", status: p.status ?? "pending", suspended_reason: p.suspended_reason ?? "" });
      setAllProfiles(detail.allProfiles);

      if (detail.payrollProfile) {
        setPayrollProfile(detail.payrollProfile);
        setHasPayrollProfile(true);
      }
      if (detail.taxProfile) {
        setTaxProfile(detail.taxProfile);
        setHasTaxProfile(true);
      }
      if (detail.nssfProfile) {
        setNSSFProfile(detail.nssfProfile);
        setHasNSSFProfile(true);
      }
      if (detail.bankAccount) {
        setBankAccount(detail.bankAccount);
        setHasBankAccount(true);
      }

      setSalaryLines(detail.salaryLines);
      setPayslips(detail.payslips);
      setEmployeeDocuments(detail.employeeDocuments);
      setChecklistStatuses(detail.checklistStatuses);
      setProjectAssignments(detail.projectAssignments);

      setLoading(false);
    });
  }, [id, router]);

  // ── Save handlers ────────────────────────────────────────────────────────

  async function saveProfileSection(updates: Record<string, unknown>, successMessage: string, reason?: string) {
    setSaving(true);
    const res = await employeeApi(id, "PATCH", {
      updates,
      reason: reason ?? "Employee Master profile update",
      effective_date: new Date().toISOString().slice(0, 10),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to save employee profile");
      setSaving(false);
      return false;
    }
    toast.success(successMessage);
    const refreshed = await fetchEmployeeProfile(id);
    if (refreshed) {
      setProfile(refreshed);
      setProfileForm(refreshed);
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
    const newStatus = profileForm.status ?? profile.status;

    // When HR marks resigned or terminated, disable system access automatically
    const systemStatus = (newStatus === "resigned" || newStatus === "terminated") ? "disabled" : newStatus;

    const error = await updateEmployeeProfile(id, {
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
    });
    if (error) {
      toast.error(error);
    } else {
      if (systemStatus !== newStatus) {
        toast.success("Employment info saved — system account disabled");
        // Revoke sessions + write audit when auto-disabling
        await employeeApi(id, "POST", {
          action: "revoke_session",
          event_type: "account_disabled",
          old_value: { status: profile.status },
          new_value: { status: "disabled" },
          note: `Auto-disabled: employment status set to ${newStatus}`,
        });
        setRefreshAudit((n) => n + 1);
      } else {
        toast.success("Employment info saved");
      }
      const refreshed = await fetchEmployeeProfile(id);
      if (refreshed) {
        setProfile(refreshed);
        setProfileForm(refreshed);
      }
      setSysForm((f) => ({ ...f, status: systemStatus }));
    }
    setSaving(false);
  }

  async function saveCompliance() {
    if (!profile) return;
    setSaving(true);
    const error = await updateEmployeeProfile(id, {
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
    });
    if (error) toast.error(error);
    else toast.success("Compliance info saved");
    setSaving(false);
  }

  async function saveAttendanceAssets() {
    if (!profile) return;
    setSaving(true);
    const error = await updateEmployeeProfile(id, {
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
    });
    if (error) toast.error(error);
    else toast.success("Leave, attendance, asset, and access setup saved");
    setSaving(false);
  }

  async function runLifecycleAction(action: string, label: string) {
    if (!profile) return;
    const reason = window.prompt(`Reason for ${label.toLowerCase()}:`);
    if (reason === null) return;
    setSaving(true);
    const res = await employeeApi(id, "POST", {
      action,
      reason: reason.trim() || label,
      effective_date: new Date().toISOString().slice(0, 10),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || `Failed to ${label.toLowerCase()}`);
    } else {
      toast.success(label);
      const refreshed = await fetchEmployeeProfile(id);
      if (refreshed) {
        setProfile(refreshed);
        setProfileForm(refreshed);
        setSysForm((f) => ({ ...f, status: refreshed.status }));
      }
      setRefreshAudit((n) => n + 1);
    }
    setSaving(false);
  }

  async function confirmProbation() {
    setConfirming(true);
    const { error, confirmationDate } = await confirmEmployeeProbation(id);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Probation confirmed successfully");
      setProfileForm((p) => ({
        ...p,
        probation_status: "completed",
        confirmation_date: confirmationDate,
      }));
      setProfile((p) => p ? {
        ...p,
        probation_status: "completed",
        confirmation_date: confirmationDate,
      } : p);
      setShowConfirmDialog(false);
    }
    setConfirming(false);
  }

  async function savePayrollProfile() {
    setSaving(true);
    const payload = { employee_id: id, ...payrollProfile };
    const { error, insertedId } = await saveEmployeeRecord("employee_payroll_profiles", payrollProfile.id, payload);
    if (insertedId) { setPayrollProfile((p) => ({ ...p, id: insertedId })); setHasPayrollProfile(true); }
    if (error) { toast.error(error); } else { toast.success("Payroll profile saved"); }
    setSaving(false);
  }

  async function saveTaxProfile() {
    setSaving(true);
    const payload = { employee_id: id, ...taxProfile };
    const { error, insertedId } = await saveEmployeeRecord("employee_tax_profiles", taxProfile.id, payload);
    if (insertedId) { setTaxProfile((p) => ({ ...p, id: insertedId })); setHasTaxProfile(true); }
    if (error) { toast.error(error); } else { toast.success("Tax profile saved"); }
    setSaving(false);
  }

  async function saveNSSFProfile() {
    setSaving(true);
    const payload = { employee_id: id, ...nssfProfile };
    const { error, insertedId } = await saveEmployeeRecord("employee_nssf_profiles", nssfProfile.id, payload);
    if (insertedId) { setNSSFProfile((p) => ({ ...p, id: insertedId })); setHasNSSFProfile(true); }
    if (error) { toast.error(error); } else { toast.success("NSSF profile saved"); }
    setSaving(false);
  }

  async function saveBankAccount() {
    setSaving(true);
    const payload = { employee_id: id, bank_name: bankAccount.bank_name, account_name: bankAccount.account_name, account_number: bankAccount.account_number, branch: bankAccount.branch || null, is_primary: true };
    const { error, insertedId } = await saveEmployeeRecord("employee_bank_accounts", bankAccount.id, payload);
    if (insertedId) { setBankAccount((p) => ({ ...p, id: insertedId })); setHasBankAccount(true); }
    if (error) { toast.error(error); } else { toast.success("Bank account saved"); }
    setSaving(false);
  }

  // Fetch available RBAC roles + this employee's current assignments
  useEffect(() => {
    if (!id) return;
    fetchRoles().then((roles) => {
      if (roles) setSysRoles(roles);
    });
    fetchUserRoleCodes(id).then((codes) => {
      if (codes) setAssignedRoles(codes);
    });
  }, [id]);

  // Fetch audit logs
  useEffect(() => {
    if (!id) return;
    employeeApi(id)
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

    const oldRole = profile.role;
    const oldStatus = profile.status;
    const needsRevoke = ["disabled", "suspended", "archived"].includes(sysForm.status) && sysForm.status !== oldStatus;

    const error = await updateEmployeeProfile(id, {
      role: sysForm.role,
      status: sysForm.status,
      suspended_reason: sysForm.suspended_reason || null,
    });
    if (error) { toast.error(error); setSaving(false); return; }

    // Sync RBAC role assignments
    const { toAdd, toRemove } = await syncUserRoles(id, assignedRoles);

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
      await employeeApi(id, "POST", {
        ...(needsRevoke && ev === events[0] ? { action: "revoke_session" } : {}),
        ...ev,
      });
    }

    // If revoke needed but no events were logged, still revoke
    if (needsRevoke && events.length === 0) {
      await employeeApi(id, "POST", { action: "revoke_session", event_type: "session_revoked", old_value: { status: oldStatus }, new_value: { status: sysForm.status } });
    }

    toast.success("System access updated");
    setProfile((p) => p ? { ...p, role: sysForm.role, status: sysForm.status } : p);
    setRefreshAudit((n) => n + 1);
    setSaving(false);
  }

  return {
    id,
    loading,
    saving,
    profile,
    isArchived: profile?.status === "archived",
    allProfiles,
    profileForm, setProfileForm,
    payrollProfile, setPayrollProfile, hasPayrollProfile,
    taxProfile, setTaxProfile, hasTaxProfile,
    nssfProfile, setNSSFProfile, hasNSSFProfile,
    bankAccount, setBankAccount, hasBankAccount,
    salaryLines,
    payslips,
    showConfirmDialog, setShowConfirmDialog, confirming,
    sysRoles,
    assignedRoles, setAssignedRoles,
    sysForm, setSysForm,
    auditLogs,
    hrHistoryLogs,
    employeeDocuments,
    checklistStatuses,
    projectAssignments,
    savePersonal,
    saveEmployment,
    saveCompliance,
    saveAttendanceAssets,
    runLifecycleAction,
    confirmProbation,
    savePayrollProfile,
    saveTaxProfile,
    saveNSSFProfile,
    saveBankAccount,
    saveSystemAccess,
  };
}

export type EmployeeDetailController = ReturnType<typeof useEmployeeDetail>;
// The controller once the employee has loaded: `profile` is present.
export type LoadedEmployeeDetail = EmployeeDetailController & { profile: Profile };
