"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Settings, Users, TrendingUp, Calendar, Plus, Pencil, Trash2, X, AlertTriangle, Globe, Clock } from "lucide-react";
import { YearEndRunWizard, type YearEndPreview } from "@/components/hr/leave/year-end-run-wizard";

// ── Color helpers ─────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  { value: "blue",    label: "blue" },
  { value: "red",     label: "red" },
  { value: "green",   label: "green" },
  { value: "purple",  label: "purple" },
  { value: "amber",   label: "amber" },
  { value: "cyan",    label: "cyan" },
  { value: "pink",    label: "pink" },
  { value: "indigo",  label: "indigo" },
  { value: "emerald", label: "emerald" },
  { value: "teal",    label: "teal" },
  { value: "orange",  label: "orange" },
  { value: "gray",    label: "gray" },
];
const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

// ── Inline toggle switch ──────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeaveType {
  id: string;
  leave_code: string;
  leave_name: string;
  color: string;
  max_days_per_year: number;
  is_paid: boolean;
  carryover_allowed: boolean;
  max_carryover: number;
  half_day_allowed: boolean;
  probation_required: boolean;
  requires_document: boolean;
  skip_team_capacity: boolean;
  advance_notice_days: number;
  max_days_per_request: number;
  gender_restriction: string;
  is_replacement_leave: boolean;
  seniority_based: boolean;
  monthly_accrual: boolean;
  cancel_window_days: number;
  deduct_from_type_id: string | null;
  is_active: boolean;
  rounding_rule: string;
  carryover_expiry_month: number | null;
  carryover_expiry_day: number | null;
}

interface LeaveTypeForm {
  leave_code: string;
  leave_name: string;
  color: string;
  max_days_per_year: number;
  is_paid: boolean;
  carryover_allowed: boolean;
  max_carryover: number;
  half_day_allowed: boolean;
  probation_required: boolean;
  requires_document: boolean;
  skip_team_capacity: boolean;
  advance_notice_days: number;
  max_days_per_request: number;
  gender_restriction: string;
  is_replacement_leave: boolean;
  seniority_based: boolean;
  monthly_accrual: boolean;
  cancel_window_days: number;
  deduct_from_type_id: string | null;
  is_active: boolean;
  rounding_rule: string;
  carryover_expiry_month: number | null;
  carryover_expiry_day: number | null;
}

const DEFAULT_FORM: LeaveTypeForm = {
  leave_code: "", leave_name: "", color: "blue",
  max_days_per_year: 0, is_paid: true,
  carryover_allowed: false, max_carryover: 0,
  half_day_allowed: true, probation_required: false,
  requires_document: false, skip_team_capacity: false,
  advance_notice_days: 0, max_days_per_request: 0,
  gender_restriction: "all", is_replacement_leave: false,
  seniority_based: false, monthly_accrual: false,
  cancel_window_days: 0, deduct_from_type_id: null, is_active: true,
  rounding_rule: "none", carryover_expiry_month: null, carryover_expiry_day: null,
};

const ROUNDING_RULE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "nearest_half", label: "Nearest 0.5 day" },
  { value: "nearest_whole", label: "Nearest whole day" },
  { value: "round_up", label: "Round up" },
  { value: "round_down", label: "Round down" },
];

interface SeniorityRule {
  id: string;
  leave_type_id: string;
  min_years: number;
  max_years: number | null;
  days_per_year: number;
}

interface TeamCapacity {
  id: string;
  department_id: string;
  max_percent: number;
  departments: { department_name: string };
}

interface YearEndLog {
  id: string;
  run_date: string;
  from_year: number;
  to_year: number;
  days_carried: number;
  days_expired: number;
  profiles: { full_name: string };
}

type ActiveSection = "leave_types" | "capacity" | "seniority" | "year_end" | "public_holidays";

interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string | null;
}

interface HolidayForm {
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string;
}

const HOLIDAY_YEARS = [2026, 2027, 2028, 2029, 2030];
const DAYS_OF_WEEK  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const DEFAULT_HOLIDAY_FORM: HolidayForm = {
  holiday_date: "",
  holiday_name: "",
  year: new Date().getFullYear(),
  is_active: true,
  note: "",
};

// ── Field helpers ─────────────────────────────────────────────────────────────
const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";
const labelCls = "block text-sm font-medium text-foreground mb-1";

