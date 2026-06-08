"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  UserRound,
  Users,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Link from "next/link";

type EmployeeStatus = "active" | "inactive" | "resigned";

interface EmployeeProfile {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  phone: string | null;
  address: string | null;
  job_title: string | null;
  department: string | null;
  level: string | null;
  report_to: string | null;
  status: EmployeeStatus;
  team_id: string | null;
  position_id: string | null;
  grade: string | null;
  employment_type: string | null;
  join_date: string | null;
}

interface Department {
  id: string;
  department_name: string;
}

interface Team {
  id: string;
  team_name: string;
  department_id: string;
}

interface Position {
  id: string;
  position_name: string;
  department_id: string;
  grade: string | null;
}

interface EmployeeDocument {
  id: string;
  employee_id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  verified: boolean | null;
}

interface EmployeeCertification {
  id: string;
  employee_id: string;
  certification_name: string;
  issuing_body: string | null;
  expiry_date: string | null;
  status: string | null;
}

interface EmployeeForm {
  employee_id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  gender: string;
  date_of_birth: string;
  nationality: string;
  phone: string;
  address: string;
  department: string;
  team_id: string;
  position_id: string;
  job_title: string;
  grade: string;
  level: string;
  employment_type: string;
  join_date: string;
  report_to: string;
  status: EmployeeStatus;
}

const STATUS_OPTIONS: EmployeeStatus[] = ["active", "inactive", "resigned"];
const EMPLOYMENT_TYPES = ["permanent", "contract", "temporary", "intern"];
const LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"];
const GENDERS = ["male", "female"];
const EXTENDED_PROFILE_FIELDS = ["date_of_birth", "nationality", "phone", "address"];

const PROFILE_SELECT_BASE =
  "id, employee_id, full_name, email, role, avatar_url, gender, job_title, department, level, report_to, status, team_id, position_id, grade, employment_type, join_date";
const PROFILE_SELECT_EXTENDED =
  "id, employee_id, full_name, email, role, avatar_url, gender, date_of_birth, nationality, phone, address, job_title, department, level, report_to, status, team_id, position_id, grade, employment_type, join_date";

const STATUS_CLASSES: Record<EmployeeStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  resigned: "border-slate-200 bg-slate-100 text-slate-600",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EM";
}

function labelize(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function isExpiringSoon(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry - today.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 60;
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today.getTime();
}

function buildForm(profile: EmployeeProfile): EmployeeForm {
  return {
    employee_id: profile.employee_id ?? "",
    full_name: profile.full_name,
    email: profile.email,
    avatar_url: profile.avatar_url ?? "",
    gender: profile.gender ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    nationality: profile.nationality ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    department: profile.department ?? "",
    team_id: profile.team_id ?? "",
    position_id: profile.position_id ?? "",
    job_title: profile.job_title ?? "",
    grade: profile.grade ?? "",
    level: profile.level ?? "",
    employment_type: profile.employment_type ?? "",
    join_date: profile.join_date ?? "",
    report_to: profile.report_to ?? "",
    status: profile.status,
  };
}

function isMissingExtendedProfileColumn(message: string | undefined) {
  if (!message) return false;
  return EXTENDED_PROFILE_FIELDS.some((field) => message.includes(field));
}

function normalizeProfile(row: Partial<EmployeeProfile>): EmployeeProfile {
  return {
    id: row.id ?? "",
    employee_id: row.employee_id ?? null,
    full_name: row.full_name ?? "",
    email: row.email ?? "",
    role: row.role ?? "viewer",
    avatar_url: row.avatar_url ?? null,
    gender: row.gender ?? null,
    date_of_birth: row.date_of_birth ?? null,
    nationality: row.nationality ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    job_title: row.job_title ?? null,
    department: row.department ?? null,
    level: row.level ?? null,
    report_to: row.report_to ?? null,
    status: row.status ?? "active",
    team_id: row.team_id ?? null,
    position_id: row.position_id ?? null,
    grade: row.grade ?? null,
    employment_type: row.employment_type ?? null,
    join_date: row.join_date ?? null,
  };
}

function countByEmployee<T extends { employee_id: string }>(rows: T[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.employee_id] = (acc[row.employee_id] ?? 0) + 1;
    return acc;
  }, {});
}

