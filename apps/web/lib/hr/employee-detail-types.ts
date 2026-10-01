// Row and form shapes used by the Employee Master detail page.

export interface Role {
  code: string;
  name: string;
  type: string;
}

export interface Profile {
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

export interface AuditLog {
  id: string;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

export interface HrHistoryLog {
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

export interface EmployeeDocumentRow {
  id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  verified: boolean | null;
}

export interface ChecklistStatusRow {
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

export interface AssignmentRow {
  id: string;
  project_id: string;
  role_in_project: string | null;
  allocation_percent: number;
  start_date: string;
  end_date: string | null;
  status: string;
  projects: { project_name: string | null; project_code: string | null }[] | null;
}

export type AssignmentQueryRow = Omit<AssignmentRow, "allocation_percent"> & {
  allocation_percent: number | string;
};

export interface PayrollProfile {
  id?: string;
  payroll_type: string;
  currency: string;
  payroll_group: string;
  ot_eligible: boolean;
  tax_applicable: boolean;
  nssf_applicable: boolean;
  effective_date: string;
}

export interface TaxProfile {
  id?: string;
  tax_residency: string;
  marital_status: string;
  spouse_dependent: boolean;
  num_children: number;
  tax_id: string;
  effective_date: string;
}

export interface NSSFProfile {
  id?: string;
  nssf_applicable: boolean;
  nssf_number: string;
  pension_applicable: boolean;
  healthcare_applicable: boolean;
  occupational_risk_applicable: boolean;
  effective_date: string;
}

export interface BankAccount {
  id?: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string;
  is_primary: boolean;
  payment_method: string;
}

export interface SalaryLine {
  id: string;
  component: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

export interface PayslipRow {
  id: string;
  period: string;
  gross: number;
  deductions: number;
  net: number;
  status: string;
}
