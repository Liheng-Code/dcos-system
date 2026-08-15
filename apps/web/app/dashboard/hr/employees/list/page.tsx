"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Search,
  Users,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { FillMissingDialog } from "@/components/hr/employees/fill-missing-dialog";
import { EmployeesTabs } from "@/components/hr/employees/employees-tabs";
import {
  type EmployeeProfile,
  type Department,
  type Team,
  type Position,
  type EmployeeDocument,
  type EmployeeCertification,
  type EmployeeStatus,
  STATUS_OPTIONS,
  EMPLOYMENT_TYPES,
  PROBATION_STATUSES,
  PROFILE_SELECT_EXTENDED,
  PROFILE_SELECT_BASE,
  STATUS_CLASSES,
  PROBATION_BADGE,
  isMissingExtendedProfileColumn,
  normalizeProfile,
  initials,
  labelize,
  formatDate,
} from "@/lib/hr/employee-master";

export default function EmployeesListPage() {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [certifications, setCertifications] = useState<EmployeeCertification[]>([]);
  const [hasPayrollProfile, setHasPayrollProfile] = useState<Set<string>>(new Set());
  const [hasTaxProfile, setHasTaxProfile] = useState<Set<string>>(new Set());
  const [hasNSSFProfile, setHasNSSFProfile] = useState<Set<string>>(new Set());
  const [hasBankAccount, setHasBankAccount] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [probationFilter, setProbationFilter] = useState("");
  const [profileExtensionsReady, setProfileExtensionsReady] = useState(true);
  const [fillDialogOpen, setFillDialogOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEmploymentType, setBulkEmploymentType] = useState("");
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const [fullProfileRes, departmentRes, teamRes, positionRes, documentRes, certRes, payrollRes, taxRes, nssfRes, bankRes] = await Promise.all([
        supabase.from("profiles").select(PROFILE_SELECT_EXTENDED).order("employee_id", { ascending: true, nullsFirst: false }),
        supabase.from("departments").select("id, department_name").order("department_name"),
        supabase.from("teams").select("id, team_name, department_id").order("team_name"),
        supabase.from("positions").select("id, position_name, department_id, grade").order("position_name"),
        supabase.from("employee_documents").select("id, employee_id, document_type, document_name, expiry_date, verified"),
        supabase.from("employee_certifications").select("id, employee_id, certification_name, issuing_body, expiry_date, status"),
        supabase.from("employee_payroll_profiles").select("employee_id"),
        supabase.from("employee_tax_profiles").select("employee_id").order("effective_date", { ascending: false }),
        supabase.from("employee_nssf_profiles").select("employee_id").order("effective_date", { ascending: false }),
        supabase.from("employee_bank_accounts").select("employee_id").eq("is_primary", true),
      ]);

      if (cancelled) return;

      let profileData = fullProfileRes.data as Partial<EmployeeProfile>[] | null;
      let profileError = fullProfileRes.error;
      if (isMissingExtendedProfileColumn(fullProfileRes.error?.message)) {
        const baseProfileRes = await supabase.from("profiles").select(PROFILE_SELECT_BASE).order("employee_id", { ascending: true, nullsFirst: false });
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

      setProfileExtensionsReady(profileError === null);
      setProfiles((profileData ?? []).map(normalizeProfile));
      setDepartments((departmentRes.data ?? []) as Department[]);
      setTeams((teamRes.data ?? []) as Team[]);
      setPositions((positionRes.data ?? []) as Position[]);
      setDocuments((documentRes.data ?? []) as EmployeeDocument[]);
      setCertifications((certRes.data ?? []) as EmployeeCertification[]);

      setHasPayrollProfile(new Set((payrollRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setHasTaxProfile(new Set((taxRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setHasNSSFProfile(new Set((nssfRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setHasBankAccount(new Set((bankRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const positionMap = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    departments.forEach((d) => names.add(d.department_name));
    profiles.forEach((p) => { if (p.department) names.add(p.department); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [departments, profiles]);

  const managerOptions = useMemo(() => {
    const managerIds = new Set(profiles.map((p) => p.report_to).filter(Boolean) as string[]);
    return profiles.filter((p) => managerIds.has(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [profiles]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const team = profile.team_id ? teamMap.get(profile.team_id)?.team_name ?? "" : "";
      const position = profile.position_id ? positionMap.get(profile.position_id)?.position_name ?? "" : "";
      const manager = profile.report_to ? profileMap.get(profile.report_to)?.full_name ?? profile.report_to : "";
      const searchable = [profile.employee_id, profile.full_name, profile.email, profile.department, profile.job_title, team, position, manager]
        .filter(Boolean).join(" ").toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (departmentFilter && profile.department !== departmentFilter) return false;
      if (statusFilter && profile.status !== statusFilter) return false;
      if (employmentFilter && profile.employment_type !== employmentFilter) return false;
      if (managerFilter && profile.report_to !== managerFilter) return false;
      if (probationFilter && profile.probation_status !== probationFilter) return false;
      return true;
    });
  }, [departmentFilter, employmentFilter, managerFilter, probationFilter, positionMap, profileMap, profiles, search, statusFilter, teamMap]);

  const hasFilters = Boolean(search || departmentFilter || statusFilter || employmentFilter || managerFilter || probationFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <EmployeesTabs />
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setFillDialogOpen(true)}>
            <WandSparkles className="h-4 w-4" />
            Fill Missing
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
        <p className="text-muted-foreground">Search, filter, and update existing staff records</p>
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
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_150px_170px_170px_200px_auto]">
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
                <option key={department} value={department}>{labelize(department)}</option>
              ))}
            </SelectBox>
            <SelectBox value={statusFilter} onChange={setStatusFilter} label="All status">
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{labelize(status)}</option>
              ))}
            </SelectBox>
            <SelectBox value={employmentFilter} onChange={setEmploymentFilter} label="All employment">
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </SelectBox>
            <SelectBox value={probationFilter} onChange={setProbationFilter} label="All probation">
              {PROBATION_STATUSES.map((s) => (
                <option key={s} value={s}>{labelize(s)}</option>
              ))}
            </SelectBox>
            <SelectBox value={managerFilter} onChange={setManagerFilter} label="All managers">
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.full_name}</option>
              ))}
            </SelectBox>
            {hasFilters && (
              <Button variant="outline" onClick={() => { setSearch(""); setDepartmentFilter(""); setStatusFilter(""); setEmploymentFilter(""); setManagerFilter(""); setProbationFilter(""); }}>
                Clear
              </Button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{selectedIds.size}</strong> employee{selectedIds.size !== 1 ? 's' : ''} selected
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
                <select
                  value={bulkEmploymentType}
                  onChange={(e) => setBulkEmploymentType(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                >
                  <option value="">Change employment type...</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{labelize(t)}</option>
                  ))}
                </select>
                <Button size="sm" disabled={!bulkEmploymentType} onClick={() => setShowBulkConfirm(true)}>
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  Apply
                </Button>
              </div>
            </div>
          )}

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
                      <th className="w-10 px-2 py-3 text-center">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(new Set(filtered.map((p) => p.id)));
                            else setSelectedIds(new Set());
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium">Employee</th>
                      <th className="px-4 py-3 text-left font-medium">Department / Team</th>
                      <th className="px-4 py-3 text-left font-medium">Position</th>
                      <th className="px-4 py-3 text-left font-medium">Manager</th>
                      <th className="px-4 py-3 text-left font-medium">Employment</th>
                      <th className="px-4 py-3 text-left font-medium">Probation</th>
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
                        <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">No employees found.</td>
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
                          <tr key={profile.id} className="transition-colors hover:bg-muted/50">
                            <td className="w-10 px-2 py-3 text-center">
                              <Checkbox
                                checked={selectedIds.has(profile.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(profile.id);
                                    else next.delete(profile.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
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
                            <td className="px-4 py-3">
                              {profile.probation_status && profile.probation_status !== "not_applicable" ? (
                                <div>
                                  <Badge variant="outline" className={cn("capitalize", PROBATION_BADGE[profile.probation_status] ?? "")}>
                                    {labelize(profile.probation_status)}
                                  </Badge>
                                  {profile.probation_end_date && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">until {formatDate(profile.probation_end_date)}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {taxOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {nssfOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {bankOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn("capitalize", STATUS_CLASSES[profile.status])}>
                                {profile.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="default" size="sm" className="gap-1.5 text-xs" asChild>
                                <Link href={`/dashboard/hr/employees/${profile.id}`}>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Full Profile
                                </Link>
                              </Button>
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

      <FillMissingDialog
        open={fillDialogOpen}
        onOpenChange={setFillDialogOpen}
        profiles={profiles}
        filteredIds={filtered.length < profiles.length ? filtered.map((p) => p.id) : undefined}
        statusSets={{ hasPayrollProfile, hasTaxProfile, hasNSSFProfile, hasBankAccount }}
        onComplete={() => {
          const supabase = createClient();
          Promise.all([
            supabase.from("profiles").select(PROFILE_SELECT_EXTENDED).order("employee_id", { ascending: true, nullsFirst: false }),
            supabase.from("employee_payroll_profiles").select("employee_id"),
            supabase.from("employee_tax_profiles").select("employee_id").order("effective_date", { ascending: false }),
            supabase.from("employee_nssf_profiles").select("employee_id").order("effective_date", { ascending: false }),
            supabase.from("employee_bank_accounts").select("employee_id").eq("is_primary", true),
          ]).then(([profileRes, payrollRes, taxRes, nssfRes, bankRes]) => {
            if (!profileRes.error && profileRes.data) {
              setProfiles((profileRes.data as Partial<EmployeeProfile>[]).map(normalizeProfile));
            }
            setHasPayrollProfile(new Set((payrollRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
            setHasTaxProfile(new Set((taxRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
            setHasNSSFProfile(new Set((nssfRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
            setHasBankAccount(new Set((bankRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)));
          });
        }}
      />

      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkConfirm(false)}>
          <div className="bg-background rounded-xl shadow-xl w-96 max-w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Bulk Update Employment Type</h3>
              <button type="button" onClick={() => setShowBulkConfirm(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Change employment type of <strong>{selectedIds.size}</strong> selected employee{selectedIds.size !== 1 ? 's' : ''} to <strong>{labelize(bulkEmploymentType)}</strong>.
              </p>
              <div className="rounded-lg bg-muted/50 px-3 py-2 max-h-32 overflow-y-auto text-xs">
                {filtered.filter((p) => selectedIds.has(p.id)).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-0.5">
                    <span>{p.full_name}</span>
                    <span className="text-muted-foreground">{labelize(p.employment_type)} → <strong className="text-foreground">{labelize(bulkEmploymentType)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowBulkConfirm(false)}>Cancel</Button>
              <Button
                type="button"
                size="sm"
                disabled={bulkUpdating}
                onClick={async () => {
                  setBulkUpdating(true);
                  const supabase = createClient();
                  const ids = filtered.filter((p) => selectedIds.has(p.id)).map((p) => p.id);
                  const { error } = await supabase.from("profiles").update({ employment_type: bulkEmploymentType }).in("id", ids);
                  setBulkUpdating(false);
                  if (error) {
                    toast.error(error.message);
                  } else {
                    toast.success(`Updated ${ids.length} employee${ids.length !== 1 ? 's' : ''} to ${labelize(bulkEmploymentType)}`);
                    setProfiles((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, employment_type: bulkEmploymentType } : p));
                    setSelectedIds(new Set());
                    setBulkEmploymentType("");
                    setShowBulkConfirm(false);
                  }
                }}
                className="gap-1.5"
              >
                {bulkUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                Confirm Update
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
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
