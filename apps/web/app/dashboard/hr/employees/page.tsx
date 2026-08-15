"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  BriefcaseBusiness,
  FileText,
  Loader2,
  Plus,
  UserRound,
  Users,
  WandSparkles,
  Building2,
  Users2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { EmployeesTabs } from "@/components/hr/employees/employees-tabs";
import {
  type EmployeeProfile,
  type Department,
  type EmployeeDocument,
  type EmployeeCertification,
  isExpiringSoon,
  isExpired,
  isMissingExtendedProfileColumn,
  normalizeProfile,
  PROFILE_SELECT_EXTENDED,
  PROFILE_SELECT_BASE,
  labelize,
} from "@/lib/hr/employee-master";

export default function EmployeesDashboardPage() {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [certifications, setCertifications] = useState<EmployeeCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const [profileRes, departmentRes, documentRes, certRes] = await Promise.all([
        supabase.from("profiles").select(PROFILE_SELECT_EXTENDED).order("employee_id", { ascending: true, nullsFirst: false }),
        supabase.from("departments").select("id, department_name").order("department_name"),
        supabase.from("employee_documents").select("id, employee_id, document_type, document_name, expiry_date, verified"),
        supabase.from("employee_certifications").select("id, employee_id, certification_name, issuing_body, expiry_date, status"),
      ]);

      if (cancelled) return;

      let profileData = profileRes.data as Partial<EmployeeProfile>[] | null;
      let profileError = profileRes.error;
      if (isMissingExtendedProfileColumn(profileRes.error?.message)) {
        const baseRes = await supabase.from("profiles").select(PROFILE_SELECT_BASE).order("employee_id", { ascending: true, nullsFirst: false });
        profileData = baseRes.data as Partial<EmployeeProfile>[] | null;
        profileError = baseRes.error;
      }

      if (cancelled) return;

      const firstError = profileError ?? departmentRes.error ?? documentRes.error ?? certRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setProfiles((profileData ?? []).map(normalizeProfile));
      setDepartments((departmentRes.data ?? []) as Department[]);
      setDocuments((documentRes.data ?? []) as EmployeeDocument[]);
      setCertifications((certRes.data ?? []) as EmployeeCertification[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const active = profiles.filter((p) => p.status === "active").length;
    const inactive = profiles.filter((p) => p.status !== "active").length;
    const probationDue = profiles.filter((p) => p.probation_status === "active" && isExpiringSoon(p.probation_end_date)).length;
    const contractExpiring = profiles.filter((p) => isExpiringSoon(p.contract_end_date)).length;
    const docsDue = documents.filter((d) => isExpired(d.expiry_date) || isExpiringSoon(d.expiry_date)).length;
    const certsDue = certifications.filter((c) => isExpired(c.expiry_date) || isExpiringSoon(c.expiry_date) || c.status === "pending_renewal").length;
    return { total: profiles.length, active, inactive, probationDue, contractExpiring, docsDue, certsDue };
  }, [certifications, documents, profiles]);

  const departmentCounts = useMemo(() => {
    const deptNames = new Set(departments.map((d) => d.department_name));
    profiles.forEach((p) => { if (p.department) deptNames.add(p.department); });
    const counts: { name: string; count: number }[] = [];
    for (const name of deptNames) {
      const count = profiles.filter((p) => p.department === name).length;
      if (count > 0) counts.push({ name, count });
    }
    return counts.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [departments, profiles]);

  const levelCounts = useMemo(() => {
    const levels = new Set<string>();
    profiles.forEach((p) => { if (p.level) levels.add(p.level); });
    const counts: { name: string; count: number }[] = [];
    for (const name of levels) {
      counts.push({ name, count: profiles.filter((p) => p.level === name).length });
    }
    return counts.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading employee data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <EmployeesTabs />
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/dashboard/hr/employees/list">
              <Users className="h-4 w-4" />
              View Detail List
            </Link>
          </Button>
          <Button className="gap-2" asChild>
            <Link href="/dashboard/hr/employees/new">
              <Plus className="h-4 w-4" />
              New Employee
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Employee Master</h2>
        <p className="text-muted-foreground">Overview of workforce statistics</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <SummaryCard title="Total Employees" value={stats.total} icon={Users} />
        <SummaryCard title="Active" value={stats.active} icon={UserRound} tone="success" />
        <SummaryCard title="Inactive / Resigned" value={stats.inactive} icon={BriefcaseBusiness} tone="muted" />
        <SummaryCard title="Probation Due" value={stats.probationDue} icon={AlertCircle} tone="warning" />
        <SummaryCard title="Contracts Due" value={stats.contractExpiring} icon={BriefcaseBusiness} tone="warning" />
        <SummaryCard title="Docs Due" value={stats.docsDue} icon={FileText} tone="warning" />
        <SummaryCard title="Certs Due" value={stats.certsDue} icon={Award} tone="warning" />
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Employees by Department
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {departmentCounts.map((dept, i) => (
            <HueCard key={dept.name} name={dept.name} value={dept.count} index={i} icon={Building2} />
          ))}
        </div>
      </div>

      {levelCounts.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Users2 className="h-4 w-4 text-muted-foreground" />
            Employees by Level
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {levelCounts.map((lv, i) => (
              <HueCard key={lv.name} name={lv.name} value={lv.count} index={i} icon={UserRound} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CARD_PALETTES = [
  { border: "border-t-blue-500", text: "text-blue-600", bg: "bg-blue-50", icon: "text-blue-500" },
  { border: "border-t-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50", icon: "text-emerald-500" },
  { border: "border-t-violet-500", text: "text-violet-600", bg: "bg-violet-50", icon: "text-violet-500" },
  { border: "border-t-amber-500", text: "text-amber-600", bg: "bg-amber-50", icon: "text-amber-500" },
  { border: "border-t-rose-500", text: "text-rose-600", bg: "bg-rose-50", icon: "text-rose-500" },
  { border: "border-t-cyan-500", text: "text-cyan-600", bg: "bg-cyan-50", icon: "text-cyan-500" },
  { border: "border-t-indigo-500", text: "text-indigo-600", bg: "bg-indigo-50", icon: "text-indigo-500" },
  { border: "border-t-teal-500", text: "text-teal-600", bg: "bg-teal-50", icon: "text-teal-500" },
  { border: "border-t-orange-500", text: "text-orange-600", bg: "bg-orange-50", icon: "text-orange-500" },
  { border: "border-t-pink-500", text: "text-pink-600", bg: "bg-pink-50", icon: "text-pink-500" },
];

function HueCard({ name, value, index, icon: Icon }: { name: string; value: number; index: number; icon: typeof Users }) {
  const p = CARD_PALETTES[index % CARD_PALETTES.length];
  return (
    <Card gradient={false} className={cn("border-t-4", p.border)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate" title={labelize(name)}>
          {labelize(name)}
        </CardTitle>
        <div className={cn("rounded-full p-1.5", p.bg)}>
          <Icon className={cn("h-4 w-4", p.icon)} />
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold", p.text)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: typeof Users;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const palette = {
    default: { border: "border-t-primary", text: "text-primary", bg: "bg-primary/10", icon: "text-primary" },
    success: { border: "border-t-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50", icon: "text-emerald-500" },
    warning: { border: "border-t-amber-500", text: "text-amber-600", bg: "bg-amber-50", icon: "text-amber-500" },
    muted: { border: "border-t-slate-400", text: "text-slate-500", bg: "bg-slate-50", icon: "text-slate-400" },
  }[tone];

  return (
    <Card gradient={false} className={cn("border-t-4", palette.border)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn("rounded-full p-1.5", palette.bg)}>
          <Icon className={cn("h-4 w-4", palette.icon)} />
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold", palette.text)}>{value}</p>
      </CardContent>
    </Card>
  );
}
