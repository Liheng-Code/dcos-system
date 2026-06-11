"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STANDARD_POSITION_GROUPS } from "@/lib/hr/standard-positions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  User,
  Briefcase,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function labelize(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NewEmployeePage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allEmployees, setAllEmployees] = useState<{ id: string; full_name: string }[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    gender: "",

    date_of_birth: "",
    nationality: "",
    phone: "",
    current_address: "",
    department: "",
    job_title: "",
    report_to: "",
    employment_type: "",
    work_location: "",
    join_date: "",
    status: "draft",
    probation_status: "not_applicable",
    probation_end_date: "",
  });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")
      .then(({ data }) => {
        setAllEmployees((data ?? []) as { id: string; full_name: string }[]);
        setLoading(false);
      });
  }, []);

  function generatePassword() {
    const pw = crypto.randomUUID().slice(0, 12) + "Ab1!";
    setForm((f) => ({ ...f, password: pw }));
  }

  useEffect(() => {
    const timer = window.setTimeout(generatePassword, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validatePassword(pw: string): string | null {
    if (pw.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
    if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter";
    if (!/[0-9]/.test(pw)) return "Password must contain a number";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain a special character";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error("Full name is required"); return; }
    if (!form.email.trim()) { toast.error("Email is required"); return; }
    if (!form.department.trim()) { toast.error("Department is required (SOP §8)"); return; }
    if (!form.job_title.trim()) { toast.error("Job title / position is required (SOP §8)"); return; }
    if (!form.employment_type) { toast.error("Employment type is required"); return; }
    const pwError = validatePassword(form.password);
    if (pwError) { toast.error(pwError); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password || undefined,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          nationality: form.nationality.trim() || null,
          phone: form.phone.trim() || null,
          current_address: form.current_address.trim() || null,
          department: form.department.trim() || null,
          job_title: form.job_title.trim() || null,
          report_to: form.report_to || null,
          employment_type: form.employment_type || null,
          work_location: form.work_location || null,
          join_date: form.join_date || null,
          probation_status: form.probation_status || null,
          probation_end_date: form.probation_end_date || null,
          status: form.status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create employee");
        setSaving(false);
        return;
      }

      toast.success("Employee created successfully");
      router.push(`/dashboard/hr/employees/${data.id}`);
    } catch {
      toast.error("Network error — please try again");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/dashboard/hr/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">New Employee</h2>
            <p className="text-sm text-muted-foreground">Create an employee account and profile</p>
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Employee
          </Button>
        </div>
      </div>

      {/* Account Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-muted-foreground" />
            Account Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Full Name *">
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="e.g. Chan Dara"
              required
            />
          </Field>
          <Field label="Email Address *">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="e.g. chan.dara@company.com"
              required
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Auto-generated"
                className="pr-18"
              />
              <div className="absolute right-1 top-1 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground"
                  title="Generate new password"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="flex gap-1">
                {[
                  /[A-Z]/.test(form.password),
                  /[a-z]/.test(form.password),
                  /[0-9]/.test(form.password),
                  /[^A-Za-z0-9]/.test(form.password),
                  form.password.length >= 8,
                ].map((ok, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${ok ? "bg-emerald-400" : "bg-muted"}`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Requires: 8+ chars, uppercase, lowercase, number, special character
              </p>
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-muted-foreground" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Gender">
            <NativeSelect value={form.gender} onChange={(v) => set("gender", v)} placeholder="—">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </NativeSelect>
          </Field>
          <Field label="Date of Birth">
            <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Nationality">
            <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Cambodian" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. +855 12 345 678" />
          </Field>
          <div className="md:col-span-2">
          <Field label="Current Address">
            <Input value={form.current_address} onChange={(e) => set("current_address", e.target.value)} placeholder="e.g. #123, Street 456, Phnom Penh" />
          </Field>
          </div>
        </CardContent>
      </Card>

      {/* Employment Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Employment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Department *">
            <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Engineering" required />
          </Field>
          <Field label="Job Title / Position *">
            <NativeSelect value={form.job_title} onChange={(v) => set("job_title", v)} placeholder="Select position">
              {STANDARD_POSITION_GROUPS.map(({ group, positions }) => (
                <optgroup key={group} label={group}>
                  {positions.map((position) => (
                    <option key={position.code} value={position.name}>
                      {position.code} - {position.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Line Manager">
            <NativeSelect value={form.report_to} onChange={(v) => set("report_to", v)} placeholder="—">
              {allEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Employment Type *">
            <NativeSelect value={form.employment_type} onChange={(v) => set("employment_type", v)} placeholder="—">
              {["permanent", "contract", "temporary", "intern"].map((t) => (
                <option key={t} value={t}>{labelize(t)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Work Location">
            <NativeSelect value={form.work_location} onChange={(v) => set("work_location", v)} placeholder="—">
              {["office", "site", "hybrid"].map((l) => <option key={l} value={l}>{labelize(l)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Join Date">
            <Input type="date" value={form.join_date} onChange={(e) => set("join_date", e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Employee ID will be auto-generated after saving</p>
          </Field>
          <Field label="Probation Status">
            <NativeSelect value={form.probation_status} onChange={(v) => set("probation_status", v)}>
              {["not_applicable", "active", "completed", "extended", "failed"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Probation End Date">
            <Input type="date" value={form.probation_end_date} onChange={(e) => set("probation_end_date", e.target.value)} />
          </Field>
          <Field label="Status">
            <NativeSelect value={form.status} onChange={(v) => set("status", v)}>
              {["draft", "pending_approval", "active", "inactive"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button variant="outline" asChild>
          <Link href="/dashboard/hr/employees">Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Employee
        </Button>
      </div>
    </form>
  );
}
