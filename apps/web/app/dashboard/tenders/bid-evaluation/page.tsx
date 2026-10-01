"use client";

import { useEffect, useState } from "react";
import { deleteTenderAwardRecordById, getBidEvaluationScoreByEvaluationIdAndSubmissionIdAndCriterionName, getTenderWinLossByTenderId, insertBidEvaluation, insertBidEvaluationScore, insertTenderAwardRecord, insertTenderWinLoss, listBidEvaluationScoresByEvaluationId, listBidEvaluationsByTenderId, listTenderAwardRecordsByTenderId, listTenderRegister, listTenderSubmissionsByTenderId, updateBidEvaluationById, updateBidEvaluationScoreById, updateTenderAwardRecordById, updateTenderWinLossById } from "@/lib/qs/qs-queries";
import { useProject } from "@/components/dashboard/project-context";
import { Loader2, Award, Plus, Star, Trash2, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function BidEvaluationPage() {
  const { selectedProjectId } = useProject();
  const [tenders, setTenders] = useState<{id:string,tender_no:string,title:string}[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [evals, setEvals] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [winLoss, setWinLoss] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"eval"|"award"|"winloss">("eval");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Scoring state
  const [expandedEvalId, setExpandedEvalId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreComments, setScoreComments] = useState<Record<string, string>>({});

  // Award form
  const [showAwardForm, setShowAwardForm] = useState(false);
  const [awardForm, setAwardForm] = useState({ submission_id: "", award_no: "", award_date: new Date().toISOString().split("T")[0], award_amount: "0", awardee_name: "", justification: "", conditions: "" });

  // Win/Loss form
  const [showWinLossForm, setShowWinLossForm] = useState(false);
  const [wlForm, setWlForm] = useState({ our_bid_amount: "0", winning_bid_amount: "", awardee_name: "", reason_won: "", reason_lost: "", lesson_learned: "", competitor_count: "0" });

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
      setEvals([]);
      setSubmissions([]);
      setAwards([]);
      setWinLoss(null);
    }
  }, [selectedProjectId, tenders]);

  function loadData(tenderId: string) {
    setSelectedTenderId(tenderId);
    if (!tenderId) return;
    Promise.all([
      listBidEvaluationsByTenderId(tenderId),
      listTenderSubmissionsByTenderId(tenderId),
      listTenderAwardRecordsByTenderId(tenderId),
      getTenderWinLossByTenderId(tenderId),
    ]).then(([e, s, a, w]) => {
      if (e.data) setEvals(e.data);
      if (s.data) setSubmissions(s.data);
      if (a.data) setAwards(a.data);
      if (w.data) setWinLoss(w.data);
      setExpandedEvalId(null);
    });
  }

  // Score key helper
  function scoreKey(evalId: string, subId: string, criterion: string) {
    return `${evalId}_${subId}_${criterion}`;
  }

  async function handleLoadScores(evaluationId: string) {
    if (expandedEvalId === evaluationId) { setExpandedEvalId(null); return; }
    setExpandedEvalId(evaluationId);
    const { data } = await listBidEvaluationScoresByEvaluationId(evaluationId);
    if (data) {
      const map: Record<string, string> = {};
      const comments: Record<string, string> = {};
      for (const s of data) {
        map[scoreKey(evaluationId, s.submission_id, s.criterion_name)] = String(s.score);
        comments[scoreKey(evaluationId, s.submission_id, s.criterion_name)] = s.comments || "";
      }
      setScores(map);
      setScoreComments(comments);
    }
  }

  async function handleSaveScores(evaluationId: string, submissionId: string, criterionName: string) {
    const key = scoreKey(evaluationId, submissionId, criterionName);
    const scoreVal = parseFloat(scores[key]);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) { toast.error("Score must be 0-100"); return; }

    const ev = evals.find((e: any) => e.id === evaluationId);
    const criterion = ev?.criteria?.find((c: any) => c.name === criterionName);
    const weight = criterion?.weight ?? 0;

    const existing = await getBidEvaluationScoreByEvaluationIdAndSubmissionIdAndCriterionName(evaluationId, submissionId, criterionName);

    if (existing.data) {
      await updateBidEvaluationScoreById({
        score: scoreVal, comments: scoreComments[key] || null, updated_at: new Date().toISOString(),
      }, existing.data.id);
    } else {
      await insertBidEvaluationScore({
        evaluation_id: evaluationId, submission_id: submissionId,
        criterion_name: criterionName, score: scoreVal, weight,
        comments: scoreComments[key] || null,
      });
    }
    toast.success("Score saved");
  }

  function calcWeightedTotal(evaluationId: string, submissionId: string) {
    const ev = evals.find((e: any) => e.id === evaluationId);
    if (!ev?.criteria) return 0;
    let total = 0;
    for (const c of ev.criteria) {
      const key = scoreKey(evaluationId, submissionId, c.name);
      const s = parseFloat(scores[key]);
      if (!isNaN(s)) total += (s * (c.weight || 0)) / 100;
    }
    return total;
  }

  // ── Award CRUD ────────────────────────────────────────────────────────────────

  async function handleCreateAward() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await insertTenderAwardRecord({
      tender_id: selectedTenderId, submission_id: awardForm.submission_id,
      award_no: awardForm.award_no, award_date: awardForm.award_date,
      award_amount: parseFloat(awardForm.award_amount) || 0,
      awardee_name: awardForm.awardee_name, justification: awardForm.justification || null,
      conditions: awardForm.conditions || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Award created");
    setShowAwardForm(false);
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteAward(id: string) {
    if (!confirm("Delete this award record?")) return;
    setDeletingId(id);
    const { error } = await deleteTenderAwardRecordById(id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Award deleted");
    setAwards(awards.filter((a: any) => a.id !== id));
    setDeletingId(null);
  }

  async function handleUpdateAwardStatus(id: string, status: string) {
    const { error } = await updateTenderAwardRecordById({ status, updated_at: new Date().toISOString() }, id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Award status: ${status}`);
    loadData(selectedTenderId);
  }

  // ── Win/Loss CRUD ─────────────────────────────────────────────────────────────

  async function handleSaveWinLoss() {
    if (!selectedTenderId) return;
    setSaving(true);
    const payload = {
      tender_id: selectedTenderId,
      our_bid_amount: parseFloat(wlForm.our_bid_amount) || 0,
      winning_bid_amount: wlForm.winning_bid_amount ? parseFloat(wlForm.winning_bid_amount) : null,
      awardee_name: wlForm.awardee_name || null,
      reason_won: wlForm.reason_won || null,
      reason_lost: wlForm.reason_lost || null,
      lesson_learned: wlForm.lesson_learned || null,
      competitor_count: wlForm.competitor_count ? parseInt(wlForm.competitor_count) : null,
    };

    if (winLoss?.id) {
      const { error } = await updateTenderWinLossById({ ...payload, updated_at: new Date().toISOString() }, winLoss.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { error } = await insertTenderWinLoss(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success("Win/Loss analysis saved");
    setShowWinLossForm(false);
    loadData(selectedTenderId);
    setSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bid Evaluation & Award</h1>
        <p className="text-sm text-muted-foreground">Score submissions, compare bids, and manage awards</p>
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
            {(["eval","award","winloss"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                )}>{t === "eval" ? "Evaluations" : t === "award" ? "Awards" : "Win/Loss"}</button>
            ))}
          </div>

          {/* ── EVALUATIONS TAB ── */}
          {activeTab === "eval" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Evaluations</p>
                <Button size="sm" variant="outline" onClick={async () => {
                  const evalNo = `EV-${(evals.length + 1).toString().padStart(3, "0")}`;
                  const { error } = await insertBidEvaluation({
                    tender_id: selectedTenderId, evaluation_no: evalNo, method: "weighted_score",
                  });
                  if (error) { toast.error(error.message); return; }
                  toast.success("Evaluation created");
                  loadData(selectedTenderId);
                }}>
                  <Plus className="mr-1 h-4 w-4" /> New Evaluation
                </Button>
              </div>

              {evals.length === 0 ? (
                <div className="rounded-lg border px-6 py-8 text-center text-muted-foreground text-sm">No evaluations</div>
              ) : (
                evals.map((ev) => {
                  const criteria: { name: string; weight: number }[] = ev.criteria || [];
                  return (
                    <Card key={ev.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2" onClick={() => handleLoadScores(ev.id)}>
                          <div className="flex items-center gap-2 cursor-pointer">
                            <p className="text-sm font-semibold">{ev.evaluation_no} — {ev.method.replace(/_/g, " ")}</p>
                            <span className={cn("text-[10px] rounded-full px-2 py-0.5 font-medium",
                              ev.status === "completed" ? "bg-emerald-50 text-emerald-600" :
                              ev.status === "approved" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                            )}>{ev.status}</span>
                          </div>
                          <div className="flex gap-2">
                            {ev.status === "draft" && (
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); updateBidEvaluationById({ status: "in_progress", updated_at: new Date().toISOString() }, ev.id).then(() => loadData(selectedTenderId)); }}>
                                Start Review
                              </Button>
                            )}
                            {ev.status === "in_progress" && (
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); updateBidEvaluationById({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ev.id).then(() => loadData(selectedTenderId)); }}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                              </Button>
                            )}
                          </div>
                        </div>
                        {ev.recommendation && <p className="text-xs text-muted-foreground mb-2">Recommended: {ev.recommendation}</p>}

                        {/* Scoring matrix */}
                        {expandedEvalId === ev.id && criteria.length > 0 && submissions.length > 0 && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm border border-border rounded-lg">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left px-2 py-1.5 font-medium">Bidder</th>
                                  {criteria.map((c) => (
                                    <th key={c.name} className="text-center px-2 py-1.5 font-medium text-xs">
                                      {c.name}<br /><span className="text-muted-foreground">({c.weight}%)</span>
                                    </th>
                                  ))}
                                  <th className="text-center px-2 py-1.5 font-medium">Weighted<br />Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {submissions.map((sub) => (
                                  <tr key={sub.id}>
                                    <td className="px-2 py-1.5 font-medium text-xs">{sub.bidder_name}</td>
                                    {criteria.map((c) => {
                                      const key = scoreKey(ev.id, sub.id, c.name);
                                      return (
                                        <td key={c.name} className="px-1 py-1.5 text-center">
                                          <div className="flex items-center gap-1 justify-center">
                                            <input type="number" min="0" max="100"
                                              value={scores[key] ?? ""}
                                              onChange={(e) => setScores({...scores, [key]: e.target.value})}
                                              className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs text-center" />
                                            <button onClick={() => handleSaveScores(ev.id, sub.id, c.name)}
                                              className="text-muted-foreground hover:text-primary">
                                              <Save className="h-3 w-3" />
                                            </button>
                                          </div>
                                          <input placeholder="comment"
                                            value={scoreComments[key] ?? ""}
                                            onChange={(e) => setScoreComments({...scoreComments, [key]: e.target.value})}
                                            className="w-full mt-0.5 rounded border-0 bg-transparent px-1 text-[10px] text-muted-foreground placeholder:text-[10px]" />
                                        </td>
                                      );
                                    })}
                                    <td className="px-2 py-1.5 text-center font-semibold text-xs">
                                      {calcWeightedTotal(ev.id, sub.id).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {expandedEvalId === ev.id && criteria.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-2">No criteria defined for this evaluation</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}

              {submissions.length > 0 && expandedEvalId === null && (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Submissions for this tender</p>
                  <div className="space-y-1">
                    {submissions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                        <span className="flex-1">{s.bidder_name}</span>
                        <span className="font-semibold">${Number(s.bid_amount).toLocaleString()}</span>
                        <span className={cn("text-[10px] rounded-full px-2 py-0.5",
                          s.submission_status === "responsive" ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-600"
                        )}>{s.submission_status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AWARDS TAB ── */}
          {activeTab === "award" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Awards</p>
                <Button size="sm" variant="outline" onClick={() => setShowAwardForm(!showAwardForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Create Award
                </Button>
              </div>

              {showAwardForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium">Submitting Bidder *</label>
                        <select value={awardForm.submission_id} onChange={e => {
                          const sub = submissions.find((s: any) => s.id === e.target.value);
                          setAwardForm({...awardForm, submission_id: e.target.value, awardee_name: sub?.bidder_name || ""});
                        }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                          <option value="">Select bidder...</option>
                          {submissions.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.bidder_name} — ${Number(s.bid_amount).toLocaleString()}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1"><label className="text-xs font-medium">Award No *</label><input value={awardForm.award_no} onChange={e => setAwardForm({...awardForm, award_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Award Date</label><input type="date" value={awardForm.award_date} onChange={e => setAwardForm({...awardForm, award_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Award Amount *</label><input type="number" value={awardForm.award_amount} onChange={e => setAwardForm({...awardForm, award_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Awardee Name</label><input value={awardForm.awardee_name} onChange={e => setAwardForm({...awardForm, awardee_name: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Justification</label><textarea value={awardForm.justification} onChange={e => setAwardForm({...awardForm, justification: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Conditions</label><textarea value={awardForm.conditions} onChange={e => setAwardForm({...awardForm, conditions: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAwardForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateAward} disabled={saving || !awardForm.submission_id || !awardForm.award_no.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {awards.length === 0 && !showAwardForm ? (
                <div className="rounded-lg border px-6 py-12 text-center text-sm text-muted-foreground">No awards recorded for this tender</div>
              ) : (
                awards.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="flex items-center gap-4 p-3">
                      <Star className="h-5 w-5 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{a.award_no} — {a.awardee_name}</p>
                        <p className="text-xs text-muted-foreground">{a.award_date} · {a.status.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={a.status} onChange={(e) => handleUpdateAwardStatus(a.id, e.target.value)}
                          className="rounded border border-border bg-background px-2 py-1 text-xs">
                          <option value="pending_acceptance">Pending Acceptance</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="awarded">Awarded</option>
                          <option value="contract_signed">Contract Signed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <p className="text-sm font-semibold">${Number(a.award_amount).toLocaleString()}</p>
                        <button onClick={() => handleDeleteAward(a.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === a.id}>
                          {deletingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── WIN/LOSS TAB ── */}
          {activeTab === "winloss" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Win / Loss Analysis</p>
                <Button size="sm" variant="outline" onClick={() => setShowWinLossForm(!showWinLossForm)}>
                  <Plus className="mr-1 h-4 w-4" /> {winLoss ? "Edit" : "Add Analysis"}
                </Button>
              </div>

              {showWinLossForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-xs font-medium">Our Bid Amount *</label><input type="number" value={wlForm.our_bid_amount} onChange={e => setWlForm({...wlForm, our_bid_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Winning Bid Amount</label><input type="number" value={wlForm.winning_bid_amount} onChange={e => setWlForm({...wlForm, winning_bid_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Awardee Name</label><input value={wlForm.awardee_name} onChange={e => setWlForm({...wlForm, awardee_name: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Competitor Count</label><input type="number" value={wlForm.competitor_count} onChange={e => setWlForm({...wlForm, competitor_count: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Reason Won</label><textarea value={wlForm.reason_won} onChange={e => setWlForm({...wlForm, reason_won: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Reason Lost</label><textarea value={wlForm.reason_lost} onChange={e => setWlForm({...wlForm, reason_lost: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Lesson Learned</label><textarea value={wlForm.lesson_learned} onChange={e => setWlForm({...wlForm, lesson_learned: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowWinLossForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveWinLoss} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!showWinLossForm && !winLoss && (
                <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  No win/loss analysis recorded yet. Click "Add Analysis" to begin.
                </div>
              )}

              {!showWinLossForm && winLoss && (
                <Card>
                  <CardContent className="p-4">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><dt className="text-muted-foreground">Our Bid</dt><dd className="font-medium">${Number(winLoss.our_bid_amount).toLocaleString()}</dd></div>
                      <div><dt className="text-muted-foreground">Winner Bid</dt><dd className="font-medium">{winLoss.winning_bid_amount ? `$${Number(winLoss.winning_bid_amount).toLocaleString()}` : "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Awardee</dt><dd className="font-medium">{winLoss.awardee_name || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Competitors</dt><dd className="font-medium">{winLoss.competitor_count ?? "—"}</dd></div>
                      {winLoss.reason_won && <div className="col-span-2"><dt className="text-muted-foreground">Why We Won</dt><dd className="font-medium">{winLoss.reason_won}</dd></div>}
                      {winLoss.reason_lost && <div className="col-span-2"><dt className="text-muted-foreground">Why We Lost</dt><dd className="font-medium">{winLoss.reason_lost}</dd></div>}
                      {winLoss.lesson_learned && <div className="col-span-2"><dt className="text-muted-foreground">Lesson Learned</dt><dd className="font-medium">{winLoss.lesson_learned}</dd></div>}
                    </dl>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {!selectedTenderId && (
        <div className="rounded-lg border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          <Award className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
          <p>Select a tender to view evaluations and awards</p>
        </div>
      )}
    </div>
  );
}
