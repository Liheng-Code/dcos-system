"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, Send, FileWarning, HelpCircle, Mail, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "invitations" | "addenda" | "qa";

const RESPONSE_OPTIONS = [
  { value: "no_response", label: "No Response" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

export default function TenderManagementPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tenders, setTenders] = useState<{id:string,tender_no:string,title:string}[]>([]);
  const [tab, setTab] = useState<Tab>("invitations");
  const [loading, setLoading] = useState(true);

  // Data state
  const [invitations, setInvitations] = useState<any[]>([]);
  const [addenda, setAddenda] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);

  const [selectedTenderId, setSelectedTenderId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Invitation form
  const [showInvForm, setShowInvForm] = useState(false);
  const [invForm, setInvForm] = useState({
    company_name: "", contact_person: "", email: "",
    invited_date: new Date().toISOString().split("T")[0],
    response_date: "", response: "no_response", bid_submitted: false,
  });

  // Addendum form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    addendum_no: "", title: "", description: "", issue_date: new Date().toISOString().split("T")[0], attachment_url: "",
  });

  // Query form
  const [showQForm, setShowQForm] = useState(false);
  const [qForm, setQForm] = useState({
    query_no: "", question: "", answer: "", asked_by: "",
    is_confidential: false, asked_date: new Date().toISOString().split("T")[0], answered_date: "",
  });

  useEffect(() => {
    supabase.from("tender_register").select("id,tender_no,title").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [supabase]);

  function loadData(tenderId: string) {
    setSelectedTenderId(tenderId);
    if (!tenderId) return;
    Promise.all([
      supabase.from("tender_invitations").select("*").eq("tender_id", tenderId).order("invited_date", { ascending: false }),
      supabase.from("tender_addenda").select("*").eq("tender_id", tenderId).order("issue_date", { ascending: false }),
      supabase.from("tender_queries").select("*").eq("tender_id", tenderId).order("asked_date", { ascending: false }),
    ]).then(([inv, add, q]) => {
      if (inv.data) setInvitations(inv.data);
      if (add.data) setAddenda(add.data);
      if (q.data) setQueries(q.data);
    });
  }

  // ── Invitations CRUD ────────────────────────────────────────────────────────────

  async function handleCreateInvitation() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await supabase.from("tender_invitations").insert({
      tender_id: selectedTenderId,
      company_name: invForm.company_name,
      contact_person: invForm.contact_person || null,
      email: invForm.email || null,
      invited_date: invForm.invited_date || null,
      response_date: invForm.response_date || null,
      response: invForm.response,
      bid_submitted: invForm.bid_submitted,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Invitation added");
    setShowInvForm(false);
    setInvForm({ company_name: "", contact_person: "", email: "", invited_date: new Date().toISOString().split("T")[0], response_date: "", response: "no_response", bid_submitted: false });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteInvitation(id: string) {
    if (!confirm("Delete this invitation?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("tender_invitations").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Invitation deleted");
    setInvitations(invitations.filter((i: any) => i.id !== id));
    setDeletingId(null);
  }

  async function handleUpdateInvitationResponse(id: string, response: string) {
    const { error } = await supabase.from("tender_invitations").update({ response }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Response updated");
    loadData(selectedTenderId);
  }

  // ── Addenda CRUD ────────────────────────────────────────────────────────────────

  async function handleCreateAddendum() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await supabase.from("tender_addenda").insert({
      tender_id: selectedTenderId,
      addendum_no: addForm.addendum_no,
      title: addForm.title,
      description: addForm.description,
      issue_date: addForm.issue_date || null,
      attachment_url: addForm.attachment_url || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Addendum added");
    setShowAddForm(false);
    setAddForm({ addendum_no: "", title: "", description: "", issue_date: new Date().toISOString().split("T")[0], attachment_url: "" });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteAddendum(id: string) {
    if (!confirm("Delete this addendum?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("tender_addenda").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Addendum deleted");
    setAddenda(addenda.filter((a: any) => a.id !== id));
    setDeletingId(null);
  }

  // ── Tender Q&A CRUD ─────────────────────────────────────────────────────────────

  async function handleCreateQuery() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await supabase.from("tender_queries").insert({
      tender_id: selectedTenderId,
      query_no: qForm.query_no,
      question: qForm.question,
      answer: qForm.answer || null,
      asked_by: qForm.asked_by || null,
      is_confidential: qForm.is_confidential,
      asked_date: qForm.asked_date || null,
      answered_date: qForm.answered_date || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Query added");
    setShowQForm(false);
    setQForm({ query_no: "", question: "", answer: "", asked_by: "", is_confidential: false, asked_date: new Date().toISOString().split("T")[0], answered_date: "" });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteQuery(id: string) {
    if (!confirm("Delete this query?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("tender_queries").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Query deleted");
    setQueries(queries.filter((q: any) => q.id !== id));
    setDeletingId(null);
  }

  async function handleAnswerQuery(id: string, answer: string) {
    const { error } = await supabase.from("tender_queries").update({
      answer,
      answered_date: new Date().toISOString().split("T")[0],
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Answer saved");
    loadData(selectedTenderId);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────────

  const ROW_CLASS = "w-full rounded-lg border border-border px-3 py-2 text-sm bg-background";

  function ResponseBadge(response: string) {
    const map: Record<string, string> = {
      accepted: "bg-green-50 text-green-600",
      declined: "bg-red-50 text-red-600",
      no_response: "bg-gray-50 text-gray-500",
    };
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", map[response] || "bg-gray-50 text-gray-500")}>
        {response === "accepted" ? <Check className="h-3 w-3" /> : response === "declined" ? <X className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {response === "no_response" ? "No Response" : response.charAt(0).toUpperCase() + response.slice(1)}
      </span>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tender Management</h1>
        <p className="text-sm text-muted-foreground">Invitations, addenda, and tender Q&A management</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium shrink-0">Select Tender:</label>
        <select value={selectedTenderId} onChange={(e) => loadData(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-md">
          <option value="">Choose a tender...</option>
          {tenders.map((t) => (<option key={t.id} value={t.id}>{t.tender_no} — {t.title}</option>))}
        </select>
      </div>

      {selectedTenderId && (
        <>
          <div className="flex gap-1 border-b border-border">
            {(["invitations","addenda","qa"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                {t === "invitations" ? "Invitations" : t === "addenda" ? "Addenda" : "Tender Q&A"}
              </button>
            ))}
          </div>

          {/* ── INVITATIONS TAB ── */}
          {tab === "invitations" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{invitations.length} invitation{invitations.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowInvForm(!showInvForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Invitation
                </Button>
              </div>

              {showInvForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Company Name *</label>
                        <input value={invForm.company_name} onChange={e => setInvForm({...invForm, company_name: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Contact Person</label>
                        <input value={invForm.contact_person} onChange={e => setInvForm({...invForm, contact_person: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Email</label>
                        <input type="email" value={invForm.email} onChange={e => setInvForm({...invForm, email: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Invited Date</label>
                        <input type="date" value={invForm.invited_date} onChange={e => setInvForm({...invForm, invited_date: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="bid_submitted" checked={invForm.bid_submitted}
                          onChange={e => setInvForm({...invForm, bid_submitted: e.target.checked})} className="rounded border-border" />
                        <label htmlFor="bid_submitted" className="text-sm">Bid submitted</label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowInvForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateInvitation} disabled={saving || !invForm.company_name.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {invitations.length === 0 && !showInvForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No invitations sent</div>
              ) : (
                invitations.map((inv) => (
                  <Card key={inv.id}>
                    <CardContent className="flex items-center gap-4 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{inv.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.contact_person && `${inv.contact_person}`}{inv.contact_person && inv.email && " · "}
                          {inv.email && <a href={`mailto:${inv.email}`} className="hover:underline">{inv.email}</a>}
                          {inv.invited_date && ` · ${inv.invited_date}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={inv.response} onChange={e => handleUpdateInvitationResponse(inv.id, e.target.value)}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
                          {RESPONSE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                        {ResponseBadge(inv.response)}
                        {inv.bid_submitted && <span className="text-[10px] bg-emerald-50 text-emerald-600 rounded-full px-1.5 py-0.5 font-medium">Bid In</span>}
                      </div>
                      <button onClick={() => handleDeleteInvitation(inv.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === inv.id}>
                        {deletingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── ADDENDA TAB ── */}
          {tab === "addenda" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{addenda.length} addendum{addenda.length !== 1 ? "a" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Addendum
                </Button>
              </div>

              {showAddForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Addendum No *</label>
                        <input value={addForm.addendum_no} onChange={e => setAddForm({...addForm, addendum_no: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Issue Date</label>
                        <input type="date" value={addForm.issue_date} onChange={e => setAddForm({...addForm, issue_date: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Title *</label>
                        <input value={addForm.title} onChange={e => setAddForm({...addForm, title: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Description *</label>
                        <textarea rows={3} value={addForm.description} onChange={e => setAddForm({...addForm, description: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Attachment URL</label>
                        <input value={addForm.attachment_url} onChange={e => setAddForm({...addForm, attachment_url: e.target.value})} className={ROW_CLASS} placeholder="https://..." />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateAddendum} disabled={saving || !addForm.addendum_no.trim() || !addForm.title.trim() || !addForm.description.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {addenda.length === 0 && !showAddForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No addenda issued</div>
              ) : (
                addenda.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <FileWarning className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{a.addendum_no} — {a.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              {a.issue_date && <span className="text-[10px] text-muted-foreground">Issued: {a.issue_date}</span>}
                              {a.attachment_url && (
                                <a href={a.attachment_url} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-blue-600 hover:underline">View Attachment</a>
                              )}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteAddendum(a.id)} className="text-muted-foreground hover:text-red-600 shrink-0 ml-2" disabled={deletingId === a.id}>
                          {deletingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── TENDER Q&A TAB ── */}
          {tab === "qa" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{queries.length} quer{queries.length !== 1 ? "ies" : "y"}</p>
                <Button size="sm" variant="outline" onClick={() => setShowQForm(!showQForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Query
                </Button>
              </div>

              {showQForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Query No *</label>
                        <input value={qForm.query_no} onChange={e => setQForm({...qForm, query_no: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Asked Date</label>
                        <input type="date" value={qForm.asked_date} onChange={e => setQForm({...qForm, asked_date: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Asked By</label>
                        <input value={qForm.asked_by} onChange={e => setQForm({...qForm, asked_by: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Answered Date</label>
                        <input type="date" value={qForm.answered_date} onChange={e => setQForm({...qForm, answered_date: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Question *</label>
                        <textarea rows={2} value={qForm.question} onChange={e => setQForm({...qForm, question: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Answer</label>
                        <textarea rows={2} value={qForm.answer} onChange={e => setQForm({...qForm, answer: e.target.value})} className={ROW_CLASS} />
                      </div>
                      <div className="col-span-2 flex items-center gap-2 pt-1">
                        <input type="checkbox" id="confidential" checked={qForm.is_confidential}
                          onChange={e => setQForm({...qForm, is_confidential: e.target.checked})} className="rounded border-border" />
                        <label htmlFor="confidential" className="text-sm">Confidential (not shared with bidders)</label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowQForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateQuery} disabled={saving || !qForm.query_no.trim() || !qForm.question.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {queries.length === 0 && !showQForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No queries recorded</div>
              ) : (
                queries.map((q) => (
                  <Card key={q.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium bg-purple-50 text-purple-600">
                            <HelpCircle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{q.query_no}</p>
                              {q.is_confidential && (
                                <span className="text-[10px] bg-red-50 text-red-600 rounded-full px-1.5 py-0.5 font-medium">Confidential</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Asked by {q.asked_by || "—"} on {q.asked_date || "—"}</p>
                            <p className="text-sm mt-2">{q.question}</p>

                            {q.answer ? (
                              <div className="mt-2 flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2">
                                <Mail className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-green-700">Answer</p>
                                  <p className="text-xs text-green-700">{q.answer}</p>
                                  {q.answered_date && <p className="text-[10px] text-green-500 mt-0.5">{q.answered_date}</p>}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  placeholder="Write answer..."
                                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                                  id={`answer-${q.id}`}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      const val = (e.target as HTMLInputElement).value.trim();
                                      if (val) handleAnswerQuery(q.id, val);
                                    }
                                  }}
                                />
                                <Button size="sm" variant="outline" className="text-xs h-7"
                                  onClick={() => {
                                    const el = document.getElementById(`answer-${q.id}`) as HTMLInputElement;
                                    if (el?.value.trim()) handleAnswerQuery(q.id, el.value.trim());
                                  }}>Answer</Button>
                              </div>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteQuery(q.id)} className="text-muted-foreground hover:text-red-600 shrink-0 ml-2" disabled={deletingId === q.id}>
                          {deletingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {!selectedTenderId && (
        <div className="rounded-lg border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          <Send className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
          <p>Select a tender above to manage invitations, addenda, and Q&A</p>
        </div>
      )}
    </div>
  );
}
