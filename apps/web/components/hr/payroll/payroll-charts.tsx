"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp, Building2, FolderKanban } from "lucide-react";

export interface MonthlyTrendPoint {
  label: string;
  gross: number;
  net: number;
}

export interface NamedAmount {
  name: string;
  amount: number;
}

function money(v: number) {
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function PayrollCharts({
  trend,
  byDepartment,
  byProject,
}: {
  trend: MonthlyTrendPoint[];
  byDepartment: NamedAmount[];
  byProject: NamedAmount[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Monthly payroll trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Monthly Payroll
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {trend.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-16 text-center">No payroll history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={money} width={56} />
                <Tooltip formatter={(v) => money(Number(v ?? 0))} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="gross" name="Gross" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Department payroll */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Department Payroll
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {byDepartment.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-16 text-center">No entries for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDepartment} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={money} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={86} />
                <Tooltip formatter={(v) => money(Number(v ?? 0))} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="amount" name="Gross" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Project labor cost */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5" /> Project Labor Cost
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {byProject.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-16 text-center">No cost allocations for this period yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProject} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={money} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={86} />
                <Tooltip formatter={(v) => money(Number(v ?? 0))} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="amount" name="Allocated" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
