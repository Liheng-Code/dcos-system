"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FilePlus2, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listDrawings, type QtoDrawing } from "@/lib/qs/qto-service";
import {
  createSession, getDashboard, getProfileNames, listRulesets, listSessions, listTenderRevisions,
  type QtoDashboard, type RevisionOption, type RulesetWithVersions, type SessionListRow,
} from "@/lib/qs/qto/session-service";
import { VERSION_STATUSES, VERSION_STATUS_LABEL, type VersionStatus } from "@/lib/qs/qto/workflow";
import { VersionStatusBadge } from "@/components/qs/qto/qto-session-workspace";

const fieldCls = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

export function QtoSessionsTab({ tenderId, canCreate }: { tenderId: string; canCreate: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<SessionListRow[]>([]);
  const [dash, setDash] = useState<QtoDashboard | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | VersionStatus>("all");
  const [trade, setTrade] = useState("all");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSessions(tenderId);
      setRows(list);
      const [d, n] = await Promise.all([
        getDashboard(list),
        getProfileNames(list.flatMap((s) => [s.responsible_qs, s.created_by]).filter((x): x is string => !!x)),
      ]);
      setDash(d);
      setNames(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const trades = useMemo(() => [...new Set(rows.map((r) => r.trade).filter((t): t is string => !!t))].sort(), [rows]);
  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && ![r.session_code, r.name, r.trade, r.building].some((s) => s?.toLowerCase().includes(q))) return false;
    if (status !== "all" && r.current_version?.status !== status) return false;
    if (trade !== "all" && r.trade !== trade) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {dash && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {([
            ["Sessions", dash.sessions],
            ["Draft", dash.byStatus.DRAFT],
            ["In progress", dash.byStatus.IN_PROGRESS + dash.byStatus.CHANGES_REQUESTED],
            ["Awaiting review", dash.byStatus.SUBMITTED_FOR_REVIEW],
            ["Approved, not published", dash.byStatus.APPROVED],
            ["Published", dash.byStatus.PUBLISHED],
            ["Open blocking issues", dash.openBlocking],
            ["Provisional items", dash.provisionalItems],
          ] as const).map(([label, n]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{n}</p>
            </div>
          ))}
        </div>
      )}
      {dash && dash.failedTransfers.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Recent failed transfers to the BOQ</p>
          <ul>{dash.failedTransfers.map((t) => <li key={t.id}>{new Date(t.created_at).toLocaleString()} — {t.error?.replace(/^QTO_[A-Z_]+:\s*/, "")}</li>)}</ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search sessions" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">All statuses</option>
          {VERSION_STATUSES.map((s) => <option key={s} value={s}>{VERSION_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade">
          <option value="all">All trades</option>
          {trades.map((t) => <option key={t}>{t}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => void load()} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        {canCreate && <Button className="ml-auto" onClick={() => setCreating(true)}><FilePlus2 className="mr-1 h-4 w-4" /> New session</Button>}
      </div>

      {loading ? <Skeleton className="h-40 w-full" /> : error ? (
        <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No take-off sessions for this tender yet." : "No sessions match the filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Session</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2">Trade</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Responsible QS</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Latest publication</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => router.push(`/dashboard/qto/sessions/${r.id}`)}>
                  <td className="px-3 py-2 font-mono text-xs">{r.session_code}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{r.purpose === "TENDER" ? "Tender" : "Construction"}</td>
                  <td className="px-3 py-2 text-xs">{r.trade ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">v{r.current_version?.version_no ?? "—"}</td>
                  <td className="px-3 py-2">{r.current_version && <VersionStatusBadge status={r.current_version.status} />}</td>
                  <td className="px-3 py-2 text-xs">{names[r.responsible_qs ?? ""] ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.current_version?.updated_at ?? r.updated_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-xs">{r.latest_publication ? `${new Date(r.latest_publication.published_at).toLocaleDateString()} · ${r.latest_publication.item_count} items` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateSessionDialog tenderId={tenderId} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/dashboard/qto/sessions/${id}`)} />
      )}
    </div>
  );
}

function CreateSessionDialog({ tenderId, onClose, onCreated }: { tenderId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [drawings, setDrawings] = useState<QtoDrawing[]>([]);
  const [revisions, setRevisions] = useState<RevisionOption[]>([]);
  const [rulesets, setRulesets] = useState<RulesetWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", trade: "", building: "", scope: "", description: "", drawingId: "", revisionId: "", rulesetVersionId: "" });

  useEffect(() => {
    void Promise.all([listDrawings(tenderId).then((r) => r.data ?? []), listTenderRevisions(tenderId), listRulesets()])
      .then(([d, r, s]) => {
        setDrawings(d);
        setRevisions(r);
        setRulesets(s);
        const firstApproved = s.flatMap((x) => x.versions).filter((v) => v.status === "approved").at(-1);
        if (firstApproved) setF((p) => ({ ...p, rulesetVersionId: firstApproved.id }));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load drawings"))
      .finally(() => setLoading(false));
  }, [tenderId]);

  const drawing = drawings.find((d) => d.id === f.drawingId) ?? null;
  const revs = revisions.filter((r) => r.drawing_id === f.drawingId);
  const rev = revs.find((r) => r.id === f.revisionId) ?? null;
  const ruleOptions = rulesets.flatMap((s) => s.versions.filter((v) => v.status === "approved").map((v) => ({ id: v.id, label: `${s.code} v${v.version_no} — ${s.name}` })));
  const ruleLabel = ruleOptions.find((r) => r.id === f.rulesetVersionId)?.label;
  const suggestedName = drawing && rev ? `${f.trade || drawing.discipline || "Trade"} – ${drawing.drawing_no} – Rev ${rev.revision}` : "";
  const valid = !!f.revisionId && !!f.rulesetVersionId && (f.name.trim() || suggestedName);

  async function create() {
    setBusy(true);
    try {
      const id = await createSession({
        tenderId, name: f.name.trim() || suggestedName, drawingRevisionId: f.revisionId, rulesetVersionId: f.rulesetVersionId,
        trade: f.trade || drawing?.discipline || null, building: f.building || drawing?.building || null,
        description: f.description || null, scope: f.scope || null,
      });
      toast.success("Session created");
      onCreated(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the session");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{step === "form" ? "New take-off session" : "Confirm the new session"}</DialogTitle>
          <DialogDescription>
            A session measures one exact drawing revision with one approved ruleset. It starts as version 1 in Draft.
          </DialogDescription>
        </DialogHeader>
        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : step === "form" ? (
          <div className="grid gap-4 overflow-y-auto text-sm">
            <section className="grid gap-2">
              <p className="text-xs font-semibold">1 · Purpose</p>
              <p className="rounded-md bg-muted px-2 py-1 text-xs">Tender take-off (construction remeasurement comes in a later release).</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs">Trade / discipline<Input value={f.trade} placeholder={drawing?.discipline ?? "e.g. STR"} onChange={(e) => setF({ ...f, trade: e.target.value })} /></label>
                <label className="grid gap-1 text-xs">Building<Input value={f.building} placeholder={drawing?.building ?? "e.g. BA"} onChange={(e) => setF({ ...f, building: e.target.value })} /></label>
              </div>
            </section>
            <section className="grid gap-2">
              <p className="text-xs font-semibold">2 · Source</p>
              {drawings.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">This tender has no drawings yet. Register one on the Drawings tab first.</p>
              ) : (
                <div className="grid grid-cols-[1fr_160px] gap-2">
                  <select className={fieldCls} value={f.drawingId} onChange={(e) => setF({ ...f, drawingId: e.target.value, revisionId: "" })} aria-label="Drawing">
                    <option value="">Drawing…</option>
                    {drawings.map((d) => <option key={d.id} value={d.id}>{d.drawing_no} — {d.title}</option>)}
                  </select>
                  <select className={fieldCls} value={f.revisionId} disabled={!f.drawingId} onChange={(e) => setF({ ...f, revisionId: e.target.value })} aria-label="Revision">
                    <option value="">Exact revision…</option>
                    {revs.map((r) => <option key={r.id} value={r.id}>Rev {r.revision} · {r.status}</option>)}
                  </select>
                </div>
              )}
              {rev && rev.status !== "current" && <p className="text-xs text-amber-700 dark:text-amber-300">Rev {rev.revision} is {rev.status}; the latest revision is not substituted automatically.</p>}
              {rev && !rev.pdf_path && !rev.file_path?.toLowerCase().endsWith(".pdf") && <p className="text-xs text-amber-700 dark:text-amber-300">This revision has no PDF; on-screen measurement needs one.</p>}
            </section>
            <section className="grid gap-2">
              <p className="text-xs font-semibold">3 · Ruleset</p>
              <select className={fieldCls} value={f.rulesetVersionId} onChange={(e) => setF({ ...f, rulesetVersionId: e.target.value })} aria-label="Ruleset">
                <option value="">Approved ruleset version…</option>
                {ruleOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </section>
            <section className="grid gap-2">
              <p className="text-xs font-semibold">4 · Details</p>
              <label className="grid gap-1 text-xs">Session name<Input value={f.name} placeholder={suggestedName || "[Trade] – [Drawing No] – Rev [X]"} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="grid gap-1 text-xs">Measurement scope<Input value={f.scope} placeholder="e.g. Ground floor slab and beams" onChange={(e) => setF({ ...f, scope: e.target.value })} /></label>
              <label className="grid gap-1 text-xs">Description<Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            </section>
          </div>
        ) : (
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd>{f.name.trim() || suggestedName}</dd>
            <dt className="text-muted-foreground">Purpose</dt><dd>Tender</dd>
            <dt className="text-muted-foreground">Trade · building</dt><dd>{f.trade || drawing?.discipline || "—"} · {f.building || drawing?.building || "—"}</dd>
            <dt className="text-muted-foreground">Source</dt><dd>{drawing?.drawing_no} Rev {rev?.revision} ({rev?.status})</dd>
            <dt className="text-muted-foreground">Ruleset</dt><dd>{ruleLabel}</dd>
            <dt className="text-muted-foreground">Scope</dt><dd>{f.scope || "—"}</dd>
          </dl>
        )}
        <DialogFooter>
          {step === "confirm" && <Button variant="outline" onClick={() => setStep("form")}>Back</Button>}
          {step === "form" ? (
            <Button disabled={!valid} onClick={() => setStep("confirm")}>Review</Button>
          ) : (
            <Button disabled={busy} onClick={() => void create()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create session</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
