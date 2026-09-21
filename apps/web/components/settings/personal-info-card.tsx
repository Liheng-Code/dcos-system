"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Contact, Loader2, Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Section B (Phase 6 plan) — deliberately curated self-editable subset of `profiles`.
// Do NOT add fields here: sensitive identity documents (national_id_number,
// passport_number, visa_number, work_permit_number, tax_identification_number,
// permanent_address) are gated behind the HR PATCH route's SENSITIVE_FIELDS +
// admin-supplied `reason` control, and HR-operational fields (shift_group, payroll_group,
// cost_center, probation/contract dates, etc.) have no self-service precedent anywhere in
// this app. `date_of_birth` and `nationality` were moved out to the read-only Account
// Information card (profile-account-info-card.tsx) for the same reason as the excluded
// identity-document fields above — both carry legal/compliance weight (KYC, work
// permits/visas elsewhere on this same `profiles` table) and should be HR/Admin-mediated,
// not free self-service text. This payload also never includes any of the 6 protected
// columns (`role`, `account_status`, `status`, `department_id`, `email`, `user_code`)
// rejected by fn_guard_profiles_protected_columns() — confirmed by reading
// supabase/migrations/20260824040047_usr_fix_protected_columns_trigger_service_context.sql.
export interface PersonalInfoFields {
  phone: string | null;
  current_address: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
}

interface PersonalInfoCardProps {
  userId: string;
  initial: PersonalInfoFields;
  onSaved: (fields: PersonalInfoFields) => void;
}

function toFormValue(v: string | null): string {
  return v ?? "";
}

function toNullable(v: string): string | null {
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function displayValue(v: string | null): string {
  return v && v.trim().length > 0 ? v : "—";
}

export function PersonalInfoCard({ userId, initial, onSaved }: PersonalInfoCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PersonalInfoFields>(initial);

  function startEdit() {
    setForm(initial);
    setEditing(true);
  }

  function cancelEdit() {
    setForm(initial);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const payload: PersonalInfoFields = {
      phone: toNullable(toFormValue(form.phone)),
      current_address: toNullable(toFormValue(form.current_address)),
      gender: form.gender || null,
      emergency_contact_name: toNullable(toFormValue(form.emergency_contact_name)),
      emergency_contact_relationship: toNullable(toFormValue(form.emergency_contact_relationship)),
      emergency_contact_phone: toNullable(toFormValue(form.emergency_contact_phone)),
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Personal information saved");
    onSaved(payload);
    setEditing(false);
    setSaving(false);
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Contact className="h-4 w-4 text-muted-foreground" />
          Personal Information
        </CardTitle>
        <CardAction>
          {editing ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {editing ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={toFormValue(form.phone)}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. +855 12 345 678"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                value={form.gender ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value || null }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="current_address">Current Address</Label>
              <Input
                id="current_address"
                value={toFormValue(form.current_address)}
                onChange={(e) => setForm((f) => ({ ...f, current_address: e.target.value }))}
                placeholder="e.g. #123, Street 456, Phnom Penh"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
              <Input
                id="emergency_contact_name"
                value={toFormValue(form.emergency_contact_name)}
                onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_relationship">Emergency Contact Relationship</Label>
              <Input
                id="emergency_contact_relationship"
                value={toFormValue(form.emergency_contact_relationship)}
                onChange={(e) => setForm((f) => ({ ...f, emergency_contact_relationship: e.target.value }))}
                placeholder="e.g. Spouse"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
              <Input
                id="emergency_contact_phone"
                type="tel"
                value={toFormValue(form.emergency_contact_phone)}
                onChange={(e) => setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium text-foreground">{displayValue(initial.phone)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gender</p>
              <p className="text-sm font-medium capitalize text-foreground">{displayValue(initial.gender)}</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Current Address</p>
              <p className="text-sm font-medium text-foreground">{displayValue(initial.current_address)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Emergency Contact Name</p>
              <p className="text-sm font-medium text-foreground">{displayValue(initial.emergency_contact_name)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Emergency Contact Relationship</p>
              <p className="text-sm font-medium text-foreground">
                {displayValue(initial.emergency_contact_relationship)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Emergency Contact Phone</p>
              <p className="text-sm font-medium text-foreground">{displayValue(initial.emergency_contact_phone)}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
