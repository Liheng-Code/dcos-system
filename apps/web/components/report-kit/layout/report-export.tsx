"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Column {
  key: string;
  label: string;
  format?: (val: unknown) => string | number;
}

interface ReportExportProps {
  data: Record<string, unknown>[];
  columns: Column[];
  filename?: string;
  label?: string;
}

export function ReportExport({
  data,
  columns,
  filename = "report",
  label = "Export",
}: ReportExportProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }
    setExporting(true);
    try {
      const rows = data.map((row) => {
        const obj: Record<string, string | number> = {};
        for (const col of columns) {
          const val = col.format
            ? col.format(row[col.key])
            : (row[col.key] ?? "");
          if (val !== undefined && val !== null) obj[col.label] = val as string | number;
          else obj[col.label] = "";
        }
        return obj;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      const colWidths = columns.map((c) => ({
        wch: Math.max(c.label.length, 12),
      }));
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, `${filename.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`);
      toast.success("Report exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-xl text-xs"
      disabled={exporting || data.length === 0}
      onClick={handleExport}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {exporting ? "Exporting..." : label}
    </Button>
  );
}
