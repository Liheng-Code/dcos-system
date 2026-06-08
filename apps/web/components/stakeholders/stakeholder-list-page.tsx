"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, X, Plus, Building2, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StakeholderEditSheet, type Stakeholder } from "@/components/stakeholders/stakeholder-edit-sheet";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTERNAL_TYPE_LABELS: Record<string, string> = {
  CLI: "Client / Owner",
  CON: "Consultant",
  MC:  "Main Contractor",
  SUB: "Subcontractor",
  SUP: "Supplier",
  AUT: "Authority",
  TST: "Testing Agency",
  FM:  "Facility Management",
};

const INTERNAL_TYPE_LABELS: Record<string, string> = {
  INT: "Internal Department",
};

const ALL_TYPE_LABELS: Record<string, string> = {
  ...EXTERNAL_TYPE_LABELS,
  ...INTERNAL_TYPE_LABELS,
};

const TYPE_COLORS: Record<string, string> = {
  CLI: "bg-blue-500/10 text-blue-700 border-blue-200",
  CON: "bg-violet-500/10 text-violet-700 border-violet-200",
  MC:  "bg-orange-500/10 text-orange-700 border-orange-200",
  SUB: "bg-amber-500/10 text-amber-700 border-amber-200",
  SUP: "bg-teal-500/10 text-teal-700 border-teal-200",
  AUT: "bg-red-500/10 text-red-700 border-red-200",
  TST: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  FM:  "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  INT: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
};

const STATUS_COLORS: Record<string, string> = {
  active:      "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive:    "bg-gray-500/10 text-gray-500 border-gray-200",
  blacklisted: "bg-red-500/10 text-red-600 border-red-200",
  preferred:   "bg-blue-500/10 text-blue-600 border-blue-200",
};

const APPROVAL_COLORS: Record<string, string> = {
  draft:          "bg-gray-500/10 text-gray-500",
  pending_review: "bg-amber-500/10 text-amber-600",
  approved:       "",
  rejected:       "bg-red-500/10 text-red-600",
};

interface StaffSummary {
  primaryContact: string;
  staffCount: number;
  staffNames: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StakeholderListPage() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, StaffSummary>>({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"external" | "internal">("external");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Stakeholder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  function loadData(silent = false) {
    if (!silent) setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase.from("stakeholders").select("*").order("organization_name"),
      supabase.from("stakeholder_staff").select("id, stakeholder_id, full_name, is_primary_contact"),
    ]).then(([stRes, sfRes]) => {
      if (stRes.data) setStakeholders(stRes.data as Stakeholder[]);
      if (sfRes.data) {
        const map: Record<string, StaffSummary> = {};
        for (const s of sfRes.data) {
          if (!map[s.stakeholder_id]) {
            map[s.stakeholder_id] = { primaryContact: "", staffCount: 0, staffNames: [] };
          }
          map[s.stakeholder_id].staffCount++;
          map[s.stakeholder_id].staffNames.push(s.full_name);
          if (s.is_primary_contact) map[s.stakeholder_id].primaryContact = s.full_name;
        }
        setStaffMap(map);
      }
      if (!silent) setLoading(false);
    });
  }

