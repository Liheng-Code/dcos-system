// Row and form shapes used by the Leave Admin Setup page.

export interface LeaveType {
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

export interface LeaveTypeForm {
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

export interface SeniorityRule {
  id: string;
  leave_type_id: string;
  min_years: number;
  max_years: number | null;
  days_per_year: number;
}

export interface TeamCapacity {
  id: string;
  department_id: string;
  max_percent: number;
  departments: { department_name: string };
}

export interface YearEndLog {
  id: string;
  run_date: string;
  from_year: number;
  to_year: number;
  days_carried: number;
  days_expired: number;
  profiles: { full_name: string };
}

export type ActiveSection = "leave_types" | "capacity" | "seniority" | "year_end" | "public_holidays";

export interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string | null;
}

export interface HolidayForm {
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string;
}
