import { type SupabaseClient } from "@supabase/supabase-js";
import type { MasterLibraryRecord, MasterLibraryType, TaskTemplateMasterRecord } from "@/components/project/wbs/wbs-types";

export interface MasterLibraryDefinition {
  type: MasterLibraryType;
  label: string;
  table: string;
  codeField: string;
  nameField: string;
  extraFields: string[];
  orderField: string;
}

// Levels are not a single-item library: they come only from Level Templates (lib/level-library.ts),
// copied into a building. The old level_master table is kept but no longer offered.
export const MASTER_LIBRARY_DEFINITIONS: MasterLibraryDefinition[] = [
  { type: "phase", label: "Phases", table: "phase_master", codeField: "phase_code", nameField: "phase_name", extraFields: ["sequence_no", "description"], orderField: "sequence_no" },
  { type: "building", label: "Buildings", table: "building_master", codeField: "building_code", nameField: "building_name", extraFields: ["building_type", "description"], orderField: "building_code" },
  { type: "stage", label: "Stages", table: "stage_master", codeField: "stage_code", nameField: "stage_name", extraFields: ["sequence_no", "description"], orderField: "sequence_no" },
  { type: "zone", label: "Zones", table: "zone_master", codeField: "zone_code", nameField: "zone_name", extraFields: ["description"], orderField: "zone_code" },
  { type: "room", label: "Rooms", table: "room_master", codeField: "room_code", nameField: "room_name", extraFields: ["category", "discipline", "description"], orderField: "room_code" },
  { type: "element", label: "Elements", table: "element_master", codeField: "element_code", nameField: "element_name", extraFields: ["category", "discipline", "description"], orderField: "element_code" },
  { type: "discipline", label: "Disciplines", table: "discipline_master", codeField: "discipline_code", nameField: "discipline_name", extraFields: ["sequence_no", "description"], orderField: "sequence_no" },
  { type: "task_group", label: "Task Groups", table: "task_group_master", codeField: "task_group_code", nameField: "task_group_name", extraFields: ["category", "description"], orderField: "task_group_code" },
  { type: "task_template", label: "Task Templates", table: "task_template_master", codeField: "template_code", nameField: "task_name", extraFields: [], orderField: "template_code" },
];


export function getMasterLibraryDefinition(type: MasterLibraryType) {
  return MASTER_LIBRARY_DEFINITIONS.find((definition) => definition.type === type) ?? MASTER_LIBRARY_DEFINITIONS[0];
}

function isTaskTemplateType(type: MasterLibraryType) {
  return type === "task_template";
}

function asRelatedCode(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const raw = record[field];
  return typeof raw === "string" && raw ? raw : null;
}

