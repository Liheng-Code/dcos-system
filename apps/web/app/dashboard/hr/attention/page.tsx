"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REVIEW_KIND_LABEL, SETUP_GAP_LABEL, type ReviewKind } from "@/lib/hr/attention";
import type { AttentionData } from "@/lib/hr/attention-service";
import { listProfiles } from "@/lib/hr/hr-queries";

const selectCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const TELEGRAM_REASON: Record<string, string> = {
  no_match: "No employee has this phone number",
  multiple_match: "Several employees share this phone number",
  already_linked: "The matching employee is already linked to another Telegram account",
};
const LEAVE_WHY: Record<string, string> = {
  cancelled_after_approval: "Cancelled after approval: payroll may need reversing",
  approved_after_payroll_lock: "Approved after payroll was locked: that payroll missed it",
};

function Section({ title, description, count, children }: { title: string; description: string; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title} <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{count === 0 ? <p className="flex items-center gap-1 text-sm text-muted-foreground"><Check className="h-4 w-4" /> Nothing to do here.</p> : children}</CardContent>
    </Card>
  );
}

export default function AttentionPage() {
  const [data, setData] = useState<AttentionData | null>(null);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<ReviewKind | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/attention");
    const body = await res.json();
    if (!res.ok) toast.error(body.error ?? "Could not load");
    else { setData(body); setSelected(new Set()); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    listProfiles("id, full_name").then(({ data: rows }) => setPeople(((rows ?? []) as unknown as { id: string; full_name: string }[]).sort((a, b) => a.full_name.localeCompare(b.full_name))));
  }, []);

  async function act(payload: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true);
    const res = await fetch("/api/hr/attention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.error(body.error ?? "Failed"); return false; }
    toast.success(success);
    await load();
    return true;
  }

  const reviews = useMemo(() => (data?.reviews ?? []).filter((r) => !kind || r.kinds.includes(kind)), [data, kind]);
  const kindCounts = useMemo(() => {
    const counts: Partial<Record<ReviewKind, number>> = {};
    for (const r of data?.reviews ?? []) for (const k of r.kinds) counts[k] = (counts[k] ?? 0) + 1;
    return counts;
  }, [data]);
  const allShownSelected = reviews.length > 0 && reviews.every((r) => selected.has(r.id));

  async function resolve() {
    if (selected.size === 0) return;
    if (!note.trim()) { toast.error("Add a note: it stays on record against these days."); return; }
    if (await act({ action: "resolve_days", ids: [...selected], note }, `${selected.size} day(s) resolved`)) setNote("");
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <div className="p-6 text-muted-foreground">Could not load the inbox.</div>;

  const total = data.setup.length + data.reviewTotal + data.telegram.length + data.leave.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Needs Attention</h2>
          <p className="text-muted-foreground">
            {total === 0 ? "Everything matched automatically." : "Only what could not be matched automatically is listed here."}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
      </div>

      <Section title="Attendance days to review" count={data.reviewTotal} description="Flagged while building daily attendance. Payroll cannot proceed while a day in its month is unresolved: fix the cause, or accept the day with a note.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as ReviewKind | "")}>
            <option value="">All reasons</option>
            {(Object.keys(kindCounts) as ReviewKind[]).map((k) => <option key={k} value={k}>{REVIEW_KIND_LABEL[k]} ({kindCounts[k]})</option>)}
          </select>
          <input className={`${selectCls} min-w-64 flex-1`} placeholder="Note (required to resolve)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={resolve} disabled={busy || selected.size === 0}>Resolve {selected.size || ""} selected</Button>
        </div>
        {data.reviewTotal > data.reviews.length && <p className="mb-2 text-xs text-muted-foreground">Showing the latest {data.reviews.length} of {data.reviewTotal}.</p>}
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 p-2"><input type="checkbox" aria-label="Select all shown" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? new Set() : new Set(reviews.map((r) => r.id)))} /></th>
              <th className="p-2">Date</th><th className="p-2">Employee</th><th className="p-2">Status</th><th className="p-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-2"><input type="checkbox" aria-label={`Select ${r.fullName} ${r.workDate}`} checked={selected.has(r.id)} onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                <td className="p-2 whitespace-nowrap">{format(parseISO(r.workDate), "EEE dd MMM")}</td>
                <td className="p-2"><div className="font-medium">{r.fullName ?? "-"}</div><div className="text-xs text-muted-foreground">{r.employeeCode}</div></td>
                <td className="p-2"><Badge variant="outline">{r.status.toLowerCase().replace(/_/g, " ")}</Badge></td>
                <td className="p-2 text-muted-foreground">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Employees with gaps" count={data.setup.length} description="Missing information payroll or attendance needs. Rules fill most of it: set categories under Classify, define rules under Assignment Rules, then run the preview.">
        <div className="mb-3 flex gap-2 text-sm">
          <Link className="underline" href="/dashboard/hr/employees/classify">Classify employees</Link>
          <Link className="underline" href="/dashboard/hr/organization/assignment-rules">Assignment rules</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Employee</th><th className="p-2">Missing</th><th className="p-2" /></tr></thead>
          <tbody>
            {data.setup.map((s) => (
              <tr key={s.employeeId} className="border-b last:border-0 align-top">
                <td className="p-2"><div className="font-medium">{s.fullName ?? "-"}</div><div className="text-xs text-muted-foreground">{s.employeeCode}</div></td>
                <td className="p-2">{s.gaps.map((g) => <Badge key={g} variant="secondary" className="mr-1 mb-1">{SETUP_GAP_LABEL[g]}</Badge>)}</td>
                <td className="p-2 text-right"><Link className="underline" href={`/dashboard/hr/employees/${s.employeeId}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Telegram accounts to link" count={data.telegram.length} description="People who shared their phone number with the bot but could not be matched to exactly one employee.">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Telegram</th><th className="p-2">Why</th><th className="p-2">Link to</th><th className="p-2" /></tr></thead>
          <tbody>
            {data.telegram.map((t) => {
              const options = t.candidates.length > 0 ? t.candidates.map((c) => ({ id: c.id, full_name: c.fullName ?? c.id })) : people;
              const choice = linkChoice[t.id] ?? "";
              return (
                <tr key={t.id} className="border-b last:border-0 align-top">
                  <td className="p-2"><div className="font-medium">{t.telegramName ?? "-"}{t.telegramUsername ? ` (@${t.telegramUsername})` : ""}</div><div className="text-xs text-muted-foreground">{t.phone}</div></td>
                  <td className="p-2 text-muted-foreground">{TELEGRAM_REASON[t.reason] ?? t.reason}</td>
                  <td className="p-2">
                    <select className={selectCls} value={choice} onChange={(e) => setLinkChoice((c) => ({ ...c, [t.id]: e.target.value }))} aria-label="Employee">
                      <option value="">Choose employee</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                    </select>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Button size="sm" disabled={!choice || busy} onClick={() => act({ action: "telegram_link", request_id: t.id, employee_id: choice }, "Telegram linked")}>Link</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: "telegram_dismiss", request_id: t.id }, "Dismissed")}>Dismiss</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Leave changed after payroll" count={data.leave.length} description="Leave that a locked payroll did not account for. Make the payroll adjustment, then mark it handled.">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Employee</th><th className="p-2">Leave</th><th className="p-2">Why</th><th className="p-2" /></tr></thead>
          <tbody>
            {data.leave.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="p-2 font-medium">{l.fullName ?? "-"}</td>
                <td className="p-2">{l.leaveType ?? "Leave"}, {format(parseISO(l.startDate), "dd MMM")} – {format(parseISO(l.endDate), "dd MMM yyyy")}</td>
                <td className="p-2 text-muted-foreground">{LEAVE_WHY[l.why]}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "leave_reversal_handled", id: l.id }, "Marked handled")}>Mark handled</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
