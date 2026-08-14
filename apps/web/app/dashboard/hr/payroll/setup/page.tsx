"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Settings2, DollarSign } from "lucide-react";
import { SalaryStructureSheet } from "@/components/hr/payroll/salary-structure-sheet";

interface Employee {
  id: string;
  full_name: string;
  department: string;
  job_title: string;
  employment_type: string | null;
  hasStructure?: boolean;
}

export default function SalarySetupPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("id, full_name, department, job_title, employment_type").order("full_name"),
      supabase.from("employee_salary_structures").select("employee_id").is("effective_to", null),
    ]).then(([empRes, structRes]) => {
      const empIds = new Set((structRes.data || []).map((r: { employee_id: string }) => r.employee_id));
      const rows = ((empRes.data || []) as Employee[]).map((e) => ({
        ...e,
        hasStructure: empIds.has(e.id),
      }));
      setEmployees(rows);
      setLoading(false);
    });
  }, []);

  const filtered = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(query.toLowerCase()) ||
      (e.department ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const withStructure = filtered.filter((e) => e.hasStructure).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Salary Setup</h2>
          <p className="text-muted-foreground text-sm">Configure base salary and allowances per employee</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Employees ({filtered.length})</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or department..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{withStructure}</span> / {employees.length} configured
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No employees match your search.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize truncate">
                      {emp.department} · {emp.job_title}
                      {emp.employment_type && ` · ${emp.employment_type}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {emp.hasStructure ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <DollarSign className="h-3.5 w-3.5" /> Configured
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelected(emp)} className="gap-1 h-7 text-xs">
                      <Settings2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <SalaryStructureSheet
          employee={selected}
          onClose={() => {
            setSelected(null);
            // Refresh hasStructure flags
            const supabase = createClient();
            supabase
              .from("employee_salary_structures")
              .select("employee_id")
              .is("effective_to", null)
              .then(({ data }) => {
                const ids = new Set((data || []).map((r: { employee_id: string }) => r.employee_id));
                setEmployees((prev) => prev.map((e) => ({ ...e, hasStructure: ids.has(e.id) })));
              });
          }}
        />
      )}
    </div>
  );
}
