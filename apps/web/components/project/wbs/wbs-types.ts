export interface TaskComment {
  user: string;
  text: string;
  timestamp: string;
}

export interface WbsNodeRecord {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  full_path: string | null;
  sort_order: number;
  progress_percent: number;
  status: string;
  budget_cost?: number | null;
  actual_cost?: number | null;
  planned_hours?: number | null;
  actual_hours?: number | null;
  is_locked?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
  cost_code?: string | null;
  discipline?: string | null;
  area_label?: string | null;
}

export interface WbsNodeData {
  id: string;
  wbs_code: string;
  wbs_name: string;
  node_type: string;
  full_path: string | null;
  sort_order: number;
  progress_percent: number;
  status: string;
  budget_cost?: number | null;
  actual_cost?: number | null;
  planned_hours?: number | null;
  actual_hours?: number | null;
  gfa_value?: number | null;
  gfa_source?: string | null;
  gfa_updated_at?: string | null;
  is_locked?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
  children: WbsNodeData[];
}

export interface WbsTaskRecord {
  id: string;
  wbs_node_id: string;
  project_id: string;
  task_code: string;
  task_name: string;
  description: string | null;
  status: string;
  progress: number;
  priority: string;
  discipline: string | null;
  owner_id: string | null;
  owner_name: string | null;
  assignee_id: string | null;
  department_id?: string | null;
  requesting_department_id?: string | null;
  cross_dept_status?: "requested" | "accepted" | "rejected" | null;
  cross_dept_note?: string | null;
  cross_dept_decided_by?: string | null;
  cross_dept_decided_at?: string | null;
  start_date: string | null;
  end_date: string | null;
  delay_status: string;
  delay_reason: string | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  baseline_set_at: string | null;
  baseline_set_by: string | null;
  // Gen-1 single-predecessor columns (legacy — kept for older screens)
  dependency_text: string | null;
  dependency_type: string | null;
  dependency_task_id: string | null;
  lag_days: number;
  // Gen-2 multi-predecessor arrays — the format the scheduler and Gantt use.
  // Always written together (see lib/planning/schedule-engine.ts depsToArrays).
  dependency_task_ids?: string[] | null;
  dependency_types?: string[] | null;
  dependency_lag_days?: number[] | null;
  is_milestone?: boolean | null;
  constraint_type?: string | null;
  constraint_date?: string | null;
  manually_scheduled?: boolean;
  schedule_level?: number | null;
  activity_type?: string | null;
  actual_start_date?: string | null;
  actual_finish_date?: string | null;
  field_observation_notes?: string | null;
  docs_count: number;
  photos_count: number;
  qa_status: string;
  budget_cost: number | null;
  actual_cost: number | null;
  planned_hours: number | null;
  actual_hours: number | null;
  sort_order: number;
  task_type: string | null;
  category: string | null;
  cost_code?: string | null;
  area_label?: string | null;
  duration_days?: number | null;
  started_at: string | null;
  paused_at: string | null;
  comments: TaskComment[];
}

export interface WbsBaselineRecord {
  id: string;
  project_id: string;
  baseline_name: string;
  baseline_type: string;
  baseline_date: string;
  snapshot_data: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WbsAuditLogRecord {
  id: string;
  wbs_node_id: string | null;
  wbs_task_id: string | null;
  project_id: string;
  user_id: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export type WbsTaskAlertType =
  | "task_assigned"
  | "task_reassigned"
  | "task_assignment_accepted"
  | "task_assignment_rejected"
  | "task_submitted"
  | "task_approved"
  | "task_rejected"
  | "task_progress_updated"
  | "task_overdue"
  | "cross_dept_requested"
  | "cross_dept_accepted"
  | "cross_dept_rejected"
  | "leave_pending_approval"
  | "leave_request_approved"
  | "leave_request_rejected";

export interface WbsTaskAlertRecord {
  id: string;
  project_id: string | null;
  wbs_task_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  recipient_id: string;
  alert_type: WbsTaskAlertType;
  title: string;
  body: string | null;
  task_code: string | null;
  task_name: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type MasterLibraryType =
  | "phase"
  | "building"
  | "stage"
  | "level"
  | "zone"
  | "room"
  | "element"
  | "discipline"
  | "task_group"
  | "task_template";

export interface MasterLibraryRecord {
  id: string;
  code: string;
  name: string;
  type: string | null;
  category: string | null;
  discipline: string | null;
  sequence_no: number | null;
  sort_order: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateMasterRecord extends MasterLibraryRecord {
  phase_id: string | null;
  phase_code: string | null;
  discipline_id: string | null;
  discipline_code: string | null;
  task_group_id: string | null;
  task_group_code: string | null;
  default_duration: number | null;
  duration_unit: string;
  default_weight: number | null;
  default_priority: string;
  predecessor: string | null;
  successor: string | null;
  milestone: boolean;
  approval_required: boolean;
  requires_document: boolean;
  requires_photo: boolean;
  requires_checklist: boolean;
  requires_inspection: boolean;
  auto_assign_role: string | null;
  deliverable: string | null;
  required_document: string | null;
  approval_workflow: string | null;
  dependency: string | null;
  remarks: string | null;
}
