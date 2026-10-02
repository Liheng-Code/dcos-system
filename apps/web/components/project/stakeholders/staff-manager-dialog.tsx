"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { X, Loader2, Plus, Pencil, Trash2, Check, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

export interface StakeholderStaff {
  id: string;
  stakeholder_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  status: string;
  notes: string | null;
}

interface StaffFormData {
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  is_primary_contact: boolean;
}

const EMPTY_STAFF_FORM: StaffFormData = {
  full_name: "",
  job_title: "",
  email: "",
  phone: "",
  is_primary_contact: false,
};

interface StaffManagerDialogProps {
  stakeholderId: string;
  stakeholderName: string;
  open: boolean;
  onClose: () => void;
  onStaffChange: () => void;
  initialView?: "list" | "form";
}

export function StaffManagerDialog({
  stakeholderId,
  stakeholderName,
  open,
  onClose,
  onStaffChange,
  initialView = "list",
}: StaffManagerDialogProps) {
  const [staffList, setStaffList] = useState<StakeholderStaff[]>([]);
  const [staffForm, setStaffForm] = useState<StaffFormData>(EMPTY_STAFF_FORM);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [showStaffForm, setShowStaffForm] = useState(initialView === "form");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    if (!open) return;
    supabaseRef.current = createClient();
    setLoading(true);
    setShowStaffForm(initialView === "form");
    setEditingStaffId(null);
    setStaffForm(EMPTY_STAFF_FORM);
    supabaseRef.current
      .from("stakeholder_staff")
      .select("*")
      .eq("stakeholder_id", stakeholderId)
      .order("is_primary_contact", { ascending: false })
      .order("full_name", { ascending: true })
      .then(({ data }) => {
        if (data) setStaffList(data as StakeholderStaff[]);
        setLoading(false);
      });
  }, [stakeholderId, open, initialView]);

  function handleAddNew() {
    setStaffForm(EMPTY_STAFF_FORM);
    setEditingStaffId(null);
    setShowStaffForm(true);
  }

  function handleEdit(staff: StakeholderStaff) {
    setStaffForm({
      full_name: staff.full_name,
      job_title: staff.job_title ?? "",
      email: staff.email ?? "",
      phone: staff.phone ?? "",
      is_primary_contact: staff.is_primary_contact,
    });
    setEditingStaffId(staff.id);
    setShowStaffForm(true);
  }

  function handleCancelForm() {
    setShowStaffForm(false);
    setEditingStaffId(null);
    setStaffForm(EMPTY_STAFF_FORM);
  }

  async function handleSaveForm() {
    if (!staffForm.full_name.trim()) return;
    setSaving(true);
    const supabase = supabaseRef.current!;
    const payload = {
      full_name: staffForm.full_name.trim(),
      job_title: staffForm.job_title || null,
      email: staffForm.email || null,
      phone: staffForm.phone || null,
      is_primary_contact: staffForm.is_primary_contact,
    };

    if (staffForm.is_primary_contact) {
      await supabase
        .from("stakeholder_staff")
        .update({ is_primary_contact: false })
        .eq("stakeholder_id", stakeholderId)
        .neq("id", editingStaffId ?? "");
    }

    if (editingStaffId) {
      const { error } = await supabase
        .from("stakeholder_staff")
        .update(payload)
        .eq("id", editingStaffId);
      if (error) {
        toast.error(`Failed to update staff: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("stakeholder_staff")
        .insert({ ...payload, stakeholder_id: stakeholderId });
      if (error) {
        toast.error(`Failed to add staff: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    // Refresh list
    const { data } = await supabase
      .from("stakeholder_staff")
      .select("*")
      .eq("stakeholder_id", stakeholderId)
      .order("is_primary_contact", { ascending: false })
      .order("full_name", { ascending: true });
    if (data) setStaffList(data as StakeholderStaff[]);

    setSaving(false);
    setShowStaffForm(false);
    setEditingStaffId(null);
    setStaffForm(EMPTY_STAFF_FORM);
    onStaffChange();
  }

  async function handleRemove(id: string) {
    const supabase = supabaseRef.current!;
    const { error } = await supabase.from("stakeholder_staff").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStaffList((prev) => prev.filter((s) => s.id !== id));
    onStaffChange();
  }

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background rounded-lg border border-border shadow-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold">{stakeholderName}</h2>
            <p className="text-xs text-muted-foreground">
              {showStaffForm ? (editingStaffId ? "Edit staff member" : "Add staff member") : "Staff management"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {!showStaffForm && (
                <div className="space-y-3">
                  {staffList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No staff members yet.</p>
                  ) : (
                    staffList.map((staff) => (
                      <div
                        key={staff.id}
                        className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {initials(staff.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium">{staff.full_name}</span>
                            {staff.is_primary_contact && (
                              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                Primary
                              </span>
                            )}
                          </div>
                          {staff.job_title && (
                            <p className="text-xs text-muted-foreground">{staff.job_title}</p>
                          )}
                          {(staff.email || staff.phone) && (
                            <p className="text-[11px] text-muted-foreground/70">
                              {[staff.email, staff.phone].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(staff)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(staff.id)}
                            className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={handleAddNew}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Staff Member
                  </button>
                </div>
              )}

              {showStaffForm && (
                <div className="space-y-2.5 rounded-md border border-border bg-muted/20 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff_name">Full Name *</Label>
                    <input
                      id="staff_name"
                      value={staffForm.full_name}
                      onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff_title">Job Title</Label>
                      <input
                        id="staff_title"
                        value={staffForm.job_title}
                        onChange={(e) => setStaffForm({ ...staffForm, job_title: e.target.value })}
                        placeholder="e.g. Architect"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff_email">Email</Label>
                      <input
                        id="staff_email"
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        placeholder="email@example.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff_phone">Phone</Label>
                      <input
                        id="staff_phone"
                        value={staffForm.phone}
                        onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                        placeholder="+855 12 345 678"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staffForm.is_primary_contact}
                          onChange={(e) => {
                            setStaffForm({ ...staffForm, is_primary_contact: e.target.checked });
                          }}
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">Primary contact</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCancelForm}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveForm}
                      disabled={!staffForm.full_name.trim() || saving}
                      className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <Check className="h-3.5 w-3.5" />
                      {editingStaffId ? "Update" : "Add"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
