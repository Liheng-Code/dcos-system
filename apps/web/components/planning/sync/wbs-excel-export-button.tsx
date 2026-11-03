"use client";

// Doc 35 I8: export the WBS and its activities to Excel (two sheets).

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { wbsWorkbookRows, type ExportNode, type ExportTask } from "@/lib/planning/wbs-excel-export";

const NODE_COLS = "id, parent_id, wbs_code, wbs_outline_code, wbs_name, node_type, sort_order, cost_code, discipline, responsible_id, is_locked";
const TASK_COLS =
  "id, wbs_node_id, task_code, task_name, wbs_outline_code, start_date, end_date, duration_days, duration_unit, progress, is_milestone, " +
  "constraint_type, constraint_date, baseline_start_date, baseline_finish_date, actual_start_date, actual_finish_date, " +
  "dependency_task_ids, dependency_types, dependency_lag_days, owner_name, cost_code, sort_order";

async function pages<T>(fetch: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetch(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export function WbsExcelExportButton({ projectId, projectCode }: { projectId: string; projectCode?: string | null }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const db = createClient();
      const [nodes, tasks] = await Promise.all([
        pages<ExportNode>((a, b) => db.from("wbs_nodes").select(NODE_COLS).eq("project_id", projectId).order("id").range(a, b)),
        pages<ExportTask>((a, b) => db.from("wbs_tasks").select(TASK_COLS).eq("project_id", projectId).order("id").range(a, b)),
      ]);
      const ids = [...new Set(nodes.map((n) => n.responsible_id).filter((x): x is string => !!x))];
      const { data: people } = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
      const names = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? ""]));
      const { wbs, activities } = wbsWorkbookRows(nodes, tasks, names);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wbs), "WBS");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(activities), "Activities");
      XLSX.writeFile(wb, `${projectCode ?? "project"}-WBS-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${wbs.length - 1} WBS items and ${activities.length - 1} activities`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally { setBusy(false); }
  }
  return (
    <Button variant="outline" onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      Export WBS to Excel
    </Button>
  );
}
