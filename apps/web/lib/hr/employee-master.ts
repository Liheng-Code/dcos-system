export type EmployeeStatus = "active" | "inactive" | "resigned";

export interface EmployeeProfile {
  id: string;
  employee_id: string | null;
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
  status: EmployeeStatus;
  team_id: string | null;
  position_id: string | null;
  grade: string | null;
  employment_type: string | null;
  join_date: string | null;
  probation_status: string | null;
  probation_end_date: string | null;
  contract_end_date: string | null;
}

export interface Department {
  id: string;
  department_name: string;
}

export interface Team {
  id: string;
  team_name: string;
  department_id: string;
}

export interface Position {
  id: string;
  position_name: string;
  department_id: string;
  grade: string | null;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  verified: boolean | null;
}

export interface EmployeeCertification {
  id: string;
  employee_id: string;
  certification_name: string;
  issuing_body: string | null;
  expiry_date: string | null;
  status: string | null;
}

export const STATUS_OPTIONS: EmployeeStatus[] = ["active", "inactive", "resigned"];
export const EMPLOYMENT_TYPES = ["permanent", "contract", "temporary", "intern"];
export const PROBATION_STATUSES = ["not_applicable", "active", "completed", "extended", "failed"];
export const EXTENDED_PROFILE_FIELDS = ["date_of_birth", "nationality", "phone", "address", "contract_end_date"];

export const PROFILE_SELECT_BASE =
  "id, employee_id, full_name, email, role, avatar_url, gender, job_title, department, level, report_to, status, team_id, position_id, grade, employment_type, join_date, probation_status, probation_end_date";
export const PROFILE_SELECT_EXTENDED =
  "id, employee_id, full_name, email, role, avatar_url, gender, date_of_birth, nationality, phone, address, job_title, department, level, report_to, status, team_id, position_id, grade, employment_type, join_date, probation_status, probation_end_date, contract_end_date";

export const STATUS_CLASSES: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  resigned: "border-slate-200 bg-slate-100 text-slate-600",
};

export const PROBATION_BADGE: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  extended: "border-orange-200 bg-orange-50 text-orange-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  not_applicable: "border-slate-200 bg-slate-100 text-slate-500",
};

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EM";
}

export function labelize(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function isExpiringSoon(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry - today.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 60;
}

export function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today.getTime();
}

export function isMissingExtendedProfileColumn(message: string | undefined) {
  if (!message) return false;
  return EXTENDED_PROFILE_FIELDS.some((field) => message.includes(field));
}

export function normalizeProfile(row: Partial<EmployeeProfile>): EmployeeProfile {
  return {
    id: row.id ?? "",
    employee_id: row.employee_id ?? null,
    full_name: row.full_name ?? "",
    email: row.email ?? "",
    role: row.role ?? "viewer",
    avatar_url: row.avatar_url ?? null,
    gender: row.gender ?? null,
    date_of_birth: row.date_of_birth ?? null,
    nationality: row.nationality ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    job_title: row.job_title ?? null,
    department: row.department ?? null,
    level: row.level ?? null,
    report_to: row.report_to ?? null,
    status: row.status ?? "active",
    team_id: row.team_id ?? null,
    position_id: row.position_id ?? null,
    grade: row.grade ?? null,
    employment_type: row.employment_type ?? null,
    join_date: row.join_date ?? null,
    probation_status: row.probation_status ?? null,
    probation_end_date: row.probation_end_date ?? null,
    contract_end_date: row.contract_end_date ?? null,
  };
}