  useEffect(() => {
    loadData();
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("role").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p) setIsAdmin(p.role === "admin"); });
    });
  }, []);

  // Reset type filter when switching category
  useEffect(() => { setTypeFilter(""); }, [category]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return stakeholders.filter((s) => {
      if (s.category !== category) return false;
      if (typeFilter && s.stakeholder_type !== typeFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q && !s.organization_name.toLowerCase().includes(q) &&
          !(s.company_code ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stakeholders, category, typeFilter, statusFilter, search]);

  const typeLabels = category === "external" ? EXTERNAL_TYPE_LABELS : INTERNAL_TYPE_LABELS;

  function handleSave(updated: Stakeholder) {
    setStakeholders((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [updated, ...prev];
    });
    setSelected(updated);
    setShowCreate(false);
    loadData(true);
  }

  async function handleDelete(stakeholder: Stakeholder) {
    if (!confirm(`Delete "${stakeholder.organization_name}"? This also removes all associated staff and teams.`)) return;
    const { error } = await createClient().from("stakeholders").delete().eq("id", stakeholder.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stakeholder deleted");
    setStakeholders((prev) => prev.filter((s) => s.id !== stakeholder.id));
    setSelected(null);
    setShowCreate(false);
  }

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const STAFF_COLORS = [
    "bg-blue-500/10 text-blue-600",
    "bg-emerald-500/10 text-emerald-600",
    "bg-amber-500/10 text-amber-600",
    "bg-violet-500/10 text-violet-600",
    "bg-rose-500/10 text-rose-600",
  ];

  const externalCount = stakeholders.filter((s) => s.category === "external").length;
  const internalCount = stakeholders.filter((s) => s.category === "internal").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeStakeholder = showCreate ? null : selected;

  return (
    <div className="flex h-full border border-border rounded-lg overflow-hidden">
      {/* ── Left Panel ── */}
      <div className="w-[420px] shrink-0 border-r border-border flex flex-col bg-background">

        {/* Category toggle */}
        <div className="p-3 border-b border-border">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => { setCategory("external"); setSelected(null); setShowCreate(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors",
                category === "external"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              External
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                category === "external" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>{externalCount}</span>
            </button>
            <button
              onClick={() => { setCategory("internal"); setSelected(null); setShowCreate(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors",
                category === "internal"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              Internal
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                category === "internal" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>{internalCount}</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2.5 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            <Button onClick={() => { setShowCreate(true); setSelected(null); }} size="sm" className="h-7 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background py-1.5 px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">All Types</option>
              {Object.entries(typeLabels).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background py-1.5 px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">All Status</option>
              {["active", "inactive", "blacklisted", "preferred"].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            {(typeFilter || statusFilter || search) && (
              <button
                onClick={() => { setTypeFilter(""); setStatusFilter(""); setSearch(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">No stakeholders found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => {
                const summary = staffMap[s.id];
                const isSelected = selected?.id === s.id && !showCreate;
                const names = summary?.staffNames ?? [];
                const visible = names.slice(0, 4);
                const overflow = names.length - visible.length;
                return (
                  <div
                    key={s.id}
                    onClick={() => { setSelected(s); setShowCreate(false); }}
                    className={cn(
                      "rounded-lg border p-3 cursor-pointer transition-all",
                      isSelected
                        ? "border-primary/70 bg-primary/[0.03] ring-1 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:shadow-sm bg-card",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground leading-tight truncate">
                            {s.organization_name}
                          </span>
                          {s.company_code && (
                            <span className="shrink-0 text-[10px] font-mono font-medium text-muted-foreground bg-muted rounded px-1 py-0.5">
                              {s.company_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                            TYPE_COLORS[s.stakeholder_type] ?? "bg-muted/60 text-muted-foreground border-border",
                          )}>
                            {s.stakeholder_type} · {ALL_TYPE_LABELS[s.stakeholder_type] ?? s.stakeholder_type}
                          </span>
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                            STATUS_COLORS[s.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                          )}>
                            {s.status}
                          </span>
                          {s.approval_status && s.approval_status !== "approved" && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                              APPROVAL_COLORS[s.approval_status],
                            )}>
                              {s.approval_status.replace("_", " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      {summary?.primaryContact ? (
                        <span>Contact: <span className="font-medium text-foreground">{summary.primaryContact}</span></span>
                      ) : (
                        <span className="italic text-muted-foreground/40">No primary contact</span>
                      )}
                    </div>

                    {names.length > 0 && (
                      <div className="mt-2 flex items-center gap-1">
                        <div className="flex -space-x-1.5">
                          {visible.map((name, i) => (
                            <div
                              key={`${s.id}-${i}`}
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-medium ring-1 ring-background",
                                STAFF_COLORS[i % STAFF_COLORS.length],
                              )}
                              title={name}
                            >
                              {initials(name)}
                            </div>
                          ))}
                          {overflow > 0 && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground ring-1 ring-background">
                              +{overflow}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 ml-0.5">
                          {names.length} member{names.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {showCreate || selected ? (
          <StakeholderEditSheet
            key={showCreate ? `create-${category}` : selected?.id}
            stakeholder={activeStakeholder}
            defaultCategory={category}
            onClose={() => { setSelected(null); setShowCreate(false); }}
            onSave={handleSave}
            onDelete={handleDelete}
            isAdmin={isAdmin}
            onStaffChange={() => loadData(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center px-6">
              <Building2 className="h-14 w-14 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">Select a stakeholder</p>
              <p className="text-xs mt-1">Choose a company from the left panel to view and edit its details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
