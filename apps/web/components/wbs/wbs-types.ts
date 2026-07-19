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
  start_date: string | null;
  end_date: string | null;
  delay_status: string;
  delay_reason: string | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  baseline_set_at: string | null;
  baseline_set_by: string | null;
  dependency_text: string | null;
  dependency_type: string | null;
  dependency_task_id: string | null;
  lag_days: number;
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
  | "task_overdue";

export interface WbsTaskAlertRecord {
  id: string;
  project_id: string;
  wbs_task_id: string;
  actor_id: string | null;
  actor_name: string | null;
  recipient_id: string;
  alert_type: WbsTaskAlertType;
  title: string;
  body: string | null;
  task_code: string;
  task_name: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface WbsTemplateRecord {
  id: string;
  template_name: string;
  template_desc: string | null;
  node_type_chain: string[];
  is_active: boolean;
}
