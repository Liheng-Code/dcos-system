"use client";

import { useEffect, useState } from "react";
import { deleteTenderAddendaById, deleteTenderInvitationById, insertTenderAddenda, insertTenderInvitation, listTenderAddendaByTenderId, listTenderInvitationsByTenderIdOrderedByInvitedDate, listTenderRegister, updateTenderInvitationById } from "@/lib/qs/qs-queries";
import { useProject } from "@/components/dashboard/project-context";
import { Loader2, Plus, Trash2, Send, FileWarning, Check, X, Clock } from "lucide-react";
import { ClarificationsRegister } from "@/components/project/projects/precontract-bid-prep";
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
  const { selectedProjectId } = useProject();
  const [tenders, setTenders] = useState<{id:string,tender_no:string,title:string}[]>([]);
  const [tab, setTab] = useState<Tab>("invitations");
  const [loading, setLoading] = useState(true);

  // Data state
  const [invitations, setInvitations] = useState<any[]>([]);
  const [addenda, setAddenda] = useState<any[]>([]);

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

  useEffect(() => {
    let query = listTenderRegister("id,tender_no,title");
    if (selectedProjectId) query = query.eq("project_id", selectedProjectId);
    query.then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedTenderId && tenders.length > 0 && !tenders.find(t => t.id === selectedTenderId)) {
      setSelectedTenderId("");
      setInvitations([]);
      setAddenda([]);
    }
  }, [selectedProjectId, tenders]);

  function loadData(tenderId: string) {
    setSelectedTenderId(tenderId);
    if (!tenderId) return;
    Promise.all([
      listTenderInvitationsByTenderIdOrderedByInvitedDate(tenderId),
      listTenderAddendaByTenderId(tenderId),
    ]).then(([inv, add]) => {
      if (inv.data) setInvitations(inv.data);
      if (add.data) setAddenda(add.data);
    });
  }

  // ── Invitations CRUD ────────────────────────────────────────────────────────────

  async function handleCreateInvitation() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await insertTenderInvitation({
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
    const { error } = await deleteTenderInvitationById(id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Invitation deleted");
    setInvitations(invitations.filter((i: any) => i.id !== id));
    setDeletingId(null);
  }

  async function handleUpdateInvitationResponse(id: string, response: string) {
    const { error } = await updateTenderInvitationById({ response }, id);
    if (error) { toast.error(error.message); return; }
    toast.success("Response updated");
    loadData(selectedTenderId);
  }

  // ── Addenda CRUD ────────────────────────────────────────────────────────────────

  async function handleCreateAddendum() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await insertTenderAddenda({
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
    const { error } = await deleteTenderAddendaById(id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Addendum deleted");
    setAddenda(addenda.filter((a: any) => a.id !== id));
    setDeletingId(null);
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

          {/* ── TENDER Q&A TAB ── (single clarifications register, shared with the project's Pre-Contract view) */}
          {tab === "qa" && <ClarificationsRegister tenderId={selectedTenderId} />}
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
