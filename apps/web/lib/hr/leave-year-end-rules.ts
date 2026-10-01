// Pure leave year-end rules: rounding, completed service years, seniority
// entitlement lookup and which leave types apply to whom. Used by the year-end
// API route (app/api/hr/leave/year-end/route.ts); kept free of database access
// so the rules can be unit-tested.

/** Reads a numeric database value (numbers arrive as strings from Postgres numeric columns). Invalid or missing is 0. */
export function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Applies a leave type's rounding rule to a day count. An unknown or missing rule leaves the value unchanged. */
export function applyRounding(value: number, rule: string | null | undefined): number {
  switch (rule) {
    case "nearest_half":
      return Math.round(value * 2) / 2;
    case "nearest_whole":
      return Math.round(value);
    case "round_up":
      return Math.ceil(value);
    case "round_down":
      return Math.floor(value);
    default:
      return value;
  }
}

export function formatDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Completed years of service on 31 December of the closing year. Never negative. */
export function serviceYears(joinDate: string, closingYear: number) {
  const joined = new Date(`${joinDate}T00:00:00`);
  const closing = new Date(closingYear, 11, 31);
  let years = closing.getFullYear() - joined.getFullYear();
  const closingMonthDay = (closing.getMonth() + 1) * 100 + closing.getDate();
  const joinedMonthDay = (joined.getMonth() + 1) * 100 + joined.getDate();
  if (closingMonthDay < joinedMonthDay) years -= 1;
  return Math.max(years, 0);
}

/** The first seniority rule of the leave type whose year band contains `years` (bounds inclusive; no max means open-ended). */
export function findRule<
  R extends { leave_type_id: string; min_years: number | string; max_years: number | string | null },
>(rules: R[], leaveTypeId: string, years: number): R | null {
  return rules.find((rule) => {
    const minYears = numeric(rule.min_years);
    const maxYears = rule.max_years == null ? null : numeric(rule.max_years);
    return rule.leave_type_id === leaveTypeId && years >= minYears && (maxYears == null || years <= maxYears);
  }) ?? null;
}

/** Whether a gender-restricted leave type applies to the employee. An employee with no gender recorded gets only unrestricted types. */
export function leaveTypeAppliesToProfile(
  leaveType: { gender_restriction?: string | null },
  profile: { gender?: string | null },
) {
  const restriction = leaveType.gender_restriction ?? "all";
  if (restriction === "all") return true;
  if (!profile.gender) return false;
  return restriction === profile.gender;
}

/** Whether an active leave type should get a generated next-year balance: it has an entitlement or allows carryover. */
export function includeLeaveTypeInGeneratedPreview(leaveType: {
  is_active?: boolean | null;
  seniority_based: boolean | null;
  max_days_per_year: number | string | null;
  carryover_allowed: boolean | null;
}) {
  if (leaveType.is_active === false) return false;
  return leaveType.seniority_based === true || numeric(leaveType.max_days_per_year) > 0 || leaveType.carryover_allowed === true;
}
