"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { WORKSTREAMS, workstreamLabel } from "@/lib/qs/tender-lifecycle";
import { deleteTenderClarificationById, deleteTenderReturnableById, insertTenderClarification, insertTenderReturnableReturning, listTenderClarificationsByTenderId, listTenderReturnablesByTenderId, updateTenderClarificationById, updateTenderReturnableById } from "@/lib/project/projects/projects-queries";

// Contractor-side bid preparation registers used by the Pre-Contract project view
// (migrations 20260925000005_tender_bid_preparation.sql, 20260928000002_tender_gates.sql).

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ─── Clarifications register ─────────────────────────────────────────────────

interface Clarification {
  id: string;
  query_no: string;
  category: string;
  question: string;
  raised_date: string;
  status: string;
  client_response: string | null;
  response_date: string | null;
}

const CLARIFICATION_CATEGORIES = ["technical", "commercial", "contractual", "programme", "other"] as const;

export function ClarificationsRegister({ tenderId, readOnly = false }: { tenderId: string; readOnly?: boolean }) {
  const supabase = createClient();
  const { can } = useTenderPermissions();
  const [rows, setRows] = useState<Clarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "technical", question: "" });
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    async function load() {
      const { data } = await listTenderClarificationsByTenderId(tenderId);
      if (data) setRows(data as Clarification[]);
      setLoading(false);
    }
    void load();
  }, [tenderId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!form.question.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    // Next number after the highest existing one, so a deleted query never causes a reused number.
    const lastNo = rows.reduce((max, r) => Math.max(max, parseInt(r.query_no.replace(/\D/g, ""), 10) || 0), 0);
    const queryNo = `Q-${String(lastNo + 1).padStart(3, "0")}`;
    const { error } = await insertTenderClarification({
      tender_id: tenderId,
      query_no: queryNo,
      category: form.category,
      question: form.question.trim(),
      raised_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${queryNo} raised`);
    setForm({ category: "technical", question: "" });
    setShowForm(false);
    reload();
  }

  async function handleAnswer(id: string) {
    if (!response.trim()) return;
    const { error } = await updateTenderClarificationById({
        client_response: response.trim(),
        response_date: new Date().toISOString().slice(0, 10),
        status: "answered",
        updated_at: new Date().toISOString(),
      }, id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAnsweringId(null);
    setResponse("");
    reload();
  }

  async function handleDelete(id: string) {
    const { error } = await deleteTenderClarificationById(id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Clarifications to Client</h3>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "query" : "queries"} · {openCount} awaiting response
          </p>
        </div>
        {!readOnly && can("tender_clarifications", "can_create") && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Raise Query
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <select
            className={fieldClass}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CLARIFICATION_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
          <textarea
            className={fieldClass}
            rows={3}
            placeholder="Question to the client"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving || !form.question.trim()} onClick={handleCreate}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No queries raised.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.query_no} <span className="text-xs font-normal text-muted-foreground capitalize">· {r.category}</span>
                  </p>
                  <p className="text-sm mt-0.5">{r.question}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Raised {new Date(r.raised_date).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    r.status === "open" ? "bg-orange-50 text-orange-700 border-orange-200" :
                    r.status === "answered" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    "bg-muted text-muted-foreground border-border",
                  )}>
                    {r.status}
                  </span>
                  {!readOnly && can("tender_clarifications", "delete") && (
                    <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {r.client_response && (
                <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Client response{r.response_date && ` · ${new Date(r.response_date).toLocaleDateString()}`}:
                  </span>{" "}
                  {r.client_response}
                </div>
              )}
              {r.status === "open" && can("tender_clarifications", "edit") && (
                answeringId === r.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className={fieldClass}
                      rows={2}
                      placeholder="Client response"
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!response.trim()} onClick={() => handleAnswer(r.id)}>Save Response</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAnsweringId(null); setResponse(""); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => { setAnsweringId(r.id); setResponse(""); }}>
                    Record client response
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Returnables checklist (tender compilation) ──────────────────────────────

export interface Returnable {
  id: string;
  item: string;
  category: string;
  is_mandatory: boolean;
  is_ready: boolean;
  notes: string | null;
  sort_order: number;
  workstream_code: string | null;
  returned_at: string | null;
}

const RETURNABLE_CATEGORIES = ["technical", "commercial", "legal", "other"] as const;

export function ReturnablesChecklist({ tenderId, onChange, readOnly = false }: {
  tenderId: string;
  onChange?: (items: Returnable[]) => void;
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const { can } = useTenderPermissions();
  const [items, setItems] = useState<Returnable[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("technical");
  const [newWorkstream, setNewWorkstream] = useState("compilation");
  const [newMandatory, setNewMandatory] = useState(true);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");

  const update = useCallback((next: Returnable[]) => {
    setItems(next);
    onChange?.(next);
  }, [onChange]);

  useEffect(() => {
    async function load() {
      const { data } = await listTenderReturnablesByTenderId(tenderId);
      update((data ?? []) as Returnable[]);
      setLoading(false);
    }
    void load();
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!newItem.trim()) return;
    const { data, error } = await insertTenderReturnableReturning({
        tender_id: tenderId,
        item: newItem.trim(),
        category: newCategory,
        workstream_code: newWorkstream,
        is_mandatory: newMandatory,
        sort_order: items.length,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    update([...items, data as Returnable]);
    setNewItem("");
  }

  async function patch(item: Returnable, fields: Partial<Returnable>) {
    const { error } = await updateTenderReturnableById({ ...fields, updated_at: new Date().toISOString() }, item.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    update(items.map((i) => (i.id === item.id ? { ...i, ...fields } : i)));
    return true;
  }

  // Compliance check "NO → return to responsible team": not ready, with the reason on the item.
  async function returnToTeam(item: Returnable) {
    if (!returnNote.trim()) return;
    if (await patch(item, { is_ready: false, returned_at: new Date().toISOString(), notes: returnNote.trim() })) {
      setReturningId(null);
      setReturnNote("");
    }
  }

  async function handleDelete(id: string) {
    const { error } = await deleteTenderReturnableById(id);
    if (error) {
      toast.error(error.message);
      return;
    }
    update(items.filter((i) => i.id !== id));
  }

  const canEdit = !readOnly && can("tender_returnables", "edit");
  const ready = items.filter((i) => i.is_ready).length;

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Compliance Checklist</h3>
        <p className="text-xs text-muted-foreground">
          Everything the client requires with the bid · {ready}/{items.length} ready
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">
          No returnables listed. They are created with the Go decision; add any others the instructions to tenderers ask for.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={i.is_ready}
                  disabled={!canEdit}
                  onChange={() => patch(i, { is_ready: !i.is_ready, returned_at: i.is_ready ? i.returned_at : null })}
                />
                <span className={cn("flex-1 min-w-40 text-sm", i.is_ready && "text-muted-foreground line-through")}>{i.item}</span>
                {i.workstream_code && <span className="text-[10px] text-muted-foreground">{workstreamLabel(i.workstream_code)}</span>}
                {i.is_mandatory && (
                  <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                    mandatory
                  </span>
                )}
                {canEdit && i.is_ready && (
                  <button type="button" title="Return to responsible team" className="text-muted-foreground hover:text-orange-600"
                    onClick={() => { setReturningId(i.id); setReturnNote(""); }}>
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {!readOnly && can("tender_returnables", "delete") && (
                  <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => handleDelete(i.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {i.returned_at && !i.is_ready && i.notes && (
                <p className="ml-7 mt-1 text-xs text-orange-700">Returned {new Date(i.returned_at).toLocaleDateString()}: {i.notes}</p>
              )}
              {returningId === i.id && (
                <div className="ml-7 mt-2 flex gap-2">
                  <Input className="h-8" placeholder="What must the team fix?" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
                  <Button size="sm" className="h-8" disabled={!returnNote.trim()} onClick={() => returnToTeam(i)}>Return</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setReturningId(null)}>Cancel</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && can("tender_returnables", "can_create") && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 flex-1 min-w-48"
            placeholder="Add a returnable, e.g. Bid bond"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          />
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm capitalize"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          >
            {RETURNABLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={newWorkstream}
            onChange={(e) => setNewWorkstream(e.target.value)}
          >
            {WORKSTREAMS.map((w) => <option key={w.code} value={w.code}>{w.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" className="h-3.5 w-3.5" checked={newMandatory} onChange={(e) => setNewMandatory(e.target.checked)} />
            Mandatory
          </label>
          <Button size="sm" variant="outline" className="h-8" disabled={!newItem.trim()} onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
