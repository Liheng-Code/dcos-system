"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, BadgeCheck, Ban, Building2, ClipboardCheck, FileText, Loader2, RefreshCw, Save, ShieldCheck, Star, Timer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  blacklistSupplier,
  getSupplierPqDashboard,
  getSupplierPqProfile,
  recordSupplierPerformanceScore,
  reviewSupplierPq,
  submitSupplierPq,
  SupplierApprovedTrade,
  SupplierPqDashboard,
  SupplierPqDocument,
  SupplierPqProfile,
  SupplierPqRecord,
  SupplierPqStatus,
  upsertSupplierApprovedTrade,
  upsertSupplierPqDocument,
  upsertSupplierPqRecord,
} from "@/lib/procurement/supplier-prequalification-service";

const STATUS_STYLES: Record<SupplierPqStatus, string> = {
  not_started: "bg-slate-500/10 text-slate-600 border-slate-200",
  draft: "bg-blue-500/10 text-blue-600 border-blue-200",
  submitted: "bg-amber-500/10 text-amber-600 border-amber-200",
  under_review: "bg-violet-500/10 text-violet-600 border-violet-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
  expired: "bg-orange-500/10 text-orange-600 border-orange-200",
  suspended: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  blacklisted: "bg-red-600/10 text-red-700 border-red-200",
};

const DOCUMENT_CATEGORIES = [
  "company_registration",
  "audited_accounts",
  "bank_reference",
  "credit_rating",
  "technical_reference",
  "iso_9001",
  "iso_14001",
  "iso_45001",
  "public_liability",
  "employer_liability",
  "professional_indemnity",
  "plant_insurance",
  "other",
];

function emptyRecord(supplierId: string): Partial<SupplierPqRecord> & { supplier_id: string } {
  return {
    supplier_id: supplierId,
    legal_status: "",
    registration_number: "",
    paid_up_capital: null,
    years_in_business: null,
    audited_accounts_available: false,
    annual_turnover: null,
    credit_rating: "",
    bank_reference: "",
    scope_of_work: "",
    equipment_summary: "",
    key_personnel_summary: "",
    project_references: "",
    quality_certifications: "",
    hse_incident_frequency: null,
    hse_near_miss_rate: null,
    hse_enforcement_history: "",
    insurance_summary: "",
    status: "draft",
    reviewer_notes: "",
    final_score: null,
  };
}

function isExpiring(date: string | null) {
  if (!date) return false;
  const now = new Date();
  const target = new Date(date);
  const diff = (target.getTime() - now.getTime()) / 86400000;
  return diff >= 0 && diff <= 30;
}

function fmtDate(date: string | null) {
  return date ? new Date(date).toLocaleDateString() : "-";
}

