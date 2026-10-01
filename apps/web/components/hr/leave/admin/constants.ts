// Options, defaults and shared class names for the Leave Admin Setup page.

import type { HolidayForm, LeaveTypeForm } from "@/lib/hr/leave-admin-types";

// ── Color helpers ─────────────────────────────────────────────────────────────
export const COLOR_OPTIONS = [
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
export const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

export const DEFAULT_FORM: LeaveTypeForm = {
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

export const ROUNDING_RULE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "nearest_half", label: "Nearest 0.5 day" },
  { value: "nearest_whole", label: "Nearest whole day" },
  { value: "round_up", label: "Round up" },
  { value: "round_down", label: "Round down" },
];

export const HOLIDAY_YEARS = [2026, 2027, 2028, 2029, 2030];
export const DAYS_OF_WEEK  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const DEFAULT_HOLIDAY_FORM: HolidayForm = {
  holiday_date: "",
  holiday_name: "",
  year: new Date().getFullYear(),
  is_active: true,
  note: "",
};

// ── Field helpers ─────────────────────────────────────────────────────────────
export const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";
export const labelCls = "block text-sm font-medium text-foreground mb-1";
