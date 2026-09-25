"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

// Contractor-side bid preparation records shown in the Pre-Contract project view
// (migration 20260925000005_tender_bid_preparation.sql).

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ─── Go/No-Go ────────────────────────────────────────────────────────────────

export interface GoNoGo {
  go_no_go_decision: "go" | "no_go" | null;
  go_no_go_date: string | null;
  go_no_go_rationale: string | null;
}

export function GoNoGoCard({ projectId, value, onChange }: {
  projectId: string;
  value: GoNoGo;
  onChange: (value: GoNoGo) => void;
}) {
  const supabase = createClient();
  const { can } = useTenderPermissions();
  const [rationale, setRationale] = useState(value.go_no_go_rationale ?? "");
  const [saving, setSaving] = useState(false);
  const canDecide = can("tender_go_no_go", "approve");

  async function decide(decision: "go" | "no_go") {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const patch = {
      go_no_go_decision: decision,
      go_no_go_date: new Date().toISOString().slice(0, 10),
      go_no_go_by: user?.id ?? null,
      go_no_go_rationale: rationale.trim() || null,
    };
    const { error } = await supabase.from("project_precontract_details").update(patch).eq("project_id", projectId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange({ go_no_go_decision: decision, go_no_go_date: patch.go_no_go_date, go_no_go_rationale: patch.go_no_go_rationale });
    toast.success(decision === "go" ? "Decision recorded: bid" : "Decision recorded: do not bid");
  }

  const decided = value.go_no_go_decision != null;
  return (
    <div className={cn(
      "rounded-xl border p-5",
      value.go_no_go_decision === "go" ? "border-emerald-200 bg-emerald-50/50" :
      value.go_no_go_decision === "no_go" ? "border-red-200 bg-red-50/50" :
      "border-border",
    )}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Go / No-Go Decision</h3>
        {decided && (
          <span className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            value.go_no_go_decision === "go" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200",
          )}>
            {value.go_no_go_decision === "go" ? "Go — bid" : "No-Go — do not bid"}
            {value.go_no_go_date && ` · ${new Date(value.go_no_go_date).toLocaleDateString()}`}
          </span>
        )}
      </div>
      {!decided && (
        <p className="mt-1 text-xs text-muted-foreground">
          Decide whether to bid before committing estimating effort. Only directors can record the decision.
        </p>
      )}
      {decided && value.go_no_go_rationale && (
        <p className="mt-2 text-sm text-muted-foreground">{value.go_no_go_rationale}</p>
      )}
      {canDecide && (
        <div className="mt-3 space-y-2">
          <textarea
            className={fieldClass}
            rows={2}
            placeholder="Rationale (client, margin, capacity, risk, competition)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => decide("go")}>
              <ThumbsUp className="h-3.5 w-3.5 mr-1.5" /> {decided ? "Change to Go" : "Go"}
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => decide("no_go")}>
              <ThumbsDown className="h-3.5 w-3.5 mr-1.5" /> {decided ? "Change to No-Go" : "No-Go"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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

export function ClarificationsRegister({ tenderId }: { tenderId: string }) {
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
      const { data } = await supabase
        .from("tender_clarifications")
        .select("*")
        .eq("tender_id", tenderId)
        .order("raised_date", { ascending: false })
        .order("query_no", { ascending: false });
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
    const { error } = await supabase.from("tender_clarifications").insert({
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
    const { error } = await supabase
      .from("tender_clarifications")
      .update({
        client_response: response.trim(),
        response_date: new Date().toISOString().slice(0, 10),
        status: "answered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAnsweringId(null);
    setResponse("");
    reload();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("tender_clarifications").delete().eq("id", id);
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
        {can("tender_clarifications", "can_create") && (
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
                  {can("tender_clarifications", "delete") && (
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

// ─── Returnables checklist ───────────────────────────────────────────────────

export interface Returnable {
  id: string;
  item: string;
  category: string;
  is_mandatory: boolean;
  is_ready: boolean;
  notes: string | null;
  sort_order: number;
}

const RETURNABLE_CATEGORIES = ["technical", "commercial", "legal", "other"] as const;

export function ReturnablesChecklist({ tenderId, onChange }: {
  tenderId: string;
  onChange?: (items: Returnable[]) => void;
}) {
  const supabase = createClient();
  const { can } = useTenderPermissions();
  const [items, setItems] = useState<Returnable[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("technical");
  const [newMandatory, setNewMandatory] = useState(true);

  const update = useCallback((next: Returnable[]) => {
    setItems(next);
    onChange?.(next);
  }, [onChange]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("tender_returnables")
        .select("*")
        .eq("tender_id", tenderId)
        .order("sort_order")
        .order("created_at");
      update((data ?? []) as Returnable[]);
      setLoading(false);
    }
    void load();
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!newItem.trim()) return;
    const { data, error } = await supabase
      .from("tender_returnables")
      .insert({
        tender_id: tenderId,
        item: newItem.trim(),
        category: newCategory,
        is_mandatory: newMandatory,
        sort_order: items.length,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    update([...items, data as Returnable]);
    setNewItem("");
  }

  async function toggleReady(item: Returnable) {
    const { error } = await supabase
      .from("tender_returnables")
      .update({ is_ready: !item.is_ready, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    update(items.map((i) => (i.id === item.id ? { ...i, is_ready: !i.is_ready } : i)));
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("tender_returnables").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    update(items.filter((i) => i.id !== id));
  }

  const canEdit = can("tender_returnables", "edit");
  const ready = items.filter((i) => i.is_ready).length;

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Returnables Checklist</h3>
        <p className="text-xs text-muted-foreground">
          Documents and schedules the client requires with the bid · {ready}/{items.length} ready
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">
          No returnables listed. Add each document the instructions to tenderers ask for (form of tender, bid bond,
          method statement, programme, priced BOQ...).
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={i.is_ready}
                disabled={!canEdit}
                onChange={() => toggleReady(i)}
              />
              <span className={cn("flex-1 text-sm", i.is_ready && "text-muted-foreground line-through")}>{i.item}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{i.category}</span>
              {i.is_mandatory && (
                <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                  mandatory
                </span>
              )}
              {can("tender_returnables", "delete") && (
                <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => handleDelete(i.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {can("tender_returnables", "can_create") && (
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
