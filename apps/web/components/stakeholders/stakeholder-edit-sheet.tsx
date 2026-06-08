"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, Save, Trash2, Pencil, Plus, Check, XCircle,
  Users, Building2, CreditCard, ShieldCheck, UsersRound, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Stakeholder {
  id: string;
  organization_name: string;
  stakeholder_type: string;
  category: string;
  short_name: string | null;
  company_code: string | null;
  registration_number: string | null;
  tax_number: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  credit_terms: string | null;
  payment_terms: string | null;
  currency: string | null;
  contract_capacity: string | null;
  business_categories: string[] | null;
  business_license_number: string | null;
  business_license_expiry: string | null;
  insurance_cert_number: string | null;
  insurance_expiry: string | null;
  trade_license_number: string | null;
  trade_license_expiry: string | null;
  status: string;
  approval_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StakeholderStaff {
  id: string;
  stakeholder_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  profile_id: string | null;
  team_id: string | null;
  status: string;
  notes: string | null;
}

export interface StakeholderTeam {
  id: string;
  stakeholder_id: string;
  team_code: string | null;
  team_name: string;
  department: string | null;
  description: string | null;
}

interface HRProfile {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  department: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTERNAL_TYPES = [
  { code: "CLI", label: "Client / Owner" },
  { code: "CON", label: "Consultant" },
  { code: "MC",  label: "Main Contractor" },
  { code: "SUB", label: "Subcontractor" },
  { code: "SUP", label: "Supplier" },
  { code: "AUT", label: "Authority" },
  { code: "TST", label: "Testing Agency" },
  { code: "FM",  label: "Facility Management" },
];

const INTERNAL_TYPES = [{ code: "INT", label: "Internal Department" }];

const STATUSES = ["active", "inactive", "blacklisted", "preferred"];
const APPROVAL_STATUSES = ["draft", "pending_review", "approved", "rejected"];
const CURRENCIES = ["USD", "KHR", "EUR", "SGD", "THB", "CNY", "AUD"];

type Tab = "info" | "commercial" | "compliance" | "teams" | "members";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expiryClass(dateStr: string | null) {
  if (!dateStr) return "text-muted-foreground";
  const diff = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff <= 90) return "text-amber-600 font-semibold";
  return "text-emerald-600";
}

function expiryLabel(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return "Expired";
  if (diff <= 90) return `Expires in ${Math.ceil(diff)}d`;
  return "Valid";
}

function FieldInput({
  label, value, onChange, type = "text", placeholder, readOnly,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary read-only:bg-muted/30 read-only:text-muted-foreground"
      />
    </div>
  );
}

function FieldSelect({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      >
        {children}
      </select>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 mt-1">
      {children}
    </p>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  stakeholder: Stakeholder | null;
  defaultCategory?: "external" | "internal";
  onClose: () => void;
  onSave: (stakeholder: Stakeholder) => void;
  onDelete?: (stakeholder: Stakeholder) => void;
  isAdmin?: boolean;
  onStaffChange?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StakeholderEditSheet({
  stakeholder, defaultCategory = "external", onClose, onSave, onDelete, isAdmin, onStaffChange,
}: Props) {
  const isEditing = !!stakeholder;

  // ── Form state
  const [form, setForm] = useState({
    organization_name: stakeholder?.organization_name ?? "",
    short_name: stakeholder?.short_name ?? "",
    company_code: stakeholder?.company_code ?? "",
    stakeholder_type: stakeholder?.stakeholder_type ?? (defaultCategory === "internal" ? "INT" : "CLI"),
    category: stakeholder?.category ?? defaultCategory,
    registration_number: stakeholder?.registration_number ?? "",
    tax_number: stakeholder?.tax_number ?? "",
    website: stakeholder?.website ?? "",
    email: stakeholder?.email ?? "",
    phone: stakeholder?.phone ?? "",
    address: stakeholder?.address ?? "",
    country: stakeholder?.country ?? "",
    province: stakeholder?.province ?? "",
    city: stakeholder?.city ?? "",
    credit_terms: stakeholder?.credit_terms ?? "",
    payment_terms: stakeholder?.payment_terms ?? "",
    currency: stakeholder?.currency ?? "USD",
    contract_capacity: stakeholder?.contract_capacity ?? "",
    business_license_number: stakeholder?.business_license_number ?? "",
    business_license_expiry: stakeholder?.business_license_expiry ?? "",
    insurance_cert_number: stakeholder?.insurance_cert_number ?? "",
    insurance_expiry: stakeholder?.insurance_expiry ?? "",
    trade_license_number: stakeholder?.trade_license_number ?? "",
    trade_license_expiry: stakeholder?.trade_license_expiry ?? "",
    status: stakeholder?.status ?? "active",
    approval_status: stakeholder?.approval_status ?? "approved",
    notes: stakeholder?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("info");

  // ── Staff state
  const [staffList, setStaffList] = useState<StakeholderStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({
    full_name: "", job_title: "", email: "", phone: "",
    is_primary_contact: false, profile_id: "" as string, team_id: "" as string,
  });
  const [savingStaff, setSavingStaff] = useState(false);

  // ── Teams state
  const [teams, setTeams] = useState<StakeholderTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ team_name: "", team_code: "", department: "", description: "" });
  const [savingTeam, setSavingTeam] = useState(false);

  // ── HR profiles (for internal member picker)
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);

  const isInternal = form.category === "internal";
  const typeOptions = isInternal ? INTERNAL_TYPES : EXTERNAL_TYPES;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "info", label: "Info", icon: Building2 },
    ...(!isInternal ? [
      { id: "commercial" as Tab, label: "Commercial", icon: CreditCard },
      { id: "compliance" as Tab, label: "Compliance", icon: ShieldCheck },
    ] : []),
    { id: "teams", label: "Teams", icon: UsersRound },
    { id: "members", label: "Members", icon: Users },
  ];

  // ── Load staff + teams when editing
  useEffect(() => {
    if (!stakeholder) return;
    setStaffLoading(true);
    setTeamsLoading(true);
    const supabase = createClient();
    supabase.from("stakeholder_staff").select("*")
      .eq("stakeholder_id", stakeholder.id)
      .order("is_primary_contact", { ascending: false })
      .order("full_name")
      .then(({ data }) => { if (data) setStaffList(data as StakeholderStaff[]); setStaffLoading(false); });
    supabase.from("stakeholder_teams").select("*")
      .eq("stakeholder_id", stakeholder.id)
      .order("team_name")
      .then(({ data }) => { if (data) setTeams(data as StakeholderTeam[]); setTeamsLoading(false); });
  }, [stakeholder?.id]);

  // ── Load HR profiles for internal member picker
  useEffect(() => {
    if (!isInternal) return;
    createClient().from("profiles").select("id, full_name, job_title, email, department")
      .order("full_name")
      .then(({ data }) => { if (data) setHRProfiles(data as HRProfile[]); });
  }, [isInternal]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── Save stakeholder
  async function handleSave() {
    if (!form.organization_name.trim()) { toast.error("Organization name is required"); return; }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      organization_name: form.organization_name.trim(),
      short_name: form.short_name.trim() || null,
      company_code: form.company_code.trim() || null,
      stakeholder_type: form.stakeholder_type,
      category: form.category,
      registration_number: form.registration_number.trim() || null,
      tax_number: form.tax_number.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      country: form.country.trim() || null,
      province: form.province.trim() || null,
      city: form.city.trim() || null,
      credit_terms: isInternal ? null : (form.credit_terms.trim() || null),
      payment_terms: isInternal ? null : (form.payment_terms.trim() || null),
      currency: isInternal ? null : (form.currency || null),
      contract_capacity: isInternal ? null : (form.contract_capacity.trim() || null),
      business_license_number: isInternal ? null : (form.business_license_number.trim() || null),
      business_license_expiry: isInternal ? null : (form.business_license_expiry || null),
      insurance_cert_number: isInternal ? null : (form.insurance_cert_number.trim() || null),
      insurance_expiry: isInternal ? null : (form.insurance_expiry || null),
      trade_license_number: isInternal ? null : (form.trade_license_number.trim() || null),
      trade_license_expiry: isInternal ? null : (form.trade_license_expiry || null),
      status: form.status,
      approval_status: form.approval_status,
      notes: form.notes.trim() || null,
    };

    if (isEditing) {
      const { error } = await supabase.from("stakeholders").update(payload).eq("id", stakeholder.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Stakeholder updated");
      onSave({ ...stakeholder, ...payload } as Stakeholder);
    } else {
      const { data, error } = await supabase.from("stakeholders").insert(payload).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Stakeholder created");
      onSave(data as Stakeholder);
    }
    setSaving(false);
  }

  // ── Staff CRUD
  function openAddStaff() {
    setStaffForm({ full_name: "", job_title: "", email: "", phone: "", is_primary_contact: false, profile_id: "", team_id: "" });
    setEditingStaffId(null);
    setShowStaffForm(true);
  }

  function openEditStaff(s: StakeholderStaff) {
    setStaffForm({
      full_name: s.full_name, job_title: s.job_title ?? "", email: s.email ?? "",
      phone: s.phone ?? "", is_primary_contact: s.is_primary_contact,
      profile_id: s.profile_id ?? "", team_id: s.team_id ?? "",
    });
    setEditingStaffId(s.id);
    setShowStaffForm(true);
  }

  function onPickProfile(profileId: string) {
    const p = hrProfiles.find((p) => p.id === profileId);
    if (!p) { setStaffForm((f) => ({ ...f, profile_id: profileId })); return; }
    setStaffForm((f) => ({
      ...f,
      profile_id: profileId,
      full_name: p.full_name,
      job_title: p.job_title ?? f.job_title,
      email: p.email ?? f.email,
    }));
  }

  async function saveStaff() {
    if (!staffForm.full_name.trim()) return;
    setSavingStaff(true);
    const supabase = createClient();
    const payload = {
      full_name: staffForm.full_name.trim(),
      job_title: staffForm.job_title.trim() || null,
      email: staffForm.email.trim() || null,
      phone: staffForm.phone.trim() || null,
      is_primary_contact: staffForm.is_primary_contact,
      profile_id: staffForm.profile_id || null,
      team_id: staffForm.team_id || null,
    };

    if (staffForm.is_primary_contact) {
      await supabase.from("stakeholder_staff")
        .update({ is_primary_contact: false })
        .eq("stakeholder_id", stakeholder!.id)
        .neq("id", editingStaffId ?? "");
    }

    const { error } = editingStaffId
      ? await supabase.from("stakeholder_staff").update(payload).eq("id", editingStaffId)
      : await supabase.from("stakeholder_staff").insert({ ...payload, stakeholder_id: stakeholder!.id });

    if (error) { toast.error(error.message); setSavingStaff(false); return; }

    const { data } = await supabase.from("stakeholder_staff").select("*")
      .eq("stakeholder_id", stakeholder!.id)
      .order("is_primary_contact", { ascending: false }).order("full_name");
    if (data) setStaffList(data as StakeholderStaff[]);
    setSavingStaff(false);
    setShowStaffForm(false);
    setEditingStaffId(null);
    onStaffChange?.();
  }

  async function removeStaff(id: string) {
    const { error } = await createClient().from("stakeholder_staff").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setStaffList((prev) => prev.filter((s) => s.id !== id));
    onStaffChange?.();
  }

  // ── Teams CRUD
  function openAddTeam() {
    setTeamForm({ team_name: "", team_code: "", department: "", description: "" });
    setEditingTeamId(null);
    setShowTeamForm(true);
  }

  function openEditTeam(t: StakeholderTeam) {
    setTeamForm({
      team_name: t.team_name, team_code: t.team_code ?? "",
      department: t.department ?? "", description: t.description ?? "",
    });
    setEditingTeamId(t.id);
    setShowTeamForm(true);
  }

  async function saveTeam() {
    if (!teamForm.team_name.trim()) return;
    setSavingTeam(true);
    const supabase = createClient();
    const payload = {
      team_name: teamForm.team_name.trim(),
      team_code: teamForm.team_code.trim() || null,
      department: teamForm.department.trim() || null,
      description: teamForm.description.trim() || null,
    };

    const { error } = editingTeamId
      ? await supabase.from("stakeholder_teams").update(payload).eq("id", editingTeamId)
      : await supabase.from("stakeholder_teams").insert({ ...payload, stakeholder_id: stakeholder!.id });

    if (error) { toast.error(error.message); setSavingTeam(false); return; }

    const { data } = await supabase.from("stakeholder_teams").select("*")
      .eq("stakeholder_id", stakeholder!.id).order("team_name");
    if (data) setTeams(data as StakeholderTeam[]);
    setSavingTeam(false);
    setShowTeamForm(false);
    setEditingTeamId(null);
  }

  async function removeTeam(id: string) {
    const { error } = await createClient().from("stakeholder_teams").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTeams((prev) => prev.filter((t) => t.id !== id));
  }

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate">
              {isEditing ? form.organization_name : (isInternal ? "New Internal Department" : "New External Stakeholder")}
            </h2>
            <span className={cn(
              "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              form.category === "internal"
                ? "bg-indigo-500/10 text-indigo-700"
                : "bg-emerald-500/10 text-emerald-700",
            )}>
              {form.category === "internal" ? "Internal" : "External"}
            </span>
          </div>
          {isEditing && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {form.stakeholder_type} · {form.status}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Category selector (create only) */}
      {!isEditing && (
        <div className="px-5 pt-4 shrink-0">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Stakeholder Category *</Label>
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["external", "internal"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  update("category", cat);
                  update("stakeholder_type", cat === "internal" ? "INT" : "CLI");
                }}
                className={cn(
                  "flex-1 py-2 font-medium capitalize transition-colors",
                  form.category === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {cat === "external" ? "External Company" : "Internal Department"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {form.category === "external"
              ? "Third-party companies: clients, consultants, contractors, suppliers, authorities."
              : "Own company departments linked to HR employees."}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0 px-4 mt-3 gap-0.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5">

        {/* ── Info tab ── */}
        {activeTab === "info" && (
          <div className="space-y-5">
            <div>
              <SectionTitle>General Information</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldInput
                    label="Organization Name *"
                    value={form.organization_name}
                    onChange={(v) => update("organization_name", v)}
                    placeholder={isInternal ? "e.g. Engineering Department" : "e.g. CMED Construction Co."}
                  />
                </div>
                <FieldInput
                  label="Short Name"
                  value={form.short_name}
                  onChange={(v) => update("short_name", v)}
                  placeholder="e.g. CMED"
                />
                <FieldInput
                  label="Company Code"
                  value={form.company_code}
                  onChange={(v) => update("company_code", v.toUpperCase())}
                  placeholder="e.g. MC-001"
                />
                <FieldSelect label="Type *" value={form.stakeholder_type} onChange={(v) => update("stakeholder_type", v)}>
                  {typeOptions.map((t) => (
                    <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                  ))}
                </FieldSelect>
                {!isInternal && (
                  <FieldInput
                    label="Registration Number"
                    value={form.registration_number}
                    onChange={(v) => update("registration_number", v)}
                    placeholder="Company reg no."
                  />
                )}
                {!isInternal && (
                  <FieldInput
                    label="Tax / VAT Number"
                    value={form.tax_number}
                    onChange={(v) => update("tax_number", v)}
                    placeholder="Tax ID"
                  />
                )}
                {!isInternal && (
                  <FieldInput
                    label="Website"
                    value={form.website}
                    onChange={(v) => update("website", v)}
                    placeholder="https://example.com"
                  />
                )}
              </div>
            </div>

            <div>
              <SectionTitle>Contact Information</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" placeholder="info@company.com" />
                <FieldInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} placeholder="+855 23 000 000" />
                <FieldInput label="Country" value={form.country} onChange={(v) => update("country", v)} placeholder="Cambodia" />
                <FieldInput label="Province / State" value={form.province} onChange={(v) => update("province", v)} placeholder="Phnom Penh" />
                <FieldInput label="City" value={form.city} onChange={(v) => update("city", v)} placeholder="Phnom Penh" />
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <textarea
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    rows={2}
                    placeholder="#123, Street 456, Phnom Penh"
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Record Status</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <FieldSelect label="Status" value={form.status} onChange={(v) => update("status", v)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </FieldSelect>
                <FieldSelect label="Approval Status" value={form.approval_status} onChange={(v) => update("approval_status", v)}>
                  {APPROVAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </FieldSelect>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Save / Delete */}
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <div>
                {isEditing && isAdmin && onDelete && (
                  <Button variant="outline" size="sm" onClick={() => onDelete(stakeholder!)}
                    className="text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !form.organization_name.trim()}>
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {isEditing ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Commercial tab (external only) ── */}
        {activeTab === "commercial" && !isInternal && (
          <div className="space-y-5">
            <div>
              <SectionTitle>Commercial Terms</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Credit Terms" value={form.credit_terms} onChange={(v) => update("credit_terms", v)} placeholder="e.g. Net 30 days" />
                <FieldInput label="Payment Terms" value={form.payment_terms} onChange={(v) => update("payment_terms", v)} placeholder="e.g. 14 days EOM" />
                <FieldSelect label="Currency" value={form.currency} onChange={(v) => update("currency", v)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </FieldSelect>
                <FieldInput label="Contract Capacity" value={form.contract_capacity} onChange={(v) => update("contract_capacity", v)} placeholder="e.g. Up to $5M" />
              </div>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                <Save className="mr-1.5 h-3.5 w-3.5" />Save
              </Button>
            </div>
          </div>
        )}

        {/* ── Compliance tab (external only) ── */}
        {activeTab === "compliance" && !isInternal && (
          <div className="space-y-5">
            {(
              [
                {
                  title: "Business License",
                  numField: "business_license_number", numLabel: "License Number",
                  expField: "business_license_expiry", expLabel: "Expiry Date",
                },
                {
                  title: "Insurance Certificate",
                  numField: "insurance_cert_number", numLabel: "Certificate Number",
                  expField: "insurance_expiry", expLabel: "Expiry Date",
                },
                {
                  title: "Trade License",
                  numField: "trade_license_number", numLabel: "License Number",
                  expField: "trade_license_expiry", expLabel: "Expiry Date",
                },
              ] as const
            ).map(({ title, numField, numLabel, expField, expLabel }) => {
              const exp = form[expField] as string;
              const status = expiryLabel(exp || null);
              const cls = expiryClass(exp || null);
              return (
                <div key={title} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">{title}</p>
                    {status && (
                      <span className={cn("text-xs font-medium flex items-center gap-1", cls)}>
                        {(status === "Expired" || status.startsWith("Expires")) && <AlertTriangle className="h-3 w-3" />}
                        {status}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput
                      label={numLabel}
                      value={(form[numField] as string) ?? ""}
                      onChange={(v) => update(numField, v)}
                      placeholder="Reference number"
                    />
                    <FieldInput
                      label={expLabel}
                      value={exp}
                      onChange={(v) => update(expField, v)}
                      type="date"
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end border-t border-border pt-4">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                <Save className="mr-1.5 h-3.5 w-3.5" />Save
              </Button>
            </div>
          </div>
        )}

        {/* ── Teams tab ── */}
        {activeTab === "teams" && (
          <div>
            {!isEditing ? (
              <p className="text-sm text-muted-foreground text-center py-12">Save the stakeholder first, then manage teams.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-muted-foreground">{teams.length} team{teams.length !== 1 ? "s" : ""}</p>
                  {!showTeamForm && (
                    <Button size="sm" className="h-7 text-xs" onClick={openAddTeam}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Add Team
                    </Button>
                  )}
                </div>

                {showTeamForm && (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 mb-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">{editingTeamId ? "Edit team" : "New team"}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldInput label="Team Name *" value={teamForm.team_name}
                        onChange={(v) => setTeamForm((f) => ({ ...f, team_name: v }))} placeholder="e.g. Design Team" />
                      <FieldInput label="Team Code" value={teamForm.team_code}
                        onChange={(v) => setTeamForm((f) => ({ ...f, team_code: v.toUpperCase() }))} placeholder="e.g. DES-01" />
                      <FieldInput label="Department" value={teamForm.department}
                        onChange={(v) => setTeamForm((f) => ({ ...f, department: v }))} placeholder="e.g. Architecture" />
                      <FieldInput label="Description" value={teamForm.description}
                        onChange={(v) => setTeamForm((f) => ({ ...f, description: v }))} placeholder="Short description" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setShowTeamForm(false); setEditingTeamId(null); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5">
                        <XCircle className="h-3.5 w-3.5" />Cancel
                      </button>
                      <button onClick={saveTeam} disabled={!teamForm.team_name.trim() || savingTeam}
                        className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50">
                        {savingTeam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {editingTeamId ? "Update" : "Add"}
                      </button>
                    </div>
                  </div>
                )}

                {teamsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : teams.length === 0 && !showTeamForm ? (
                  <p className="text-xs text-muted-foreground text-center py-10">No teams yet. Add a team to organize members.</p>
                ) : (
                  <div className="space-y-2">
                    {teams.map((t) => (
                      <div key={t.id} className="flex items-start justify-between rounded-lg border border-border bg-card p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.team_name}</span>
                            {t.team_code && (
                              <span className="text-[10px] font-mono bg-muted text-muted-foreground rounded px-1 py-0.5">{t.team_code}</span>
                            )}
                          </div>
                          {(t.department || t.description) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {[t.department, t.description].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openEditTeam(t)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => removeTeam(t.id)}
                              className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Members tab ── */}
        {activeTab === "members" && (
          <div>
            {!isEditing ? (
              <p className="text-sm text-muted-foreground text-center py-12">Save the stakeholder first, then add members.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-muted-foreground">{staffList.length} member{staffList.length !== 1 ? "s" : ""}</p>
                  {!showStaffForm && (
                    <Button size="sm" className="h-7 text-xs" onClick={openAddStaff}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Add Member
                    </Button>
                  )}
                </div>

                {showStaffForm && (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 mb-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">{editingStaffId ? "Edit member" : "Add member"}</p>

                    {/* HR profile picker for internal stakeholders */}
                    {isInternal && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Link to HR Employee</Label>
                        <select
                          value={staffForm.profile_id}
                          onChange={(e) => onPickProfile(e.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        >
                          <option value="">— Select employee (or fill manually) —</option>
                          {hrProfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}{p.department ? ` · ${p.department}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <FieldInput label="Full Name *" value={staffForm.full_name}
                        onChange={(v) => setStaffForm((f) => ({ ...f, full_name: v }))} placeholder="Full name" />
                      <FieldInput label="Job Title" value={staffForm.job_title}
                        onChange={(v) => setStaffForm((f) => ({ ...f, job_title: v }))} placeholder="e.g. Site Engineer" />
                      <FieldInput label="Email" value={staffForm.email} type="email"
                        onChange={(v) => setStaffForm((f) => ({ ...f, email: v }))} placeholder="email@company.com" />
                      <FieldInput label="Phone" value={staffForm.phone}
                        onChange={(v) => setStaffForm((f) => ({ ...f, phone: v }))} placeholder="+855 12 000 000" />
                    </div>

                    {teams.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Assign to Team</Label>
                        <select
                          value={staffForm.team_id}
                          onChange={(e) => setStaffForm((f) => ({ ...f, team_id: e.target.value }))}
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        >
                          <option value="">— No team —</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                        </select>
                      </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={staffForm.is_primary_contact}
                        onChange={(e) => setStaffForm((f) => ({ ...f, is_primary_contact: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs text-muted-foreground">Primary contact</span>
                    </label>

                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setShowStaffForm(false); setEditingStaffId(null); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5">
                        <XCircle className="h-3.5 w-3.5" />Cancel
                      </button>
                      <button onClick={saveStaff} disabled={!staffForm.full_name.trim() || savingStaff}
                        className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50">
                        {savingStaff ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {editingStaffId ? "Update" : "Add"}
                      </button>
                    </div>
                  </div>
                )}

                {staffLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : staffList.length === 0 && !showStaffForm ? (
                  <p className="text-xs text-muted-foreground text-center py-10">No members yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {staffList.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(s.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{s.full_name}</span>
                            {s.is_primary_contact && <span className="text-[10px] text-amber-600 font-medium">★ Primary</span>}
                            {s.profile_id && <span className="text-[10px] text-indigo-600 font-medium">HR</span>}
                          </div>
                          {s.job_title && <p className="text-xs text-muted-foreground">{s.job_title}</p>}
                          {(s.email || s.phone) && (
                            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                              {[s.email, s.phone].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => openEditStaff(s)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeStaff(s.id)}
                            className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
