"use client";

// State and actions for the Leave Admin Setup page. The page and its section
// components render from the object this hook returns; all data access goes
// through lib/hr/leave-admin-service.ts.

import { useEffect, useMemo, useState } from "react";
import type { YearEndPreview } from "@/components/hr/leave/year-end-run-wizard";
import {
  deleteLeaveType,
  deletePublicHoliday,
  fetchLeaveTypes,
  fetchPublicHolidays,
  fetchTeamCapacity,
  fetchYearEndLogs,
  fetchYearEndPreview,
  loadLeaveAdminConfig,
  runCarryoverExpirySweep,
  runYearEnd,
  saveLeaveType,
  savePublicHoliday,
  upsertTeamCapacity,
} from "@/lib/hr/leave-admin-service";
import type {
  ActiveSection,
  HolidayForm,
  LeaveType,
  LeaveTypeForm,
  PublicHoliday,
  SeniorityRule,
  TeamCapacity,
  YearEndLog,
} from "@/lib/hr/leave-admin-types";
import { DEFAULT_FORM, DEFAULT_HOLIDAY_FORM } from "./constants";

export function useLeaveAdmin() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("leave_types");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [seniorityRules, setSeniorityRules] = useState<SeniorityRule[]>([]);
  const [teamCapacity, setTeamCapacity] = useState<TeamCapacity[]>([]);
  const [yearEndLogs, setYearEndLogs] = useState<YearEndLog[]>([]);
  const [departments, setDepartments] = useState<{ id: string; department_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Leave type form
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [typeForm, setTypeForm] = useState<LeaveTypeForm>(DEFAULT_FORM);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  // Delete confirmation (leave type)
  const [deletingType, setDeletingType] = useState<LeaveType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Public holidays
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [holidayForm, setHolidayForm] = useState<HolidayForm>(DEFAULT_HOLIDAY_FORM);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<PublicHoliday | null>(null);
  const [holidayDeleteError, setHolidayDeleteError] = useState<string | null>(null);
  const [holidayDeleteLoading, setHolidayDeleteLoading] = useState(false);

  // Year-end form
  const [yearEndWizardOpen, setYearEndWizardOpen] = useState(false);
  const [yearEndMsg, setYearEndMsg] = useState<string | null>(null);
  const [carryoverExpiryRunning, setCarryoverExpiryRunning] = useState(false);
  const [yearEndPreview, setYearEndPreview] = useState<YearEndPreview | null>(null);
  const [yearEndPreviewLoading, setYearEndPreviewLoading] = useState(false);
  const [yearEndPreviewSearch, setYearEndPreviewSearch] = useState("");
  const [yearEndPreviewDepartment, setYearEndPreviewDepartment] = useState("");
  const [yearEndPreviewLeaveType, setYearEndPreviewLeaveType] = useState("");
  const [yearEndPreviewStatus, setYearEndPreviewStatus] = useState("");

  // Capacity form
  const [newCapacityDeptId, setNewCapacityDeptId] = useState("");
  const [newCapacityPct, setNewCapacityPct] = useState(50);

  useEffect(() => {
    loadLeaveAdminConfig().then((config) => {
      setLeaveTypes(config.leaveTypes);
      setSeniorityRules(config.seniorityRules);
      setTeamCapacity(config.teamCapacity);
      setYearEndLogs(config.yearEndLogs);
      setDepartments(config.departments);
      setLoading(false);
    });
  }, []);

  // Load public holidays when the tab is active or the selected year changes
  useEffect(() => {
    if (activeSection !== "public_holidays") return;
    const timer = window.setTimeout(() => {
      setHolidayLoading(true);
      fetchPublicHolidays(selectedYear).then((data) => {
        setHolidays(data);
        setHolidayLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSection, selectedYear]);

  const refreshLeaveTypes = async () => {
    setLeaveTypes(await fetchLeaveTypes());
  };

  const openCreateType = () => {
    setEditingType(null);
    setTypeForm(DEFAULT_FORM);
    setTypeError(null);
    setShowTypeForm(true);
  };

  const openEditType = (lt: LeaveType) => {
    setEditingType(lt);
    setTypeForm({
      leave_code: lt.leave_code,
      leave_name: lt.leave_name,
      color: lt.color || "blue",
      max_days_per_year: lt.max_days_per_year ?? 0,
      is_paid: lt.is_paid ?? true,
      carryover_allowed: lt.carryover_allowed ?? false,
      max_carryover: lt.max_carryover ?? 0,
      half_day_allowed: lt.half_day_allowed ?? true,
      probation_required: lt.probation_required ?? false,
      requires_document: lt.requires_document ?? false,
      skip_team_capacity: lt.skip_team_capacity ?? false,
      advance_notice_days: lt.advance_notice_days ?? 0,
      max_days_per_request: lt.max_days_per_request ?? 0,
      gender_restriction: lt.gender_restriction || "all",
      is_replacement_leave: lt.is_replacement_leave ?? false,
      seniority_based: lt.seniority_based ?? false,
      monthly_accrual: lt.monthly_accrual ?? false,
      cancel_window_days: lt.cancel_window_days ?? 0,
      deduct_from_type_id: lt.deduct_from_type_id ?? null,
      is_active: lt.is_active ?? true,
      rounding_rule: lt.rounding_rule || "none",
      carryover_expiry_month: lt.carryover_expiry_month ?? null,
      carryover_expiry_day: lt.carryover_expiry_day ?? null,
    });
    setTypeError(null);
    setShowTypeForm(true);
  };

  const saveType = async () => {
    if (!typeForm.leave_name.trim()) { setTypeError("Name is required."); return; }
    if (!typeForm.leave_code.trim()) { setTypeError("Code is required."); return; }
    setTypeSaving(true);
    setTypeError(null);
    const error = await saveLeaveType(editingType ? editingType.id : null, typeForm);
    if (error) {
      setTypeError(error);
    } else {
      await refreshLeaveTypes();
      setShowTypeForm(false);
    }
    setTypeSaving(false);
  };

  const set = <K extends keyof LeaveTypeForm>(key: K, val: LeaveTypeForm[K]) =>
    setTypeForm((f) => ({ ...f, [key]: val }));

  const confirmDelete = (lt: LeaveType) => {
    setDeletingType(lt);
    setDeleteError(null);
  };

  const deleteType = async () => {
    if (!deletingType) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const error = await deleteLeaveType(deletingType.id);
    if (error) {
      setDeleteError(error);
    } else {
      setLeaveTypes((prev) => prev.filter((lt) => lt.id !== deletingType.id));
      setDeletingType(null);
    }
    setDeleteLoading(false);
  };

  // ── Holiday handlers ──────────────────────────────────────────────────────
  const openCreateHoliday = () => {
    setEditingHoliday(null);
    setHolidayForm({ ...DEFAULT_HOLIDAY_FORM, year: selectedYear });
    setHolidayError(null);
    setShowHolidayForm(true);
  };

  const openEditHoliday = (h: PublicHoliday) => {
    setEditingHoliday(h);
    setHolidayForm({
      holiday_date: h.holiday_date,
      holiday_name: h.holiday_name,
      year: h.year,
      is_active: h.is_active,
      note: h.note ?? "",
    });
    setHolidayError(null);
    setShowHolidayForm(true);
  };

  const saveHoliday = async () => {
    if (!holidayForm.holiday_date) { setHolidayError("Date is required."); return; }
    if (!holidayForm.holiday_name.trim()) { setHolidayError("Name is required."); return; }
    setHolidaySaving(true);
    setHolidayError(null);
    const error = await savePublicHoliday(editingHoliday ? editingHoliday.id : null, holidayForm);
    if (error) {
      setHolidayError(error);
    } else {
      setHolidays(await fetchPublicHolidays(selectedYear));
      setShowHolidayForm(false);
    }
    setHolidaySaving(false);
  };

  const deleteHoliday = async () => {
    if (!deletingHoliday) return;
    setHolidayDeleteLoading(true);
    setHolidayDeleteError(null);
    const error = await deletePublicHoliday(deletingHoliday.id);
    if (error) {
      setHolidayDeleteError(error);
    } else {
      setHolidays((prev) => prev.filter((h) => h.id !== deletingHoliday.id));
      setDeletingHoliday(null);
    }
    setHolidayDeleteLoading(false);
  };

  const saveCapacity = async () => {
    if (!newCapacityDeptId) return;
    const error = await upsertTeamCapacity(newCapacityDeptId, newCapacityPct);
    if (!error) {
      setTeamCapacity(await fetchTeamCapacity());
      setNewCapacityDeptId("");
      setNewCapacityPct(50);
    }
  };

  const loadYearEndPreview = async () => {
    setYearEndPreviewLoading(true);
    setYearEndMsg(null);
    const res = await fetchYearEndPreview();
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unable to load year-end preview." })) as { error?: string };
      setYearEndMsg(`Error: ${body.error || "Unable to load year-end preview."}`);
      setYearEndPreview(null);
    } else {
      setYearEndPreview(await res.json() as YearEndPreview);
    }
    setYearEndPreviewLoading(false);
  };

  useEffect(() => {
    if (activeSection !== "year_end") return;
    const timer = window.setTimeout(() => {
      void loadYearEndPreview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSection]);

  const refreshYearEndLogs = async () => {
    setYearEndLogs(await fetchYearEndLogs());
  };

  const confirmYearEnd = async (): Promise<{ success: boolean; message: string }> => {
    const res = await runYearEnd(new Date().getFullYear());
    const body = await res.json().catch(() => ({ error: "Year-end processing failed." })) as { error?: string; message?: string };
    if (!res.ok) {
      return { success: false, message: body.error || "Year-end processing failed." };
    }
    await Promise.all([loadYearEndPreview(), refreshYearEndLogs()]);
    return { success: true, message: body.message || "Year-end processing complete." };
  };

  const runCarryoverExpiry = async () => {
    setCarryoverExpiryRunning(true);
    setYearEndMsg(null);
    const res = await runCarryoverExpirySweep();
    const body = await res.json().catch(() => ({ error: "Carryover expiry sweep failed." })) as { error?: string; message?: string };
    if (!res.ok) {
      setYearEndMsg(`Error: ${body.error || "Carryover expiry sweep failed."}`);
    } else {
      setYearEndMsg(body.message || "Carryover expiry sweep complete.");
      await Promise.all([loadYearEndPreview(), refreshYearEndLogs()]);
    }
    setCarryoverExpiryRunning(false);
  };

  const yearEndPreviewDepartments = useMemo(() => {
    return Array.from(new Set((yearEndPreview?.rows ?? []).map((row) => row.department).filter(Boolean))).sort();
  }, [yearEndPreview]);

  const yearEndPreviewLeaveTypes = useMemo(() => {
    return Array.from(new Set((yearEndPreview?.rows ?? []).map((row) => row.leave_type_name).filter(Boolean))).sort();
  }, [yearEndPreview]);

  const filteredYearEndPreviewRows = useMemo(() => {
    const search = yearEndPreviewSearch.trim().toLowerCase();
    return (yearEndPreview?.rows ?? []).filter((row) => {
      const status = row.blocking_reason ? "blocked" : row.existing_next_year_balance ? "skipped" : row.warning_reason ? "warning" : "ready";
      return (
        (!search || row.employee_name.toLowerCase().includes(search) || row.leave_type_name.toLowerCase().includes(search)) &&
        (!yearEndPreviewDepartment || row.department === yearEndPreviewDepartment) &&
        (!yearEndPreviewLeaveType || row.leave_type_name === yearEndPreviewLeaveType) &&
        (!yearEndPreviewStatus || status === yearEndPreviewStatus)
      );
    });
  }, [yearEndPreview, yearEndPreviewDepartment, yearEndPreviewLeaveType, yearEndPreviewSearch, yearEndPreviewStatus]);

  return {
    activeSection, setActiveSection,
    loading,
    leaveTypes,
    seniorityRules,
    teamCapacity,
    yearEndLogs,
    departments,
    showTypeForm, setShowTypeForm,
    editingType,
    typeForm, setTypeForm,
    typeSaving,
    typeError,
    deletingType, setDeletingType,
    deleteError,
    deleteLoading,
    holidays,
    selectedYear, setSelectedYear,
    holidayLoading,
    showHolidayForm, setShowHolidayForm,
    editingHoliday,
    holidayForm, setHolidayForm,
    holidaySaving,
    holidayError,
    deletingHoliday, setDeletingHoliday,
    holidayDeleteError, setHolidayDeleteError,
    holidayDeleteLoading,
    yearEndWizardOpen, setYearEndWizardOpen,
    yearEndMsg,
    carryoverExpiryRunning,
    yearEndPreview,
    yearEndPreviewLoading,
    yearEndPreviewSearch, setYearEndPreviewSearch,
    yearEndPreviewDepartment, setYearEndPreviewDepartment,
    yearEndPreviewLeaveType, setYearEndPreviewLeaveType,
    yearEndPreviewStatus, setYearEndPreviewStatus,
    yearEndPreviewDepartments,
    yearEndPreviewLeaveTypes,
    filteredYearEndPreviewRows,
    newCapacityDeptId, setNewCapacityDeptId,
    newCapacityPct, setNewCapacityPct,
    openCreateType,
    openEditType,
    saveType,
    set,
    confirmDelete,
    deleteType,
    openCreateHoliday,
    openEditHoliday,
    saveHoliday,
    deleteHoliday,
    saveCapacity,
    loadYearEndPreview,
    confirmYearEnd,
    runCarryoverExpiry,
  };
}

export type LeaveAdminController = ReturnType<typeof useLeaveAdmin>;