export default function LeaveAdminPage() {
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
    const supabase = createClient();
    Promise.all([
      supabase.from("leave_types").select("*").order("leave_name"),
      supabase.from("leave_seniority_rules").select("*").order("min_years"),
      supabase.from("leave_team_capacity").select("*, departments(department_name)").order("max_percent"),
      supabase.from("leave_year_end_logs").select("*, profiles(full_name)").order("run_date", { ascending: false }).limit(20),
      supabase.from("departments").select("id, department_name").order("department_name"),
    ]).then(([typesRes, senRes, capRes, logsRes, deptRes]) => {
      setLeaveTypes(typesRes.data || []);
      setSeniorityRules(senRes.data || []);
      setTeamCapacity(capRes.data || []);
      setYearEndLogs(logsRes.data || []);
      setDepartments(deptRes.data || []);
      setLoading(false);
    });
  }, []);

  // Load public holidays when the tab is active or the selected year changes
  useEffect(() => {
    if (activeSection !== "public_holidays") return;
    const timer = window.setTimeout(() => {
      const supabase = createClient();
      setHolidayLoading(true);
      supabase
        .from("leave_public_holidays")
        .select("id, holiday_date, holiday_name, year, is_active, note")
        .eq("year", selectedYear)
        .order("holiday_date")
        .then(({ data }) => {
          setHolidays(data || []);
          setHolidayLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSection, selectedYear]);

  const refreshLeaveTypes = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("leave_types").select("*").order("leave_name");
    setLeaveTypes(data || []);
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
    const supabase = createClient();
    const payload = { ...typeForm, deduct_from_type_id: typeForm.deduct_from_type_id || null };
    const { error } = editingType
      ? await supabase.from("leave_types").update(payload).eq("id", editingType.id)
      : await supabase.from("leave_types").insert(payload);
    if (error) {
      setTypeError(error.message);
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
    const supabase = createClient();
    const { error } = await supabase.from("leave_types").delete().eq("id", deletingType.id);
    if (error) {
      setDeleteError(error.message);
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
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const payload = { ...holidayForm, note: holidayForm.note.trim() || null, created_by: userData.user?.id };
    const { error } = editingHoliday
      ? await supabase.from("leave_public_holidays").update(payload).eq("id", editingHoliday.id)
      : await supabase.from("leave_public_holidays").insert(payload);
    if (error) {
      setHolidayError(error.message);
    } else {
      const { data } = await supabase
        .from("leave_public_holidays")
        .select("id, holiday_date, holiday_name, year, is_active, note")
        .eq("year", selectedYear)
        .order("holiday_date");
      setHolidays(data || []);
      setShowHolidayForm(false);
    }
    setHolidaySaving(false);
  };

  const deleteHoliday = async () => {
    if (!deletingHoliday) return;
    setHolidayDeleteLoading(true);
    setHolidayDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("leave_public_holidays")
      .delete()
      .eq("id", deletingHoliday.id);
    if (error) {
      setHolidayDeleteError(error.message);
    } else {
      setHolidays((prev) => prev.filter((h) => h.id !== deletingHoliday.id));
      setDeletingHoliday(null);
    }
    setHolidayDeleteLoading(false);
  };

  const saveCapacity = async () => {
    if (!newCapacityDeptId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("leave_team_capacity")
      .upsert({ department_id: newCapacityDeptId, max_percent: newCapacityPct }, { onConflict: "department_id" });
    if (!error) {
      const { data } = await supabase
        .from("leave_team_capacity")
        .select("*, departments(department_name)")
        .order("max_percent");
      setTeamCapacity(data || []);
      setNewCapacityDeptId("");
      setNewCapacityPct(50);
    }
  };

  const loadYearEndPreview = async () => {
    setYearEndPreviewLoading(true);
    setYearEndMsg(null);
    const res = await fetch("/api/hr/leave/year-end");
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
    const { data } = await createClient()
      .from("leave_year_end_logs")
      .select("*, profiles(full_name)")
      .order("run_date", { ascending: false })
      .limit(20);
    setYearEndLogs(data || []);
  };

  const confirmYearEnd = async (): Promise<{ success: boolean; message: string }> => {
    const res = await fetch("/api/hr/leave/year-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: new Date().getFullYear() }),
    });
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
    const res = await fetch("/api/hr/leave/carryover-expiry", { method: "POST" });
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

  const SECTIONS = [
    { key: "leave_types"     as ActiveSection, label: "Leave Types",     icon: Settings   },
    { key: "capacity"        as ActiveSection, label: "Team Capacity",   icon: Users      },
    { key: "seniority"       as ActiveSection, label: "Seniority Rules", icon: TrendingUp },
    { key: "year_end"        as ActiveSection, label: "Year-End",        icon: Calendar   },
    { key: "public_holidays" as ActiveSection, label: "Public Holidays", icon: Globe      },
  ];

  return (
    <div className="space-y-6">
      <div className="leave-page-header">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Leave Admin Setup</h2>
          <p className="text-muted-foreground">Configure leave types, approver chains, capacity limits, and year-end processing</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-border px-4 pt-3">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
        {loading ? (
          <p className="text-muted-foreground">Loading configuration...</p>
        ) : (
          <>
          {/* ── Leave Types ──────────────────────────────────────────────── */}
          {activeSection === "leave_types" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{leaveTypes.length} leave type{leaveTypes.length !== 1 ? "s" : ""} configured</p>
                <Button onClick={openCreateType} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Leave Type
                </Button>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left font-medium py-3 px-4">Leave Type</th>
                      <th className="text-center font-medium py-3 px-4">Days/Year</th>
                      <th className="text-center font-medium py-3 px-4">Paid</th>
                      <th className="text-center font-medium py-3 px-4">Half-day</th>
                      <th className="text-center font-medium py-3 px-4">Carryover</th>
                      <th className="text-center font-medium py-3 px-4">Notice (d)</th>
                      <th className="text-center font-medium py-3 px-4">Gender</th>
                      <th className="text-center font-medium py-3 px-4">Status</th>
                      <th className="text-center font-medium py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveTypes.map((lt) => (
                      <tr key={lt.id} className="border-b border-border hover:bg-muted/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLOR_HEX[lt.color] ?? COLOR_HEX.blue }}
                            />
                            <div>
                              <p className="font-medium">{lt.leave_name}</p>
                              <p className="text-xs text-muted-foreground">{lt.leave_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">{lt.max_days_per_year || "—"}</td>
                        <td className="py-3 px-4 text-center">{lt.is_paid ? "✓" : "—"}</td>
                        <td className="py-3 px-4 text-center">{lt.half_day_allowed ? "✓" : "—"}</td>
                        <td className="py-3 px-4 text-center">
                          {lt.carryover_allowed
                            ? `✓ (max ${lt.max_carryover})${
                                lt.carryover_expiry_month && lt.carryover_expiry_day
                                  ? ` · expires ${String(lt.carryover_expiry_month).padStart(2, "0")}/${String(lt.carryover_expiry_day).padStart(2, "0")}`
                                  : ""
                              }`
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-center">{lt.advance_notice_days || "—"}</td>
                        <td className="py-3 px-4 text-center capitalize">{lt.gender_restriction === "all" ? "any" : lt.gender_restriction}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={`text-xs ${lt.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {lt.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEditType(lt)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => confirmDelete(lt)}
                              className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Team Capacity ─────────────────────────────────────────────── */}
          {activeSection === "capacity" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Set Capacity Limit</CardTitle>
                  <CardDescription>Maximum % of department that can be on leave simultaneously</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    <select
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newCapacityDeptId}
                      onChange={(e) => setNewCapacityDeptId(e.target.value)}
                    >
                      <option value="">Select department...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.department_name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={100}
                        className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newCapacityPct}
                        onChange={(e) => setNewCapacityPct(Number(e.target.value))}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <Button onClick={saveCapacity} disabled={!newCapacityDeptId}>Save</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Capacity indicator: <span className="text-green-600 font-medium">Green</span> = 0–29%, <span className="text-amber-600 font-medium">Yellow</span> = 30–49%, <span className="text-red-600 font-medium">Red</span> = 50%+
                  </p>
                </CardContent>
              </Card>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left font-medium py-3 px-4">Department</th>
                      <th className="text-center font-medium py-3 px-4">Max % on Leave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamCapacity.length === 0 ? (
                      <tr><td colSpan={2} className="text-center py-6 text-muted-foreground">No capacity limits configured</td></tr>
                    ) : teamCapacity.map((cap) => (
                      <tr key={cap.id} className="border-b border-border">
                        <td className="py-3 px-4 font-medium">{cap.departments?.department_name || "Unknown"}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-bold ${cap.max_percent >= 50 ? "text-red-600" : cap.max_percent >= 30 ? "text-amber-600" : "text-green-600"}`}>
                            {cap.max_percent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Seniority Rules ───────────────────────────────────────────── */}
          {activeSection === "seniority" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  These rules define how many leave days employees are entitled to based on years of service.
                  Only applies to leave types with <em>seniority_based = true</em>.
                </p>
                <Link href="/dashboard/hr/leave/seniority-rules">
                  <Button size="sm" className="gap-1.5 flex-shrink-0">
                    <Pencil className="h-4 w-4" /> Manage Seniority Rules
                  </Button>
                </Link>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left font-medium py-3 px-4">Leave Type</th>
                      <th className="text-center font-medium py-3 px-4">Min Years</th>
                      <th className="text-center font-medium py-3 px-4">Max Years</th>
                      <th className="text-center font-medium py-3 px-4">Days / Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seniorityRules.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No seniority rules configured</td></tr>
                    ) : seniorityRules.map((rule) => {
                      const lt = leaveTypes.find((t) => t.id === rule.leave_type_id);
                      return (
                        <tr key={rule.id} className="border-b border-border">
                          <td className="py-3 px-4">{lt?.leave_name || "Unknown"}</td>
                          <td className="py-3 px-4 text-center">{rule.min_years}</td>
                          <td className="py-3 px-4 text-center">{rule.max_years ?? "No limit"}</td>
                          <td className="py-3 px-4 text-center font-bold">{rule.days_per_year}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Public Holidays ──────────────────────────────────────────── */}
          {activeSection === "public_holidays" && (
            <div className="space-y-4">
              {/* Toolbar: year selector + add button */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {HOLIDAY_YEARS.map((yr) => (
                    <button
                      key={yr}
                      onClick={() => setSelectedYear(yr)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        selectedYear === yr
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
                <Button onClick={openCreateHoliday} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Holiday
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left font-medium py-3 px-4">Date</th>
                      <th className="text-left font-medium py-3 px-4">Day</th>
                      <th className="text-left font-medium py-3 px-4">Holiday Name</th>
                      <th className="text-center font-medium py-3 px-4">Status</th>
                      <th className="text-center font-medium py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidayLoading ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                    ) : holidays.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No public holidays configured for {selectedYear}.</td></tr>
                    ) : holidays.map((h) => {
                      const d = new Date(h.holiday_date);
                      return (
                        <tr key={h.id} className="border-b border-border hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">
                            {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{DAYS_OF_WEEK[d.getDay()]}</td>
                          <td className="py-3 px-4">{h.holiday_name}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge className={`text-xs ${h.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {h.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openEditHoliday(h)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => { setDeletingHoliday(h); setHolidayDeleteError(null); }}
                                className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {holidays.filter(h => h.is_active).length} active public holiday{holidays.filter(h => h.is_active).length !== 1 ? "s" : ""} in {selectedYear}.
                Lunar-based holidays (Pchum Ben, Water Festival) may shift by ±1 day pending official announcement.
              </p>
            </div>
          )}

          {/* ── Year-End Processing ───────────────────────────────────────── */}
          {activeSection === "year_end" && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-4">
                  <CardTitle className="text-base">Year-End Run</CardTitle>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button onClick={loadYearEndPreview} disabled={yearEndPreviewLoading} variant="outline" size="sm">
                      {yearEndPreviewLoading ? "Loading Preview..." : "Refresh Preview"}
                    </Button>
                    <Button onClick={() => setYearEndWizardOpen(true)} disabled={yearEndPreviewLoading || !yearEndPreview || yearEndPreview.rows.length === 0} className="gap-2" size="sm">
                      <Calendar className="h-4 w-4" />
                      {`Confirm Year-End for ${new Date().getFullYear()} -> ${new Date().getFullYear() + 1}`}
                    </Button>
                    <Button onClick={runCarryoverExpiry} disabled={carryoverExpiryRunning} variant="outline" className="gap-2" size="sm">
                      <Clock className="h-4 w-4" />
                      {carryoverExpiryRunning ? "Sweeping..." : "Apply Carryover Expiry"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {yearEndMsg && (
                    <div className={`rounded-md px-4 py-3 text-sm ${yearEndMsg.startsWith("Error") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                      {yearEndMsg}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Employees</p>
                      <p className="text-lg font-semibold">{yearEndPreview?.totals.employees ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Entitlement</p>
                      <p className="text-lg font-semibold">{yearEndPreview?.totals.entitlementDays ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Carryover</p>
                      <p className="text-lg font-semibold">{yearEndPreview?.totals.carryForward ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Expired</p>
                      <p className="text-lg font-semibold">{yearEndPreview?.totals.expiredDays ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Bring Forward</p>
                      <p className="text-lg font-semibold">{yearEndPreview?.totals.openingBalance ?? 0}</p>
                    </div>
                  </div>
                  {yearEndPreview && !yearEndPreview.canRun && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {yearEndPreview.rows.length === 0
                        ? "No eligible employees or leave types were found for the year-end preview."
                        : yearEndPreview.runnableRows === 0
                        ? "All next-year balances already exist for the selected staff."
                        : "Resolve the blocked preview rows before running year-end."}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <h3 className="text-base font-semibold">Preview</h3>
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      value={yearEndPreviewSearch}
                      onChange={(e) => setYearEndPreviewSearch(e.target.value)}
                      placeholder="Search employee or leave type"
                      className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <select
                      value={yearEndPreviewDepartment}
                      onChange={(e) => setYearEndPreviewDepartment(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All Departments</option>
                      {yearEndPreviewDepartments.map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                    <select
                      value={yearEndPreviewLeaveType}
                      onChange={(e) => setYearEndPreviewLeaveType(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All Leave Types</option>
                      {yearEndPreviewLeaveTypes.map((leaveType) => (
                        <option key={leaveType} value={leaveType}>{leaveType}</option>
                      ))}
                    </select>
                    <select
                      value={yearEndPreviewStatus}
                      onChange={(e) => setYearEndPreviewStatus(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All Status</option>
                      <option value="ready">Ready</option>
                      <option value="warning">Warning</option>
                      <option value="skipped">Skipped</option>
                      <option value="blocked">Blocked</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setYearEndPreviewSearch("");
                        setYearEndPreviewDepartment("");
                        setYearEndPreviewLeaveType("");
                        setYearEndPreviewStatus("");
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left font-medium py-3 px-4">Employee</th>
                        <th className="text-left font-medium py-3 px-4">Department</th>
                        <th className="text-left font-medium py-3 px-4">Leave Type</th>
                        <th className="text-center font-medium py-3 px-4">Service</th>
                        <th className="text-center font-medium py-3 px-4">Entitlement</th>
                        <th className="text-center font-medium py-3 px-4">Remaining</th>
                        <th className="text-center font-medium py-3 px-4">Carryover</th>
                        <th className="text-center font-medium py-3 px-4">Expired</th>
                        <th className="text-center font-medium py-3 px-4">Bring Forward</th>
                        <th className="text-left font-medium py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearEndPreviewLoading ? (
                        <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Loading preview...</td></tr>
                      ) : !yearEndPreview || yearEndPreview.rows.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No current-year balances found</td></tr>
                      ) : filteredYearEndPreviewRows.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No preview rows match the selected filters</td></tr>
                      ) : filteredYearEndPreviewRows.map((row) => (
                        <tr key={`${row.employee_id}-${row.leave_type_name}`} className="border-b border-border">
                          <td className="py-3 px-4">{row.employee_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{row.department}</td>
                          <td className="py-3 px-4">{row.leave_type_name}</td>
                          <td className="py-3 px-4 text-center">{row.service_years ?? "-"}</td>
                          <td className="py-3 px-4 text-center font-medium">{row.entitlement_days}</td>
                          <td className="py-3 px-4 text-center">{row.current_remaining}</td>
                          <td className="py-3 px-4 text-center text-green-700 font-medium">{row.carry_forward}</td>
                          <td className="py-3 px-4 text-center text-red-600 font-medium">{row.expired_days}</td>
                          <td className="py-3 px-4 text-center font-semibold">{row.opening_balance}</td>
                          <td className="py-3 px-4 text-sm">
                            {row.blocking_reason ? (
                              <span className="text-red-600">{row.blocking_reason}</span>
                            ) : row.existing_next_year_balance ? (
                              <span className="text-amber-700">Skipped; next-year balance already exists</span>
                            ) : row.warning_reason ? (
                              <span className="text-amber-700">{row.warning_reason}; fixed entitlement used</span>
                            ) : (
                              <span className="text-green-700">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold mb-3">Processing History</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left font-medium py-3 px-4">Date Run</th>
                        <th className="text-left font-medium py-3 px-4">Period</th>
                        <th className="text-left font-medium py-3 px-4">Employee</th>
                        <th className="text-center font-medium py-3 px-4">Carried</th>
                        <th className="text-center font-medium py-3 px-4">Expired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearEndLogs.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No year-end runs recorded</td></tr>
                      ) : yearEndLogs.map((log) => (
                        <tr key={log.id} className="border-b border-border">
                          <td className="py-3 px-4 text-muted-foreground">{new Date(log.run_date).toLocaleDateString()}</td>
                          <td className="py-3 px-4">{log.from_year} → {log.to_year}</td>
                          <td className="py-3 px-4">{log.profiles?.full_name || "—"}</td>
                          <td className="py-3 px-4 text-center text-green-700 font-medium">{log.days_carried}</td>
                          <td className="py-3 px-4 text-center text-red-600 font-medium">{log.days_expired}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>
          )}
          </>
        )}
        </div>
      </div>

      {/* ── Delete Confirmation Modal ────────────────────────────────────────── */}
      {deletingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Delete leave type</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Are you sure you want to delete{" "}
                    <span className="font-medium text-foreground">{deletingType.leave_name}</span>?
                    This will fail if any leave requests or balances reference this type.
                  </p>
                </div>
              </div>

              {deleteError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingType(null)} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button
                onClick={deleteType}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Delete Confirmation ──────────────────────────────────────── */}
      {deletingHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete public holiday</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete <span className="font-medium text-foreground">{deletingHoliday.holiday_name}</span> (
                    {new Date(deletingHoliday.holiday_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})?
                    This cannot be undone.
                  </p>
                </div>
              </div>
              {holidayDeleteError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{holidayDeleteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingHoliday(null)} disabled={holidayDeleteLoading}>Cancel</Button>
              <Button onClick={deleteHoliday} disabled={holidayDeleteLoading} className="bg-red-600 hover:bg-red-700 text-white">
                {holidayDeleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Form Modal ───────────────────────────────────────────────── */}
      {showHolidayForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">
                {editingHoliday ? "Edit public holiday" : "Add public holiday"}
              </h3>
              <button onClick={() => setShowHolidayForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Date | Year */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={holidayForm.holiday_date}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, holiday_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Year</label>
                  <select
                    className={inputCls}
                    value={holidayForm.year}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  >
                    {HOLIDAY_YEARS.map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className={labelCls}>Holiday Name</label>
                <input
                  className={inputCls}
                  value={holidayForm.holiday_name}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, holiday_name: e.target.value }))}
                  placeholder="e.g. National Independence Day"
                />
              </div>

              {/* Note (optional) */}
              <div>
                <label className={labelCls}>Note <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={holidayForm.note}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Subject to official government announcement"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-medium text-foreground">Active</span>
                <Toggle
                  checked={holidayForm.is_active}
                  onChange={(v) => setHolidayForm((f) => ({ ...f, is_active: v }))}
                />
              </div>

              {holidayError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{holidayError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowHolidayForm(false)}>Cancel</Button>
              <Button onClick={saveHoliday} disabled={holidaySaving}>
                {holidaySaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Type Form Modal ─────────────────────────────────────────── */}
      {showTypeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative bg-background rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background rounded-t-xl z-10">
              <h3 className="text-base font-semibold">
                {editingType ? "Edit leave type" : "Add leave type"}
              </h3>
              <button
                onClick={() => setShowTypeForm(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* Row: Name | Color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    className={inputCls}
                    value={typeForm.leave_name}
                    onChange={(e) => set("leave_name", e.target.value)}
                    placeholder="e.g. Annual Leave"
                  />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full flex-shrink-0 border border-border"
                      style={{ backgroundColor: COLOR_HEX[typeForm.color] ?? COLOR_HEX.blue }}
                    />
                    <select
                      className={cn(inputCls, "flex-1")}
                      value={typeForm.color}
                      onChange={(e) => set("color", e.target.value)}
                    >
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Row: Code (left only, readonly when editing) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Code</label>
                  <input
                    className={inputCls}
                    value={typeForm.leave_code}
                    onChange={(e) => set("leave_code", e.target.value.toUpperCase())}
                    placeholder="e.g. ANNUAL"
                    disabled={!!editingType}
                  />
                </div>
              </div>

              {/* Row: Days per year | Carry-forward max */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Days per year</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_days_per_year}
                    onChange={(e) => set("max_days_per_year", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Carry-forward max</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_carryover}
                    onChange={(e) => set("max_carryover", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Row: Max days per request | Advance notice */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Max days per request</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_days_per_request}
                    onChange={(e) => set("max_days_per_request", Number(e.target.value))}
                    placeholder="0 = unlimited"
                  />
                </div>
                <div>
                  <label className={labelCls}>Advance notice (days)</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.advance_notice_days}
                    onChange={(e) => set("advance_notice_days", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Row: Rounding rule | Carryover expiry */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Rounding Rule</label>
                  <select
                    className={inputCls}
                    value={typeForm.rounding_rule}
                    onChange={(e) => set("rounding_rule", e.target.value)}
                  >
                    {ROUNDING_RULE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                {typeForm.carryover_allowed && (
                  <div>
                    <label className={labelCls}>Carryover Expiry</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={12}
                        className={inputCls}
                        placeholder="Month"
                        value={typeForm.carryover_expiry_month ?? ""}
                        onChange={(e) => set("carryover_expiry_month", e.target.value === "" ? null : Number(e.target.value))}
                      />
                      <input
                        type="number" min={1} max={31}
                        className={inputCls}
                        placeholder="Day"
                        value={typeForm.carryover_expiry_day ?? ""}
                        onChange={(e) => set("carryover_expiry_day", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Leave blank for no expiry</p>
                  </div>
                )}
              </div>

              {/* Cancel window — full width */}
              <div>
                <label className={labelCls}>Cancel window (days after submission)</label>
                <input
                  type="number" min={0}
                  className={inputCls}
                  value={typeForm.cancel_window_days}
                  onChange={(e) => set("cancel_window_days", Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Employees can request cancellation within this many days after submitting the leave request. Set 0 to disable.
                </p>
              </div>

              {/* Row: Gender restriction | Deduct from */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Gender restriction</label>
                  <select
                    className={inputCls}
                    value={typeForm.gender_restriction}
                    onChange={(e) => set("gender_restriction", e.target.value)}
                  >
                    <option value="all">any</option>
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Deduct from</label>
                  <select
                    className={inputCls}
                    value={typeForm.deduct_from_type_id ?? ""}
                    onChange={(e) => set("deduct_from_type_id", e.target.value || null)}
                  >
                    <option value="">balance</option>
                    {leaveTypes
                      .filter((lt) => lt.id !== editingType?.id)
                      .map((lt) => (
                        <option key={lt.id} value={lt.id}>{lt.leave_name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Toggle switches — 2-column grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-1">
                {(
                  [
                    ["probation_required",  "Probation required"],
                    ["requires_document",   "Document required"],
                    ["half_day_allowed",    "Half-day allowed"],
                    ["skip_team_capacity",  "Skip capacity check"],
                    ["monthly_accrual",     "Monthly accrual"],
                    ["seniority_based",     "Seniority based"],
                    ["is_replacement_leave","Replacement leave"],
                    ["is_paid",             "Paid"],
                  ] as [keyof LeaveTypeForm, string][]
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle
                      checked={typeForm[key] as boolean}
                      onChange={(v) => set(key, v as LeaveTypeForm[typeof key])}
                    />
                  </div>
                ))}

                {/* Active — single item spanning left col */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Active</span>
                  <Toggle
                    checked={typeForm.is_active}
                    onChange={(v) => set("is_active", v)}
                  />
                </div>
              </div>

              {/* Error */}
              {typeError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {typeError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-background rounded-b-xl">
              <Button variant="outline" onClick={() => setShowTypeForm(false)}>Cancel</Button>
              <Button onClick={saveType} disabled={typeSaving}>
                {typeSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <YearEndRunWizard open={yearEndWizardOpen} onOpenChange={setYearEndWizardOpen} preview={yearEndPreview} onConfirm={confirmYearEnd} />

    </div>
  );
}