export default function EmployeesPage() {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [certifications, setCertifications] = useState<EmployeeCertification[]>([]);
  // Payroll profile status sets (employee_id strings)
  const [hasTaxProfile, setHasTaxProfile] = useState<Set<string>>(new Set());
  const [hasNSSFProfile, setHasNSSFProfile] = useState<Set<string>>(new Set());
  const [hasBankAccount, setHasBankAccount] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [profileExtensionsReady, setProfileExtensionsReady] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const [fullProfileRes, departmentRes, teamRes, positionRes, documentRes, certRes, taxRes, nssfRes, bankRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(PROFILE_SELECT_EXTENDED)
          .order("employee_id", { ascending: true, nullsFirst: false }),
        supabase.from("departments").select("id, department_name").order("department_name"),
        supabase.from("teams").select("id, team_name, department_id").order("team_name"),
        supabase.from("positions").select("id, position_name, department_id, grade").order("position_name"),
        supabase.from("employee_documents").select("id, employee_id, document_type, document_name, expiry_date, verified"),
        supabase.from("employee_certifications").select("id, employee_id, certification_name, issuing_body, expiry_date, status"),
        supabase.from("employee_tax_profiles").select("employee_id").order("effective_date", { ascending: false }),
        supabase.from("employee_nssf_profiles").select("employee_id").order("effective_date", { ascending: false }),
        supabase.from("employee_bank_accounts").select("employee_id").eq("is_primary", true),
      ]);

      if (cancelled) return;

      let profileData = fullProfileRes.data as Partial<EmployeeProfile>[] | null;
      let profileError = fullProfileRes.error;
      let hasExtendedProfileFields = true;
      if (isMissingExtendedProfileColumn(fullProfileRes.error?.message)) {
        hasExtendedProfileFields = false;
        const baseProfileRes = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_BASE)
          .order("employee_id", { ascending: true, nullsFirst: false });
        profileData = baseProfileRes.data as Partial<EmployeeProfile>[] | null;
        profileError = baseProfileRes.error;
      }

      if (cancelled) return;

      const firstError = profileError ?? departmentRes.error ?? teamRes.error ?? positionRes.error ?? documentRes.error ?? certRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setProfileExtensionsReady(hasExtendedProfileFields);
      setProfiles((profileData ?? []).map(normalizeProfile));
      setDepartments((departmentRes.data ?? []) as Department[]);
      setTeams((teamRes.data ?? []) as Team[]);
      setPositions((positionRes.data ?? []) as Position[]);
      setDocuments((documentRes.data ?? []) as EmployeeDocument[]);
      setCertifications((certRes.data ?? []) as EmployeeCertification[]);

      // Build payroll status sets (ignore errors — tables may not exist yet)
      setHasTaxProfile(new Set((taxRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setHasNSSFProfile(new Set((nssfRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setHasBankAccount(new Set((bankRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const positionMap = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const documentCounts = useMemo(() => countByEmployee(documents), [documents]);
  const certificationCounts = useMemo(() => countByEmployee(certifications), [certifications]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    departments.forEach((department) => names.add(department.department_name));
    profiles.forEach((profile) => {
      if (profile.department) names.add(profile.department);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [departments, profiles]);

  const managerOptions = useMemo(() => {
    const managerIds = new Set(profiles.map((profile) => profile.report_to).filter(Boolean) as string[]);
    return profiles.filter((profile) => managerIds.has(profile.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [profiles]);

  const selected = selectedId ? profileMap.get(selectedId) ?? null : null;
  const selectedDocuments = selected ? documents.filter((doc) => doc.employee_id === selected.id) : [];
  const selectedCertifications = selected ? certifications.filter((cert) => cert.employee_id === selected.id) : [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const team = profile.team_id ? teamMap.get(profile.team_id)?.team_name ?? "" : "";
      const position = profile.position_id ? positionMap.get(profile.position_id)?.position_name ?? "" : "";
      const manager = profile.report_to ? profileMap.get(profile.report_to)?.full_name ?? profile.report_to : "";
      const searchable = [
        profile.employee_id,
        profile.full_name,
        profile.email,
        profile.department,
        profile.job_title,
        team,
        position,
        manager,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (departmentFilter && profile.department !== departmentFilter) return false;
      if (statusFilter && profile.status !== statusFilter) return false;
      if (employmentFilter && profile.employment_type !== employmentFilter) return false;
      if (managerFilter && profile.report_to !== managerFilter) return false;
      return true;
    });
  }, [departmentFilter, employmentFilter, managerFilter, positionMap, profileMap, profiles, search, statusFilter, teamMap]);

  const stats = useMemo(() => {
    const active = profiles.filter((profile) => profile.status === "active").length;
    const inactive = profiles.filter((profile) => profile.status !== "active").length;
    const docsDue = documents.filter((doc) => isExpired(doc.expiry_date) || isExpiringSoon(doc.expiry_date)).length;
    const certsDue = certifications.filter((cert) => isExpired(cert.expiry_date) || isExpiringSoon(cert.expiry_date) || cert.status === "pending_renewal").length;
    return { total: profiles.length, active, inactive, docsDue, certsDue };
  }, [certifications, documents, profiles]);

  function openProfile(profile: EmployeeProfile) {
    setSelectedId(profile.id);
    setForm(buildForm(profile));
  }

  function closeProfile() {
    setSelectedId(null);
    setForm(null);
  }

  function updateForm<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveProfile() {
    if (!selected || !form) return;
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error("Full name and email are required.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      employee_id: form.employee_id.trim() || null,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      avatar_url: form.avatar_url.trim() || null,
      gender: form.gender || null,
      department: form.department || null,
      team_id: form.team_id || null,
      position_id: form.position_id || null,
      job_title: form.job_title.trim() || null,
      grade: form.grade.trim() || null,
      level: form.level || null,
      employment_type: form.employment_type || null,
      join_date: form.join_date || null,
      report_to: form.report_to || null,
      status: form.status,
    };
    const extendedPayload = profileExtensionsReady
      ? {
          date_of_birth: form.date_of_birth || null,
          nationality: form.nationality.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        }
      : {};

    const { error: updateError } = await supabase.from("profiles").update({ ...payload, ...extendedPayload }).eq("id", selected.id);

    if (updateError) {
      toast.error(updateError.message);
      setSaving(false);
      return;
    }

    const updated: EmployeeProfile = { ...selected, ...payload, ...extendedPayload };
    setProfiles((current) => current.map((profile) => (profile.id === selected.id ? updated : profile)));
    setForm(buildForm(updated));
    toast.success("Employee profile updated");
    setSaving(false);
  }

  const hasFilters = Boolean(search || departmentFilter || statusFilter || employmentFilter || managerFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Employee Master</h2>
          <p className="text-muted-foreground">Manage employee profiles, employment records, documents, and certifications</p>
        </div>
        <Button className="gap-2" asChild>
          <Link href="/dashboard/hr/employees/new">
            <Plus className="h-4 w-4" />
            New Employee
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard title="Total Employees" value={stats.total} icon={Users} />
        <SummaryCard title="Active" value={stats.active} icon={UserRound} tone="success" />
        <SummaryCard title="Inactive / Resigned" value={stats.inactive} icon={BriefcaseBusiness} tone="muted" />
        <SummaryCard title="Docs Due" value={stats.docsDue} icon={FileText} tone="warning" />
        <SummaryCard title="Certs Due" value={stats.certsDue} icon={Award} tone="warning" />
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle>Employee Directory</CardTitle>
          <CardDescription>Search, filter, and update existing staff records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!profileExtensionsReady && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Employee Master is running with the current profile schema. Apply migration
              {" "}
              <span className="font-mono">20260530000003_extend_profiles_employee_master.sql</span>
              {" "}
              to enable date of birth, nationality, phone, and address.
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_150px_170px_200px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, ID, email, manager..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <SelectBox value={departmentFilter} onChange={setDepartmentFilter} label="All departments">
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {labelize(department)}
                </option>
              ))}
            </SelectBox>
            <SelectBox value={statusFilter} onChange={setStatusFilter} label="All status">
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {labelize(status)}
                </option>
              ))}
            </SelectBox>
            <SelectBox value={employmentFilter} onChange={setEmploymentFilter} label="All employment">
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelize(type)}
                </option>
              ))}
            </SelectBox>
            <SelectBox value={managerFilter} onChange={setManagerFilter} label="All managers">
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.full_name}
                </option>
              ))}
            </SelectBox>
            {hasFilters && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setDepartmentFilter("");
                  setStatusFilter("");
                  setEmploymentFilter("");
                  setManagerFilter("");
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading employee records...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[1280px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Employee</th>
                      <th className="px-4 py-3 text-left font-medium">Department / Team</th>
                      <th className="px-4 py-3 text-left font-medium">Position</th>
                      <th className="px-4 py-3 text-left font-medium">Manager</th>
                      <th className="px-4 py-3 text-left font-medium">Employment</th>
                      <th className="px-4 py-3 text-center font-medium">Tax</th>
                      <th className="px-4 py-3 text-center font-medium">NSSF</th>
                      <th className="px-4 py-3 text-center font-medium">Bank</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                          No employees found.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((profile) => {
                        const teamName = profile.team_id ? teamMap.get(profile.team_id)?.team_name : null;
                        const positionName = profile.position_id ? positionMap.get(profile.position_id)?.position_name : null;
                        const managerName = profile.report_to ? profileMap.get(profile.report_to)?.full_name ?? profile.report_to : null;
                        const taxOk = hasTaxProfile.has(profile.id);
                        const nssfOk = hasNSSFProfile.has(profile.id);
                        const bankOk = hasBankAccount.has(profile.id);

                        return (
                          <tr
                            key={profile.id}
                            className="cursor-pointer transition-colors hover:bg-muted/50"
                            onClick={() => openProfile(profile)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name} />
                                  <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">{profile.full_name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {profile.employee_id ?? "-"} · {profile.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{labelize(profile.department)}</p>
                              <p className="text-xs text-muted-foreground">{teamName ?? "-"}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{positionName ?? profile.job_title ?? "-"}</p>
                              <p className="text-xs text-muted-foreground">{profile.grade || profile.level || "-"}</p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{managerName ?? "-"}</td>
                            <td className="px-4 py-3">
                              <p>{labelize(profile.employment_type)}</p>
                              <p className="text-xs text-muted-foreground">Joined {formatDate(profile.join_date)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {taxOk
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {nssfOk
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {bankOk
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn("capitalize", STATUS_CLASSES[profile.status])}>
                                {profile.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/dashboard/hr/employees/${profile.id}`}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Full Profile
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {profiles.length} employees
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {selected && form && (
        <EmployeeDrawer
          profile={selected}
          form={form}
          documents={selectedDocuments}
          certifications={selectedCertifications}
          profiles={profiles}
          teams={teams}
          positions={positions}
          saving={saving}
          profileExtensionsReady={profileExtensionsReady}
          onClose={closeProfile}
          onSave={saveProfile}
          onChange={updateForm}
        />
      )}
    </div>
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
  const toneClass = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SelectBox({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function EmployeeDrawer({
  profile,
  form,
  documents,
  certifications,
  profiles,
  teams,
  positions,
  saving,
  profileExtensionsReady,
  onClose,
  onSave,
  onChange,
}: {
  profile: EmployeeProfile;
  form: EmployeeForm;
  documents: EmployeeDocument[];
  certifications: EmployeeCertification[];
  profiles: EmployeeProfile[];
  teams: Team[];
  positions: Position[];
  saving: boolean;
  profileExtensionsReady: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => void;
}) {
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const selectedTeam = form.team_id ? teamMap.get(form.team_id) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close employee details" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={form.avatar_url || undefined} alt={form.full_name} />
                <AvatarFallback>{initials(form.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{form.full_name}</h3>
                <p className="truncate text-sm text-muted-foreground">
                  {form.employee_id || "-"} · {form.email}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 md:grid-cols-3">
            <InfoTile icon={BriefcaseBusiness} label="Department" value={labelize(form.department)} />
            <InfoTile icon={Users} label="Team" value={selectedTeam?.team_name ?? "-"} />
            <InfoTile icon={CalendarDays} label="Join Date" value={formatDate(form.join_date)} />
          </section>

          <section className="rounded-lg border border-border p-4">
            <SectionTitle title="Personal Information" description="Core identity and contact details" />
            {!profileExtensionsReady && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Date of birth, nationality, phone, and address are available after the Employee Master migration is applied.
              </div>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Employee ID">
                <Input value={form.employee_id} onChange={(event) => onChange("employee_id", event.target.value)} />
              </Field>
              <Field label="Full Name">
                <Input value={form.full_name} onChange={(event) => onChange("full_name", event.target.value)} />
              </Field>
              <Field label="Gender">
                <NativeSelect value={form.gender} onChange={(value) => onChange("gender", value)} placeholder="-">
                  {GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {labelize(gender)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={form.date_of_birth}
                  disabled={!profileExtensionsReady}
                  onChange={(event) => onChange("date_of_birth", event.target.value)}
                />
              </Field>
              <Field label="Nationality">
                <Input
                  value={form.nationality}
                  disabled={!profileExtensionsReady}
                  onChange={(event) => onChange("nationality", event.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  disabled={!profileExtensionsReady}
                  onChange={(event) => onChange("phone", event.target.value)}
                />
              </Field>
              <Field label="Company Email">
                <Input type="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} />
              </Field>
              <Field label="Photo URL">
                <Input value={form.avatar_url} onChange={(event) => onChange("avatar_url", event.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <Input
                    value={form.address}
                    disabled={!profileExtensionsReady}
                    onChange={(event) => onChange("address", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <SectionTitle title="Employment Information" description="Organization assignment and reporting details" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Department">
                <Input value={form.department} onChange={(event) => onChange("department", event.target.value)} />
              </Field>
              <Field label="Team">
                <NativeSelect value={form.team_id} onChange={(value) => onChange("team_id", value)} placeholder="-">
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.team_name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Position">
                <NativeSelect value={form.position_id} onChange={(value) => onChange("position_id", value)} placeholder="-">
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.position_name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Job Title">
                <Input value={form.job_title} onChange={(event) => onChange("job_title", event.target.value)} />
              </Field>
              <Field label="Grade">
                <Input value={form.grade} onChange={(event) => onChange("grade", event.target.value)} />
              </Field>
              <Field label="Level">
                <NativeSelect value={form.level} onChange={(value) => onChange("level", value)} placeholder="-">
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Employment Type">
                <NativeSelect value={form.employment_type} onChange={(value) => onChange("employment_type", value)} placeholder="-">
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {labelize(type)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Join Date">
                <Input type="date" value={form.join_date} onChange={(event) => onChange("join_date", event.target.value)} />
              </Field>
              <Field label="Direct Manager">
                <NativeSelect value={form.report_to} onChange={(value) => onChange("report_to", value)} placeholder="-">
                  {profiles
                    .filter((candidate) => candidate.id !== profile.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.full_name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(value) => onChange("status", value as EmployeeStatus)}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <RecordPanel
              title="Employee Documents"
              description="Contracts, IDs, permits, licenses, and files"
              emptyText="No documents recorded."
              rows={documents.map((doc) => ({
                id: doc.id,
                name: doc.document_name,
                meta: labelize(doc.document_type),
                expiry: doc.expiry_date,
                badge: doc.verified ? "Verified" : "Unverified",
              }))}
            />
            <RecordPanel
              title="Certifications"
              description="Licenses, certificates, and renewal records"
              emptyText="No certifications recorded."
              rows={certifications.map((cert) => ({
                id: cert.id,
                name: cert.certification_name,
                meta: cert.issuing_body ?? "Certification",
                expiry: cert.expiry_date,
                badge: labelize(cert.status),
              }))}
            />
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </aside>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}

function RecordPanel({
  title,
  description,
  rows,
  emptyText,
}: {
  title: string;
  description: string;
  rows: { id: string; name: string; meta: string; expiry: string | null; badge: string }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <SectionTitle title={title} description={description} />
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.meta}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0",
                    isExpired(row.expiry) && "border-red-200 bg-red-50 text-red-700",
                    !isExpired(row.expiry) && isExpiringSoon(row.expiry) && "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {row.badge}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Expiry: {formatDate(row.expiry)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