export function SupplierPrequalification() {
  const [dashboard, setDashboard] = useState<SupplierPqDashboard | null>(null);
  const [profile, setProfile] = useState<SupplierPqProfile | null>(null);
  const [recordForm, setRecordForm] = useState<Partial<SupplierPqRecord> & { supplier_id: string } | null>(null);
  const [docForm, setDocForm] = useState({ document_category: "company_registration", document_name: "", reference_number: "", expiry_date: "", file_url: "", notes: "" });
  const [tradeForm, setTradeForm] = useState({ trade_category: "", approval_scope: "", approved_until: "", notes: "" });
  const [scoreForm, setScoreForm] = useState({ delivery_score: "", quality_score: "", responsiveness_score: "", commercial_score: "", hse_score: "", notes: "" });
  const [reviewForm, setReviewForm] = useState({ final_score: "", expires_at: "", notes: "" });
  const [blacklistReason, setBlacklistReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  async function loadDashboard(selectedSupplierId?: string) {
    setLoading(true);
    try {
      const next = await getSupplierPqDashboard();
      setDashboard(next);
      const supplierId = selectedSupplierId ?? profile?.supplier.id ?? next.suppliers[0]?.id;
      if (supplierId) await loadProfile(supplierId, false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load supplier prequalification");
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(supplierId: string, showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const next = await getSupplierPqProfile(supplierId);
      setProfile(next);
      setRecordForm(next.record ? { ...next.record } : emptyRecord(supplierId));
      setReviewForm({
        final_score: next.record?.final_score?.toString() ?? next.supplier.pq_score?.toString() ?? "",
        expires_at: next.supplier.pq_expires_at ?? "",
        notes: next.record?.reviewer_notes ?? "",
      });
      setBlacklistReason(next.supplier.blacklist_reason ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load supplier profile");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSuppliers = useMemo(() => {
    const suppliers = dashboard?.suppliers ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter(s =>
      s.supplier_name.toLowerCase().includes(needle) ||
      s.supplier_code.toLowerCase().includes(needle) ||
      (s.supplier_type ?? "").toLowerCase().includes(needle)
    );
  }, [dashboard, query]);

  function updateRecord(field: keyof SupplierPqRecord, value: string | number | boolean | null) {
    setRecordForm(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function saveRecord() {
    if (!recordForm || !profile) return;
    setSaving(true);
    try {
      const saved = await upsertSupplierPqRecord({ ...recordForm, supplier_id: profile.supplier.id, id: recordForm.id });
      toast.success("Prequalification record saved");
      await loadDashboard(saved.supplier_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  async function submitRecord() {
    if (!profile?.record) {
      toast.error("Save the PQ record before submitting");
      return;
    }
    setSaving(true);
    try {
      await submitSupplierPq(profile.supplier.id, profile.record.id);
      toast.success("Supplier PQ submitted for review");
      await loadDashboard(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit PQ");
    } finally {
      setSaving(false);
    }
  }

  async function review(decision: "under_review" | "approved" | "rejected") {
    if (!profile?.record) {
      toast.error("Save the PQ record before review");
      return;
    }
    setSaving(true);
    try {
      await reviewSupplierPq(
        profile.supplier.id,
        profile.record.id,
        decision,
        reviewForm.notes,
        reviewForm.final_score ? Number(reviewForm.final_score) : null,
        reviewForm.expires_at || null,
      );
      toast.success(decision === "approved" ? "Supplier approved" : decision === "rejected" ? "Supplier rejected" : "Marked under review");
      await loadDashboard(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update review");
    } finally {
      setSaving(false);
    }
  }

  async function addDocument() {
    if (!profile || !docForm.document_name.trim()) {
      toast.error("Document name is required");
      return;
    }
    setSaving(true);
    try {
      await upsertSupplierPqDocument({
        supplier_id: profile.supplier.id,
        pq_record_id: profile.record?.id ?? null,
        document_category: docForm.document_category,
        document_name: docForm.document_name,
        reference_number: docForm.reference_number || null,
        expiry_date: docForm.expiry_date || null,
        file_url: docForm.file_url || null,
        notes: docForm.notes || null,
      });
      setDocForm({ document_category: "company_registration", document_name: "", reference_number: "", expiry_date: "", file_url: "", notes: "" });
      toast.success("Document added");
      await loadDashboard(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  }

  async function addTrade() {
    if (!profile || !tradeForm.trade_category.trim()) {
      toast.error("Trade category is required");
      return;
    }
    setSaving(true);
    try {
      await upsertSupplierApprovedTrade({
        supplier_id: profile.supplier.id,
        trade_category: tradeForm.trade_category,
        approval_scope: tradeForm.approval_scope || null,
        approved_until: tradeForm.approved_until || null,
        notes: tradeForm.notes || null,
        status: "active",
      });
      setTradeForm({ trade_category: "", approval_scope: "", approved_until: "", notes: "" });
      toast.success("Approved trade added");
      await loadProfile(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add trade");
    } finally {
      setSaving(false);
    }
  }

  async function addScore() {
    if (!profile) return;
    setSaving(true);
    try {
      await recordSupplierPerformanceScore({
        supplier_id: profile.supplier.id,
        delivery_score: scoreForm.delivery_score ? Number(scoreForm.delivery_score) : null,
        quality_score: scoreForm.quality_score ? Number(scoreForm.quality_score) : null,
        responsiveness_score: scoreForm.responsiveness_score ? Number(scoreForm.responsiveness_score) : null,
        commercial_score: scoreForm.commercial_score ? Number(scoreForm.commercial_score) : null,
        hse_score: scoreForm.hse_score ? Number(scoreForm.hse_score) : null,
        notes: scoreForm.notes || null,
      });
      setScoreForm({ delivery_score: "", quality_score: "", responsiveness_score: "", commercial_score: "", hse_score: "", notes: "" });
      toast.success("Performance score recorded");
      await loadDashboard(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save score");
    } finally {
      setSaving(false);
    }
  }

  async function blacklist() {
    if (!profile || !blacklistReason.trim()) {
      toast.error("Blacklist reason is required");
      return;
    }
    setSaving(true);
    try {
      await blacklistSupplier(profile.supplier.id, blacklistReason);
      toast.success("Supplier blacklisted");
      await loadDashboard(profile.supplier.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to blacklist supplier");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const stats = dashboard ? [
    { label: "Suppliers", value: dashboard.total, icon: Building2, color: "text-blue-600" },
    { label: "Approved", value: dashboard.approved, icon: BadgeCheck, color: "text-emerald-600" },
    { label: "Expiring PQ", value: dashboard.expiringSoon, icon: Timer, color: "text-amber-600" },
    { label: "Documents Due", value: dashboard.documentsExpiringSoon, icon: FileText, color: "text-orange-600" },
    { label: "Blacklisted", value: dashboard.blacklisted, icon: Ban, color: "text-red-600" },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Supplier Prequalification</h1>
          <p className="text-sm text-muted-foreground">Approve supplier capability, documents, trades, expiry, performance, and blacklist status.</p>
        </div>
        <Button variant="outline" onClick={() => loadDashboard(profile?.supplier.id)} disabled={saving} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {stats.map(item => (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-4">
              <item.icon className={`h-5 w-5 ${item.color}`} />
              <p className="mt-2 text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <Input placeholder="Search suppliers..." value={query} onChange={e => setQuery(e.target.value)} />
            <div className="max-h-[720px] overflow-y-auto space-y-2">
              {filteredSuppliers.map(supplier => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => loadProfile(supplier.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${profile?.supplier.id === supplier.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{supplier.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">{supplier.supplier_code} · {supplier.supplier_type ?? "General"}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_STYLES[supplier.pq_status]}>{supplier.pq_status.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Score {supplier.pq_score ?? "-"}/100</span>
                    <span>Expiry {fmtDate(supplier.pq_expires_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {profile && recordForm ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{profile.supplier.supplier_name}</h2>
                    <p className="text-sm text-muted-foreground">{profile.supplier.supplier_code} · {profile.supplier.email ?? "No email"} · {profile.supplier.phone ?? "No phone"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {profile.supplier.pq_expires_at && isExpiring(profile.supplier.pq_expires_at) && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Expiring
                      </Badge>
                    )}
                    <Badge variant="outline" className={STATUS_STYLES[profile.supplier.pq_status]}>{profile.supplier.pq_status.replaceAll("_", " ")}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Registration / Financial</h3>
                    <Button size="sm" onClick={saveRecord} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> Save</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Legal Status" value={recordForm.legal_status ?? ""} onChange={v => updateRecord("legal_status", v)} />
                    <Field label="Registration No." value={recordForm.registration_number ?? ""} onChange={v => updateRecord("registration_number", v)} />
                    <Field label="Years in Business" type="number" value={recordForm.years_in_business ?? ""} onChange={v => updateRecord("years_in_business", v ? Number(v) : null)} />
                    <Field label="Paid-Up Capital" type="number" value={recordForm.paid_up_capital ?? ""} onChange={v => updateRecord("paid_up_capital", v ? Number(v) : null)} />
                    <Field label="Annual Turnover" type="number" value={recordForm.annual_turnover ?? ""} onChange={v => updateRecord("annual_turnover", v ? Number(v) : null)} />
                    <Field label="Credit Rating" value={recordForm.credit_rating ?? ""} onChange={v => updateRecord("credit_rating", v)} />
                  </div>
                  <Field label="Bank Reference" value={recordForm.bank_reference ?? ""} onChange={v => updateRecord("bank_reference", v)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!recordForm.audited_accounts_available} onChange={e => updateRecord("audited_accounts_available", e.target.checked)} />
                    Audited accounts available
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Technical / Quality / HSE</h3>
                  <Field label="Scope of Work" value={recordForm.scope_of_work ?? ""} onChange={v => updateRecord("scope_of_work", v)} />
                  <Field label="Equipment Summary" value={recordForm.equipment_summary ?? ""} onChange={v => updateRecord("equipment_summary", v)} />
                  <Field label="Key Personnel" value={recordForm.key_personnel_summary ?? ""} onChange={v => updateRecord("key_personnel_summary", v)} />
                  <Field label="Project References" value={recordForm.project_references ?? ""} onChange={v => updateRecord("project_references", v)} />
                  <Field label="Quality Certifications" value={recordForm.quality_certifications ?? ""} onChange={v => updateRecord("quality_certifications", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="HSE IFR" type="number" value={recordForm.hse_incident_frequency ?? ""} onChange={v => updateRecord("hse_incident_frequency", v ? Number(v) : null)} />
                    <Field label="Near Miss Rate" type="number" value={recordForm.hse_near_miss_rate ?? ""} onChange={v => updateRecord("hse_near_miss_rate", v ? Number(v) : null)} />
                  </div>
                  <Field label="Insurance Summary" value={recordForm.insurance_summary ?? ""} onChange={v => updateRecord("insurance_summary", v)} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DocumentsPanel documents={profile.documents} form={docForm} setForm={setDocForm} addDocument={addDocument} saving={saving} />
              <TradesPanel trades={profile.trades} form={tradeForm} setForm={setTradeForm} addTrade={addTrade} saving={saving} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> Approval</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Final Score" type="number" value={reviewForm.final_score} onChange={v => setReviewForm(prev => ({ ...prev, final_score: v }))} />
                    <Field label="Approval Expiry" type="date" value={reviewForm.expires_at} onChange={v => setReviewForm(prev => ({ ...prev, expires_at: v }))} />
                  </div>
                  <Field label="Reviewer Notes" value={reviewForm.notes} onChange={v => setReviewForm(prev => ({ ...prev, notes: v }))} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={submitRecord} disabled={saving}>Submit</Button>
                    <Button variant="outline" onClick={() => review("under_review")} disabled={saving}>Under Review</Button>
                    <Button onClick={() => review("approved")} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">Approve</Button>
                    <Button variant="destructive" onClick={() => review("rejected")} disabled={saving}>Reject</Button>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <Field label="Blacklist Reason" value={blacklistReason} onChange={setBlacklistReason} />
                    <Button variant="destructive" onClick={blacklist} disabled={saving} className="gap-2"><Ban className="h-4 w-4" /> Blacklist Supplier</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Star className="h-4 w-4" /> Performance Scoring</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {(["delivery_score", "quality_score", "responsiveness_score", "commercial_score", "hse_score"] as const).map(field => (
                      <Field key={field} label={field.replace("_score", "").replace("_", " ")} type="number" value={scoreForm[field]} onChange={v => setScoreForm(prev => ({ ...prev, [field]: v }))} />
                    ))}
                  </div>
                  <Field label="Score Notes" value={scoreForm.notes} onChange={v => setScoreForm(prev => ({ ...prev, notes: v }))} />
                  <Button onClick={addScore} disabled={saving}>Record Score</Button>
                  <div className="space-y-2">
                    {profile.scores.map(score => (
                      <div key={score.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{score.overall_score ?? "-"} / 100</span>
                          <span className="text-xs text-muted-foreground">{fmtDate(score.scored_at)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{score.notes ?? "No notes"}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No suppliers found.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="capitalize">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function DocumentsPanel({ documents, form, setForm, addDocument, saving }: {
  documents: SupplierPqDocument[];
  form: { document_category: string; document_name: string; reference_number: string; expiry_date: string; file_url: string; notes: string };
  setForm: Dispatch<SetStateAction<{ document_category: string; document_name: string; reference_number: string; expiry_date: string; file_url: string; notes: string }>>;
  addDocument: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documents / Certificates</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.document_category} onChange={e => setForm(prev => ({ ...prev, document_category: e.target.value }))}>
              {DOCUMENT_CATEGORIES.map(category => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
            </select>
          </div>
          <Field label="Document Name" value={form.document_name} onChange={v => setForm(prev => ({ ...prev, document_name: v }))} />
          <Field label="Reference No." value={form.reference_number} onChange={v => setForm(prev => ({ ...prev, reference_number: v }))} />
          <Field label="Expiry Date" type="date" value={form.expiry_date} onChange={v => setForm(prev => ({ ...prev, expiry_date: v }))} />
        </div>
        <Field label="File URL" value={form.file_url} onChange={v => setForm(prev => ({ ...prev, file_url: v }))} />
        <Button onClick={addDocument} disabled={saving}>Add Document</Button>
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{doc.document_name}</span>
                <Badge variant="outline" className={isExpiring(doc.expiry_date) ? "bg-amber-500/10 text-amber-700 border-amber-200" : ""}>{doc.verification_status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{doc.document_category.replaceAll("_", " ")} · expires {fmtDate(doc.expiry_date)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TradesPanel({ trades, form, setForm, addTrade, saving }: {
  trades: SupplierApprovedTrade[];
  form: { trade_category: string; approval_scope: string; approved_until: string; notes: string };
  setForm: Dispatch<SetStateAction<{ trade_category: string; approval_scope: string; approved_until: string; notes: string }>>;
  addTrade: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Approved Trades</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade Category" value={form.trade_category} onChange={v => setForm(prev => ({ ...prev, trade_category: v }))} />
          <Field label="Approved Until" type="date" value={form.approved_until} onChange={v => setForm(prev => ({ ...prev, approved_until: v }))} />
        </div>
        <Field label="Approval Scope" value={form.approval_scope} onChange={v => setForm(prev => ({ ...prev, approval_scope: v }))} />
        <Button onClick={addTrade} disabled={saving}>Add Trade</Button>
        <div className="space-y-2">
          {trades.map(trade => (
            <div key={trade.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{trade.trade_category}</span>
                <Badge variant="outline">{trade.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{trade.approval_scope ?? "No scope"} · until {fmtDate(trade.approved_until)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
