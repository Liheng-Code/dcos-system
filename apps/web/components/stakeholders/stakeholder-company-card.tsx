"use client";

import { useState } from "react";
import {
  Globe, Mail, Phone, MapPin, Pencil, Trash2, ChevronDown,
  Users2, UserPlus, Loader2, Crown, XCircle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { insertStakeholderStaff, updateStakeholderStaffByStakeholderIdWithId } from "@/lib/stakeholders/stakeholders-queries";
import { toast } from "sonner";
import { Sparkline } from "@/components/stakeholders/sparkline";
import {
  ALL_TYPE_LABELS, TYPE_COLORS, TYPE_ACCENTS, AVATAR_COLORS, STATUS_COLORS, initials,
} from "@/components/stakeholders/constants";
import type { Stakeholder, StakeholderStaff } from "@/components/stakeholders/stakeholder-edit-sheet";

interface TrendData {
  labels: string[];
  values: number[];
}

interface StakeholderCompanyCardProps {
  stakeholder: Stakeholder;
  staff: StakeholderStaff[];
  assignedProjectIds: string[];
  trend: TrendData;
  selectedProjectId: string;
  selectedProjectName: string | null;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onBulkAssign: () => void;
  onStaffChange: () => void;
}

interface MemberFormState {
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  is_primary_contact: boolean;
}

export function StakeholderCompanyCard({
  stakeholder, staff, assignedProjectIds, trend,
  selectedProjectId, selectedProjectName, busy,
  onEdit, onDelete, onConnect, onDisconnect, onBulkAssign, onStaffChange,
}: StakeholderCompanyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberFormState>({
    full_name: "", job_title: "", email: "", phone: "", is_primary_contact: false,
  });

  const hasProject = !!selectedProjectId;
  const isConnected = hasProject && assignedProjectIds.includes(selectedProjectId);
  const isExternal = stakeholder.category === "external";
  const typeLabel = ALL_TYPE_LABELS[stakeholder.stakeholder_type] ?? stakeholder.stakeholder_type;
  const avatarSeed = initials(stakeholder.short_name || stakeholder.organization_name);

  const contacts = [
    stakeholder.website && { icon: Globe, value: stakeholder.website },
    stakeholder.email && { icon: Mail, value: stakeholder.email },
    stakeholder.phone && { icon: Phone, value: stakeholder.phone },
    stakeholder.address && { icon: MapPin, value: stakeholder.address },
  ].filter(Boolean) as { icon: typeof Globe; value: string }[];

  function handleToggleConnection(action: string) {
    if (action === "connect") onConnect();
    else if (action === "disconnect") onDisconnect();
  }

  function openAddMember() {
    setMemberForm({ full_name: "", job_title: "", email: "", phone: "", is_primary_contact: false });
    setShowAddMember(true);
  }

  async function handleAddMember() {
    if (!memberForm.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    setMemberSaving(true);

    if (memberForm.is_primary_contact) {
      await updateStakeholderStaffByStakeholderIdWithId({ is_primary_contact: false }, stakeholder.id);
    }

    const payload = {
      stakeholder_id: stakeholder.id,
      full_name: memberForm.full_name.trim(),
      job_title: memberForm.job_title.trim() || null,
      email: memberForm.email.trim() || null,
      phone: memberForm.phone.trim() || null,
      is_primary_contact: memberForm.is_primary_contact,
    };

    const { error } = await insertStakeholderStaff(payload);
    setMemberSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member added");
    setShowAddMember(false);
    setMemberForm({ full_name: "", job_title: "", email: "", phone: "", is_primary_contact: false });
    onStaffChange();
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className={cn("h-1 shrink-0", TYPE_ACCENTS[stakeholder.stakeholder_type] ?? "bg-primary")} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            TYPE_COLORS[stakeholder.stakeholder_type] ?? "bg-primary/10 text-primary",
          )}>
            {avatarSeed}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{stakeholder.organization_name}</span>
              {stakeholder.company_code && (
                <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {stakeholder.company_code}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{typeLabel}</p>
          </div>
          <span className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            isExternal
              ? "border-amber-200 bg-amber-500/10 text-amber-600"
              : "border-indigo-200 bg-indigo-500/10 text-indigo-600",
          )}>
            {isExternal ? "External" : "Internal"}
          </span>
        </div>

        {/* Contact */}
        {contacts.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {contacts.map(({ icon: Icon, value }, i) => (
              <div key={i} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Company metrics */}
        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Company Metrics
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric value={staff.length} label="Roster" caption="Personnel" />
            <Metric value={assignedProjectIds.length} label="Projects" caption="Active" />
            {/* TODO: no contracts↔stakeholder link in the schema; placeholder per no-DB-change scope */}
            <Metric value={0} label="Total" caption="Contracts" />
          </div>
        </div>

        {/* Assignment trend */}
        <div className="rounded-lg border border-border/70 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Assignment Trend
            </p>
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              {trend.labels[0]} – {trend.labels[trend.labels.length - 1]}
            </span>
          </div>
          <Sparkline data={trend.values} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            {trend.labels.map((label, i) => (
              <span key={label}>{label}: {trend.values[i]}</span>
            ))}
          </div>
        </div>

        {/* Assign actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full bg-orange-500 text-white hover:enabled:bg-orange-600 active:enabled:bg-orange-700 disabled:bg-orange-500 disabled:text-white disabled:opacity-100"
            disabled={!hasProject || isConnected || busy}
            onClick={onConnect}
            title={!hasProject ? "Select a project to assign" : undefined}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {isConnected ? "Assigned to Project" : "Single Assign"}
          </Button>
          <Button
            size="sm"
            className="w-full bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 disabled:bg-orange-500/40 disabled:text-white/60"
            disabled={!hasProject || busy}
            onClick={onBulkAssign}
            title={!hasProject ? "Select a project to assign" : undefined}
          >
            <Users2 className="h-3.5 w-3.5" />
            Member Assign
          </Button>
        </div>

        {/* Project assignment toggle */}
        <div className="rounded-lg bg-muted/30 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium">Project Assignment</span>
            <span className={cn(
              "text-xs font-semibold",
              isConnected ? "text-emerald-600" : "text-muted-foreground",
            )}>
              {isConnected ? "Active" : "Inactive"}
            </span>
          </div>
          <select
            value=""
            disabled={!hasProject || busy}
            onChange={(e) => { handleToggleConnection(e.target.value); e.target.value = ""; }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">
              {hasProject ? "— Toggle Project Connection —" : "Select a project first"}
            </option>
            {hasProject && !isConnected && (
              <option value="connect">Connect to {selectedProjectName ?? "project"}</option>
            )}
            {hasProject && isConnected && (
              <option value="disconnect">Disconnect from {selectedProjectName ?? "project"}</option>
            )}
          </select>
        </div>

        {/* Members */}
        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline"
          >
            <span className="flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5" />
              Members ({staff.length})
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {staff.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No personnel registered.</p>
              ) : (
                <div className="space-y-1">
                  {staff.map((member, i) => (
                    <div key={member.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                        AVATAR_COLORS[i % AVATAR_COLORS.length],
                      )}>
                        {initials(member.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{member.full_name}</p>
                        {member.job_title && (
                          <p className="truncate text-[10px] text-muted-foreground">{member.job_title}</p>
                        )}
                      </div>
                      {member.is_primary_contact && (
                        <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-label="Primary contact" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddMember ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2.5">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Full Name *</label>
                    <input
                      value={memberForm.full_name}
                      onChange={(e) => setMemberForm((f) => ({ ...f, full_name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Job Title</label>
                    <input
                      value={memberForm.job_title}
                      onChange={(e) => setMemberForm((f) => ({ ...f, job_title: e.target.value }))}
                      placeholder="e.g. Site Engineer"
                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Email</label>
                      <input
                        type="email"
                        value={memberForm.email}
                        onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="email@company.com"
                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Phone</label>
                      <input
                        value={memberForm.phone}
                        onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="+855 12 000 000"
                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={memberForm.is_primary_contact}
                      onChange={(e) => setMemberForm((f) => ({ ...f, is_primary_contact: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">Primary contact</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAddMember(false)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddMember}
                      disabled={!memberForm.full_name.trim() || memberSaving}
                      className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {memberSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAddMember}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Member
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          Status:{" "}
          <span className={cn(
            "font-semibold",
            (STATUS_COLORS[stakeholder.status] ?? "").split(" ").find((c) => c.startsWith("text-")) ?? "text-foreground",
          )}>
            {stakeholder.status === "active" ? "ACTIVATED" : stakeholder.status.toUpperCase()}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Edit stakeholder"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete stakeholder"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label, caption }: { value: number; label: string; caption: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{caption}</p>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
