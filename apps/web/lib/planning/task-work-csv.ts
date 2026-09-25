// Productivity & Resource-Costing Plan, Phase 2 — CSV import for the Task Work grid.
// Pure parsing (no Supabase calls); see boq-mapping-service.ts for applyCsvImport(), which writes the rows.

/** Minimal RFC4180-ish CSV parser: quoted fields, escaped "" quotes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface TaskWorkImportRow {
  line: number; // 1-based, header is line 1
  taskCode: string;
  taskId: string;
  quantity: number;
  unit: string;
  reason: string | null; // per-row reason column, if the file has one
}

export interface TaskWorkImportError {
  line: number;
  taskCode: string;
  message: string;
}

export interface TaskWorkImportResult {
  rows: TaskWorkImportRow[];
  errors: TaskWorkImportError[];
}

const HEADER_ALIASES: Record<string, string> = {
  task_code: "task_code", taskcode: "task_code", code: "task_code", task: "task_code",
  quantity: "quantity", qty: "quantity",
  unit: "unit", quantity_unit: "unit",
  reason: "reason",
};

/**
 * Parses a "task_code,quantity,unit[,reason]" CSV (header required, columns can be in any order, matched by
 * name). `taskIndex` maps a task_code to its id, so an unknown code is caught here rather than at save time.
 */
export function parseTaskWorkImportCsv(csvText: string, taskIndex: Map<string, string>): TaskWorkImportResult {
  const grid = parseCsv(csvText);
  const rows: TaskWorkImportRow[] = [];
  const errors: TaskWorkImportError[] = [];
  if (grid.length === 0) {
    errors.push({ line: 0, taskCode: "", message: "The file is empty." });
    return { rows, errors };
  }

  const header = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")] ?? "");
  const col = (name: string) => header.indexOf(name);
  const taskCol = col("task_code");
  const qtyCol = col("quantity");
  const unitCol = col("unit");
  const reasonCol = col("reason");
  if (taskCol === -1 || qtyCol === -1 || unitCol === -1) {
    errors.push({ line: 1, taskCode: "", message: "Header must include task_code, quantity and unit columns." });
    return { rows, errors };
  }

  const seen = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const line = i + 1;
    const r = grid[i];
    if (r.every((c) => c.trim() === "")) continue;
    const taskCode = (r[taskCol] ?? "").trim();
    const qtyRaw = (r[qtyCol] ?? "").trim();
    const unit = (r[unitCol] ?? "").trim();
    const reason = reasonCol === -1 ? null : ((r[reasonCol] ?? "").trim() || null);

    if (!taskCode) { errors.push({ line, taskCode, message: "Missing task_code." }); continue; }
    const taskId = taskIndex.get(taskCode);
    if (!taskId) { errors.push({ line, taskCode, message: "No task with this code in the project." }); continue; }
    if (seen.has(taskCode)) { errors.push({ line, taskCode, message: "Duplicate task_code in this file (only the first is kept)." }); continue; }
    if (qtyRaw === "" || Number.isNaN(Number(qtyRaw))) { errors.push({ line, taskCode, message: `Quantity "${qtyRaw}" is not a number.` }); continue; }
    const quantity = Number(qtyRaw);
    if (quantity < 0) { errors.push({ line, taskCode, message: "Quantity cannot be negative." }); continue; }
    if (!unit) { errors.push({ line, taskCode, message: "Missing unit." }); continue; }

    seen.add(taskCode);
    rows.push({ line, taskCode, taskId, quantity, unit, reason });
  }
  return { rows, errors };
}
