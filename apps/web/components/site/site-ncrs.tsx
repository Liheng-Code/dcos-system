"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Plus,
  Loader2,
  Pencil,
  Search,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldAlert,
  User,
  X,
  FileText,
  DollarSign,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  minor: {
    label: "Minor",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  major: {
    label: "Major",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  critical: {
    label: "Critical",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string }
> = {
  open: { label: "Open", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  corrective_action: { label: "Corrective Action", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  reinspection: { label: "Re-inspection", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  closed: { label: "Closed", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  voided: { label: "Voided", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

const BACK_CHARGE_CATEGORIES = [
  { value: "defect_rectification", label: "Defect Rectification (Rework)" },
  { value: "damage", label: "Damage to Site Works / Materials" },
  { value: "extra_service", label: "Main Contractor Cleanup / Equipment Supply" },
  { value: "penalty", label: "Contractual Non-Compliance Penalty" },
  { value: "other", label: "Other Remedial Expense" },
];

interface NcrRow {
  id: string;
  project_id: string;
  ncr_number: string;
  description: string;
  severity: "minor" | "major" | "critical";
  responsible_party: string | null;
  due_date: string | null;
  status: string;
  closure_comment: string | null;
  closed_at: string | null;
  created_at: string;
}

interface SubcontractOption {
  id: string;
  subcontract_no: string;
  scope_of_work: string | null;
}

export function SiteNcrs() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<NcrRow[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NcrRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Back-charge ticket modal state
  const [backChargeNcr, setBackChargeNcr] = useState<NcrRow | null>(null);
  const [bcSubcontractId, setBcSubcontractId] = useState("");
  const [bcChargeNo, setBcChargeNo] = useState("");
  const [bcAmount, setBcAmount] = useState("");
  const [bcDescription, setBcDescription] = useState("");
  const [bcCategory, setBcCategory] = useState("defect_rectification");
  const [bcNotes, setBcNotes] = useState("");
  const [savingBc, setSavingBc] = useState(false);

  const supabase = createClient();

  // Form inputs
  const [ncrNumber, setNcrNumber] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | "critical">("minor");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("open");
  const [closureComment, setClosureComment] = useState("");

  async function load() {
    if (!selectedProjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ncrs")
        .select("*")
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data || []) as NcrRow[]);

      // Load subcontracts for back-charge linking
      const { data: scData } = await supabase
        .from("subcontracts")
        .select("id, subcontract_no, scope_of_work")
        .eq("project_id", selectedProjectId)
        .order("subcontract_no", { ascending: true });

      setSubcontracts(scData || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedProjectId]);

  function resetForm() {
    setNcrNumber(`NCR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(rows.length + 1).padStart(3, "0")}`);
    setDescription("");
    setSeverity("minor");
    setResponsibleParty("");
    setDueDate("");
    setStatus("open");
    setClosureComment("");
    setEditing(null);
  }

  function openEdit(row: NcrRow) {
    setNcrNumber(row.ncr_number || "");
    setDescription(row.description || "");
    setSeverity(row.severity || "minor");
    setResponsibleParty(row.responsible_party || "");
    setDueDate(row.due_date?.slice(0, 10) || "");
    setStatus(row.status || "open");
    setClosureComment(row.closure_comment || "");
    setEditing(row);
    setShowForm(true);
  }

  function openBackCharge(row: NcrRow) {
    setBackChargeNcr(row);
    setBcChargeNo(`BC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`);
    setBcDescription(`Remedial work for ${row.ncr_number}: ${row.description.slice(0, 120)}`);
    setBcAmount("");
    setBcCategory("defect_rectification");
    setBcNotes(`Issued by Site Team against NCR ${row.ncr_number}. Defect caused by ${row.responsible_party || "trade subcontractor"}.`);

    // Match subcontract by responsible_party
    const matched = subcontracts.find((sc) =>
      row.responsible_party &&
      (sc.subcontract_no.toLowerCase().includes(row.responsible_party.toLowerCase()) ||
        sc.scope_of_work?.toLowerCase().includes(row.responsible_party.toLowerCase()))
    );
    if (matched) {
      setBcSubcontractId(matched.id);
    } else if (subcontracts.length > 0) {
      setBcSubcontractId(subcontracts[0].id);
    }
  }

  async function handleCreateBackCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId || !backChargeNcr) return;

    if (!bcSubcontractId) {
      toast.error("Please select a valid subcontractor contract.");
      return;
    }

    const amt = parseFloat(bcAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid back-charge dollar amount.");
      return;
    }

    setSavingBc(true);
    try {
      const { data: authData } = await supabase.auth.getUser();

      const payload = {
        project_id: selectedProjectId,
        subcontract_id: bcSubcontractId,
        charge_no: bcChargeNo.trim(),
        description: bcDescription.trim(),
        amount: amt,
        category: bcCategory,
        status: "raised",
        raised_date: todayISO(),
        ncr_id: backChargeNcr.id,
        notes: bcNotes.trim() || null,
        created_by: authData.user?.id ?? null,
      };

      const { error } = await supabase
        .from("subcontract_back_charges")
        .insert([payload]);

      if (error) throw error;

      toast.success(
        `Back-charge ticket ${bcChargeNo} ($${amt.toLocaleString()}) issued! Routed to Quantity Surveying for IPC deduction.`,
        { duration: 6000 }
      );
      setBackChargeNcr(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingBc(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Please select a project first.");
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const isClosing = status === "closed";

      const payload = {
        project_id: selectedProjectId,
        ncr_number: ncrNumber.trim(),
        description: description.trim(),
        severity,
        responsible_party: responsibleParty.trim() || null,
        due_date: dueDate || null,
        status,
        closure_comment: closureComment.trim() || null,
        closed_at: isClosing ? new Date().toISOString() : null,
        closed_by: isClosing ? authData.user?.id ?? null : null,
      };

      if (editing) {
        const { error } = await supabase
          .from("ncrs")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("NCR updated");
      } else {
        const { error } = await supabase.from("ncrs").insert([
          {
            ...payload,
            raised_by: authData.user?.id ?? null,
            raised_at: new Date().toISOString(),
          },
        ]);
        if (error) throw error;
        toast.success("Non-Conformance Report (NCR) created");
      }

      setShowForm(false);
      resetForm();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((r) => {
    if (severityFilter !== "all" && r.severity !== severityFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.ncr_number?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.responsible_party?.toLowerCase().includes(q)
    );
  });

  if (projectLoading || loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search NCR#, issue, contractor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Severities</option>
            {Object.keys(SEVERITY_CONFIG).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_CONFIG[s].label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Statuses ({rows.length})</option>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="gap-1.5"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Issue NCR
            </>
          )}
        </Button>
      </div>

      {/* Form Card */}
      {showForm && (
        <Card className="border-rose-200 bg-card shadow-sm">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                  <h3 className="text-sm font-semibold">
                    {editing ? `Edit ${editing.ncr_number}` : "Issue Non-Conformance Report (NCR)"}
                  </h3>
                </div>
                {editing && (
                  <Badge variant="outline" className="text-xs">
                    {editing.status}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">NCR Number *</Label>
                  <Input
                    value={ncrNumber}
                    onChange={(e) => setNcrNumber(e.target.value)}
                    placeholder="e.g. NCR-20260928-001"
                    className="text-xs font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Severity</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as "minor" | "major" | "critical")}
                  >
                    {Object.keys(SEVERITY_CONFIG).map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_CONFIG[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-full space-y-1">
                  <Label className="text-xs font-semibold">Non-Conformance Description *</Label>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Describe specific defect, deviation from approved drawings, or failed test specification..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Responsible Subcontractor / Trade</Label>
                  <Input
                    value={responsibleParty}
                    onChange={(e) => setResponsibleParty(e.target.value)}
                    placeholder="e.g. ABC Steelworks Subcontractor"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Rectification Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {Object.keys(STATUS_CONFIG).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_CONFIG[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Closure Comment / Verification Note</Label>
                  <Input
                    value={closureComment}
                    onChange={(e) => setClosureComment(e.target.value)}
                    placeholder="Required when closing NCR..."
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : editing ? (
                    "Update NCR"
                  ) : (
                    "Issue NCR"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* NCRs Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3">NCR #</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Responsible Subcontractor</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const sev = SEVERITY_CONFIG[r.severity] || {
                  label: r.severity,
                  badge: "bg-slate-100 text-slate-700 border-slate-200",
                  dot: "bg-slate-500",
                };
                const stat = STATUS_CONFIG[r.status] || {
                  label: r.status,
                  badge: "bg-slate-100 text-slate-700 border-slate-200",
                };
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold font-mono text-foreground">
                      {r.ncr_number}
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <p className="line-clamp-2 text-foreground font-medium" title={r.description}>
                        {r.description}
                      </p>
                      {r.closure_comment && (
                        <p className="text-[11px] text-emerald-600 mt-0.5 truncate">
                          Closed: {r.closure_comment}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          sev.badge
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", sev.dot)} />
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.responsible_party ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          <span>{r.responsible_party}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {r.due_date ? r.due_date.slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          stat.badge
                        )}
                      >
                        {stat.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status !== "closed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openBackCharge(r)}
                            title="Issue Subcontractor Back-Charge Ticket"
                            className="h-7 px-2 text-[10px] font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 gap-1"
                          >
                            <DollarSign className="h-3 w-3 text-rose-600" /> Back-Charge
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(r)}
                          className="h-7 px-2 gap-1 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/40 mb-2" />
            <p className="font-medium text-foreground">No non-conformance reports recorded</p>
            <p className="text-xs text-muted-foreground mt-1">
              All quality inspections are adhering to project specifications.
            </p>
          </div>
        )}
      </div>

      {/* Back-Charge Ticket Modal */}
      {backChargeNcr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setBackChargeNcr(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-rose-600" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Issue Subcontractor Back-Charge Ticket
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Direct remedial cost recovery against {backChargeNcr.ncr_number}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackChargeNcr(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBackCharge} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Subcontractor Contract *</Label>
                <select
                  value={bcSubcontractId}
                  onChange={(e) => setBcSubcontractId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                >
                  <option value="">(Select Trade Subcontract)</option>
                  {subcontracts.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.subcontract_no} {sc.scope_of_work ? `- ${sc.scope_of_work}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Ticket #</Label>
                  <Input
                    value={bcChargeNo}
                    onChange={(e) => setBcChargeNo(e.target.value)}
                    className="text-xs font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Deduction Amount ($) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 1500.00"
                    value={bcAmount}
                    onChange={(e) => setBcAmount(e.target.value)}
                    className="text-xs font-mono font-bold text-rose-600"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Back-Charge Category</Label>
                <select
                  value={bcCategory}
                  onChange={(e) => setBcCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {BACK_CHARGE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Reason & Description *</Label>
                <textarea
                  rows={2}
                  value={bcDescription}
                  onChange={(e) => setBcDescription(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Audit & Recovery Notes</Label>
                <Input
                  value={bcNotes}
                  onChange={(e) => setBcNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="rounded-lg bg-rose-50/70 border border-rose-200 p-2.5 text-[11px] text-rose-800">
                This ticket will immediately appear in the <strong>Quantity Surveying</strong> Subcontractor Payment register to deduct from the subcontractor&apos;s upcoming progress claim (IPC).
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBackChargeNcr(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingBc}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {savingBc ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Issuing...
                    </>
                  ) : (
                    "Confirm & Issue Back-Charge"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
