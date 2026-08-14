// Shared types for the MS Project sync engine (client parser + server engine).

export const MSP_XML_NAMESPACE = "http://schemas.microsoft.com/project";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

// Maps MSPDI <PredecessorLink><Type> to our dependency_type values.
export const MSP_PREDECESSOR_TYPE_MAP: Record<number, DependencyType> = {
  0: "FF",
  1: "FS",
  2: "SF",
  3: "SS",
};

export interface MspPredecessor {
  uid: string;
  type: DependencyType;
  lag: number; // tenths of a minute
}

export interface MspTask {
  uid: string;
  id: number;
  name: string;
  wbs?: string;
  outlineLevel: number;
  outlineNumber: string;
  summary: boolean;
  milestone: boolean;
  start?: string; // ISO date or datetime string
  finish?: string;
  duration?: string; // ISO8601 duration e.g. PT40H
  percentComplete: number;
  notes?: string;
  work?: string;
  resourceNames?: string[];
  cost?: number;
  predecessors: MspPredecessor[];
}

export interface MspSchedule {
  source: "mspdi";
  fileName?: string;
  projectName?: string;
  projectTitle?: string;
  company?: string;
  sourceIdentifier?: string; // project-level <UID>/<Guid>
  parsedAt: string;
  taskCount: number;
  level3Tasks: MspTask[];
  allTasks: MspTask[];
}

export interface SyncSettings {
  mode: "merge" | "replace";
  syncLevel: number;
  syncProgress: boolean;
  defaultWbsNodeId: string | null;
}

export interface SyncConfigRow {
  id: string;
  project_id: string;
  source_type: string;
  source_identifier: string | null;
  source_name: string | null;
  mode: "merge" | "replace";
  sync_level: number;
  sync_progress: boolean;
  default_wbs_node_id: string | null;
  settings: Record<string, unknown>;
  status: "inactive" | "active" | "error";
  last_synced_at: string | null;
  last_sync_hash: string | null;
}

export type DiffAction = "create" | "update" | "unchanged" | "orphan" | "skip";

// Field-level change for update ops.
export interface FieldChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export interface DiffOp {
  action: DiffAction;
  mspUid?: string;
  outlineNumber?: string;
  taskName?: string;
  // Existing DCOS task (update/unchanged/orphan).
  taskId?: string;
  taskCode?: string;
  // Changes to apply (update ops).
  changes?: FieldChange[];
  // Projected wbs_tasks row for create ops.
  row?: Record<string, unknown>;
  // Raw predecessor UID for dependency resolution at commit time.
  dependsOnMspUid?: string;
  dependsOnType?: DependencyType;
  // Canonical hash of the incoming MSP fields (written back on commit).
  incomingHash?: string;
  warning?: string;
}

export interface DiffSummary {
  create: number;
  update: number;
  unchanged: number;
  orphan: number;
  skip: number;
  discarded?: number;
  total: number;
}

export interface DiffPlan {
  summary: DiffSummary;
  ops: DiffOp[];
  warnings: string[];
}

export interface CommitResult {
  applied: DiffSummary;
  errors: { mspUid: string; error: string }[];
}