export function normalizeMasterRecord(type: MasterLibraryType, row: Record<string, unknown>): MasterLibraryRecord {
  if (isTaskTemplateType(type)) return normalizeTaskTemplateRecord(row);

  const def = getMasterLibraryDefinition(type);
  return {
    id: String(row.id ?? ""),
    code: String(row[def.codeField] ?? ""),
    name: String(row[def.nameField] ?? ""),
    type: String(row.building_type ?? row.level_type ?? "") || null,
    category: String(row.category ?? "") || null,
    discipline: String(row.discipline ?? "") || null,
    sequence_no: typeof row.sequence_no === "number" ? row.sequence_no : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
    description: String(row.description ?? "") || null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function normalizeTaskTemplateRecord(row: Record<string, unknown>): TaskTemplateMasterRecord {
  return {
    id: String(row.id ?? ""),
    code: String(row.template_code ?? ""),
    name: String(row.task_name ?? ""),
    type: null,
    sequence_no: null,
    sort_order: null,
    category: String(row.category ?? "") || null,
    discipline: String(row.discipline ?? "") || null,
    description: String(row.description ?? "") || null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    phase_id: typeof row.phase_id === "string" ? row.phase_id : null,
    phase_code: asRelatedCode(row.phase, "phase_code"),
    discipline_id: typeof row.discipline_id === "string" ? row.discipline_id : null,
    discipline_code: asRelatedCode(row.discipline_master, "discipline_code"),
    task_group_id: typeof row.task_group_id === "string" ? row.task_group_id : null,
    task_group_code: asRelatedCode(row.task_group, "task_group_code"),
    default_duration: typeof row.default_duration === "number" ? row.default_duration : null,
    duration_unit: String(row.duration_unit ?? "days") || "days",
    default_weight: typeof row.default_weight === "number" ? row.default_weight : null,
    default_priority: String(row.default_priority ?? "medium") || "medium",
    predecessor: String(row.predecessor ?? "") || null,
    successor: String(row.successor ?? "") || null,
    milestone: Boolean(row.milestone),
    approval_required: Boolean(row.approval_required),
    requires_document: Boolean(row.requires_document),
    requires_photo: Boolean(row.requires_photo),
    requires_checklist: Boolean(row.requires_checklist),
    requires_inspection: Boolean(row.requires_inspection),
    auto_assign_role: String(row.auto_assign_role ?? "") || null,
    deliverable: String(row.deliverable ?? "") || null,
    required_document: String(row.required_document ?? "") || null,
    approval_workflow: String(row.approval_workflow ?? "") || null,
    dependency: String(row.dependency ?? "") || null,
    remarks: String(row.remarks ?? "") || null,
  };
}

export function recordToDbPayload(type: MasterLibraryType, record: Partial<MasterLibraryRecord>) {
  if (isTaskTemplateType(type)) return taskTemplateRecordToDbPayload(record as Partial<TaskTemplateMasterRecord>);

  const def = getMasterLibraryDefinition(type);
  const payload: Record<string, unknown> = {
    [def.codeField]: record.code?.trim().toUpperCase(),
    [def.nameField]: record.name?.trim(),
    is_active: record.is_active ?? true,
  };

  if (def.extraFields.includes("description")) payload.description = record.description?.trim() || null;
  if (def.extraFields.includes("category")) payload.category = record.category?.trim() || null;
  if (def.extraFields.includes("discipline")) payload.discipline = record.discipline?.trim() || null;
  if (def.extraFields.includes("building_type")) payload.building_type = record.type?.trim() || null;
  if (def.extraFields.includes("level_type")) payload.level_type = record.type?.trim() || null;
  if (def.extraFields.includes("sequence_no")) payload.sequence_no = Number(record.sequence_no ?? 0);
  if (def.extraFields.includes("sort_order")) payload.sort_order = Number(record.sort_order ?? 0);

  return payload;
}

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function taskTemplateRecordToDbPayload(record: Partial<TaskTemplateMasterRecord>) {
  return {
    template_code: record.code?.trim().toUpperCase(),
    task_name: record.name?.trim(),
    category: nullableText(record.category),
    phase_id: record.phase_id || null,
    discipline_id: record.discipline_id || null,
    task_group_id: record.task_group_id || null,
    default_duration: Number(record.default_duration ?? 1),
    duration_unit: nullableText(record.duration_unit) ?? "days",
    default_weight: record.default_weight === null || record.default_weight === undefined ? null : Number(record.default_weight),
    default_priority: nullableText(record.default_priority) ?? "medium",
    predecessor: nullableText(record.predecessor),
    successor: nullableText(record.successor),
    milestone: Boolean(record.milestone),
    approval_required: Boolean(record.approval_required),
    requires_document: Boolean(record.requires_document),
    requires_photo: Boolean(record.requires_photo),
    requires_checklist: Boolean(record.requires_checklist),
    requires_inspection: Boolean(record.requires_inspection),
    auto_assign_role: nullableText(record.auto_assign_role),
    deliverable: nullableText(record.deliverable),
    required_document: nullableText(record.required_document),
    approval_workflow: nullableText(record.approval_workflow),
    dependency: nullableText(record.dependency),
    description: nullableText(record.description),
    remarks: nullableText(record.remarks),
    is_active: record.is_active ?? true,
  };
}

export async function listMasterLibraryItems(
  supabase: SupabaseClient,
  type: MasterLibraryType,
): Promise<MasterLibraryRecord[]> {
  const def = getMasterLibraryDefinition(type);
  if (isTaskTemplateType(type)) {
    const { data, error } = await supabase
      .from(def.table)
      .select("*, phase:phase_master(phase_code), discipline_master:discipline_master(discipline_code), task_group:task_group_master(task_group_code)")
      .order(def.orderField, { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => normalizeTaskTemplateRecord(row as Record<string, unknown>));
  }

  const { data, error } = await supabase.from(def.table).select("*").order(def.orderField, { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeMasterRecord(type, row as Record<string, unknown>));
}

export async function upsertMasterLibraryItem(
  supabase: SupabaseClient,
  type: MasterLibraryType,
  record: Partial<MasterLibraryRecord>,
) {
  const def = getMasterLibraryDefinition(type);
  const payload = recordToDbPayload(type, record);
  if (record.id) {
    const { error } = await supabase.from(def.table).update(payload).eq("id", record.id);
    if (error) throw error;
    return record.id;
  }
  const { data, error } = await supabase.from(def.table).insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function setMasterLibraryActive(
  supabase: SupabaseClient,
  type: MasterLibraryType,
  id: string,
  isActive: boolean,
) {
  const def = getMasterLibraryDefinition(type);
  const { error } = await supabase.from(def.table).update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export function masterLibraryCsvRows(type: MasterLibraryType, records: MasterLibraryRecord[]): string[][] {
  if (isTaskTemplateType(type)) return taskTemplateCsvRows(records as TaskTemplateMasterRecord[]);

  const def = getMasterLibraryDefinition(type);
  const headers = ["code", "name", ...def.extraFields, "is_active"];
  return [
    headers,
    ...records.map((record) => headers.map((header) => {
      if (header === "code") return record.code;
      if (header === "name") return record.name;
      if (header === "building_type" || header === "level_type") return record.type ?? "";
      if (header === "sequence_no") return String(record.sequence_no ?? 0);
      if (header === "sort_order") return String(record.sort_order ?? 0);
      if (header === "category") return record.category ?? "";
      if (header === "discipline") return record.discipline ?? "";
      if (header === "description") return record.description ?? "";
      if (header === "is_active") return record.is_active ? "true" : "false";
      return "";
    })),
  ];
}

const TASK_TEMPLATE_CSV_HEADERS = [
  "code",
  "name",
  "category",
  "phase_id",
  "discipline_id",
  "task_group_id",
  "default_duration",
  "duration_unit",
  "default_weight",
  "default_priority",
  "predecessor",
  "successor",
  "milestone",
  "approval_required",
  "requires_document",
  "requires_photo",
  "requires_checklist",
  "requires_inspection",
  "auto_assign_role",
  "deliverable",
  "required_document",
  "approval_workflow",
  "dependency",
  "description",
  "remarks",
  "is_active",
];

function taskTemplateCsvRows(records: TaskTemplateMasterRecord[]): string[][] {
  return [
    TASK_TEMPLATE_CSV_HEADERS,
    ...records.map((record) => TASK_TEMPLATE_CSV_HEADERS.map((header) => {
      const value = record[header as keyof TaskTemplateMasterRecord];
      if (typeof value === "boolean") return value ? "true" : "false";
      if (typeof value === "number") return String(value);
      return value ? String(value) : "";
    })),
  ];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function csvRowsToMasterRecords(type: MasterLibraryType, rows: string[][]): Partial<MasterLibraryRecord>[] {
  if (isTaskTemplateType(type)) return csvRowsToTaskTemplateRecords(rows);

  const def = getMasterLibraryDefinition(type);
  const [headers = [], ...body] = rows;
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const codeIndex = normalizedHeaders.indexOf("code");
  const nameIndex = normalizedHeaders.indexOf("name");
  if (codeIndex < 0 || nameIndex < 0) throw new Error("CSV must include code and name columns.");

  return body.map((row) => {
    const get = (field: string) => {
      const index = normalizedHeaders.indexOf(field);
      return index >= 0 ? row[index]?.trim() ?? "" : "";
    };
    const record: Partial<MasterLibraryRecord> = {
      code: row[codeIndex]?.trim() ?? "",
      name: row[nameIndex]?.trim() ?? "",
      is_active: get("is_active").toLowerCase() !== "false",
    };
    if (!record.code || !record.name) throw new Error("Every CSV row must include code and name.");
    if (def.extraFields.includes("description")) record.description = get("description") || null;
    if (def.extraFields.includes("category")) record.category = get("category") || null;
    if (def.extraFields.includes("discipline")) record.discipline = get("discipline") || null;
    if (def.extraFields.includes("building_type")) record.type = get("building_type") || null;
    if (def.extraFields.includes("level_type")) record.type = get("level_type") || null;
    if (def.extraFields.includes("sequence_no")) record.sequence_no = Number(get("sequence_no") || 0);
    if (def.extraFields.includes("sort_order")) record.sort_order = Number(get("sort_order") || 0);
    return record;
  });
}

function csvRowsToTaskTemplateRecords(rows: string[][]): Partial<TaskTemplateMasterRecord>[] {
  const [headers = [], ...body] = rows;
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const codeIndex = normalizedHeaders.indexOf("code");
  const nameIndex = normalizedHeaders.indexOf("name");
  if (codeIndex < 0 || nameIndex < 0) throw new Error("CSV must include code and name columns.");

  const getFrom = (row: string[], field: string) => {
    const index = normalizedHeaders.indexOf(field);
    return index >= 0 ? row[index]?.trim() ?? "" : "";
  };
  const boolFrom = (row: string[], field: string) => ["true", "yes", "1"].includes(getFrom(row, field).toLowerCase());
  const numberFrom = (row: string[], field: string, fallback: number | null) => {
    const raw = getFrom(row, field);
    if (!raw) return fallback;
    const value = Number(raw);
    if (Number.isNaN(value)) throw new Error(`${field} must be a number.`);
    return value;
  };

  return body.map((row) => {
    const record: Partial<TaskTemplateMasterRecord> = {
      code: row[codeIndex]?.trim() ?? "",
      name: row[nameIndex]?.trim() ?? "",
      category: getFrom(row, "category") || null,
      phase_id: getFrom(row, "phase_id") || null,
      discipline_id: getFrom(row, "discipline_id") || null,
      task_group_id: getFrom(row, "task_group_id") || null,
      default_duration: numberFrom(row, "default_duration", 1),
      duration_unit: getFrom(row, "duration_unit") || "days",
      default_weight: numberFrom(row, "default_weight", null),
      default_priority: getFrom(row, "default_priority") || "medium",
      predecessor: getFrom(row, "predecessor") || null,
      successor: getFrom(row, "successor") || null,
      milestone: boolFrom(row, "milestone"),
      approval_required: boolFrom(row, "approval_required"),
      requires_document: boolFrom(row, "requires_document"),
      requires_photo: boolFrom(row, "requires_photo"),
      requires_checklist: boolFrom(row, "requires_checklist"),
      requires_inspection: boolFrom(row, "requires_inspection"),
      auto_assign_role: getFrom(row, "auto_assign_role") || null,
      deliverable: getFrom(row, "deliverable") || null,
      required_document: getFrom(row, "required_document") || null,
      approval_workflow: getFrom(row, "approval_workflow") || null,
      dependency: getFrom(row, "dependency") || null,
      description: getFrom(row, "description") || null,
      remarks: getFrom(row, "remarks") || null,
      is_active: getFrom(row, "is_active").toLowerCase() !== "false",
    };
    if (!record.code || !record.name) throw new Error("Every CSV row must include code and name.");
    return record;
  });
}
