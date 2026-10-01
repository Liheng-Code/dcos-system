"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQtoPermissions } from "@/hooks/use-qto-permissions";
import {
  QTO_BUILDINGS,
  QTO_DISCIPLINES,
  QtoItemForm,
} from "@/components/qto/qto-item-form";
import {
  QTO_STATUSES,
  addRevision,
  createDocument,
  createDrawing,
  deleteDocument,
  deleteDrawing,
  deleteQtoItem,
  getDrawingUrl,
  getProgress,
  getQtoSummary,
  getRiskRegister,
  listDocuments,
  listDrawings,
  listQtoItems,
  setCurrentRevision,
  type ProgressStats,
  type QtoDocument,
  type QtoDrawing,
  type QtoDrawingRevision,
  type QtoItem,
  type QtoSummaryRow,
  type RiskItem,
} from "@/lib/qs/qto-service";
import { listTenderRegister, updateQtoDrawingRevisionById } from "@/lib/qs/qs-queries";

type Tab = "takeoff" | "drawings" | "documents";

export default function QtoListPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const tenderParam = searchParams.get("tender");
  const tabParam = searchParams.get("tab");
  const urlTab: Tab = tabParam === "drawings" || tabParam === "documents" ? tabParam : "takeoff";
  const { selectedProjectId } = useProject();
  const { can, loaded: permsLoaded } = useQtoPermissions();

  const [tenders, setTenders] = useState<{ id: string; tender_no: string; title: string }[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenderParam ?? "");
  const [tendersLoading, setTendersLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(urlTab);

  // Header-tab links (?tab=drawings / ?tab=documents) change the URL without remounting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(urlTab);
  }, [urlTab]);

  useEffect(() => {
    let query = listTenderRegister("id,tender_no,title");
    if (selectedProjectId) query = query.eq("project_id", selectedProjectId);
    query.then(({ data }) => {
      if (data) setTenders(data);
      setTendersLoading(false);
    });
  }, [supabase, selectedProjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tenderParam) setSelectedTenderId(tenderParam);
  }, [tenderParam]);

  useEffect(() => {
    if (selectedTenderId && tenders.length > 0 && !tenders.find((t) => t.id === selectedTenderId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTenderId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenders, selectedProjectId]);

  if (tendersLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quantity Take-off</h1>
        <p className="text-sm text-muted-foreground">Measure from drawings, build calculations, review and approve net quantities for the tender BOQ</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="shrink-0 text-xs font-medium">Select Tender:</label>
        <select
          value={selectedTenderId}
          onChange={(e) => setSelectedTenderId(e.target.value)}
          className="max-w-md flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Choose a tender...</option>
          {tenders.map((t) => (
            <option key={t.id} value={t.id}>{t.tender_no} — {t.title}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 border-b border-border">
          {([
            { key: "takeoff" as Tab, label: "Take-off", icon: Ruler },
            { key: "drawings" as Tab, label: "Drawings", icon: FolderOpen },
            { key: "documents" as Tab, label: "Documents", icon: FileText },
          ]).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {!selectedTenderId ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
          <Ruler className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Select a tender to start taking quantities off the drawings.</p>
        </div>
      ) : permsLoaded && !can("qto_register", "view") ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">You do not have permission to view the QTO module.</p>
        </div>
      ) : (
        <>
          {tab === "takeoff" && (
            <TakeOffTab
              tenderId={selectedTenderId}
              canCreate={can("qto_register", "can_create")}
              canEdit={can("qto_register", "edit")}
              canDelete={can("qto_register", "delete")}
            />
          )}
          {tab === "drawings" && <DrawingsTab tenderId={selectedTenderId} canCreate={can("qto_drawings", "can_create")} canDelete={can("qto_drawings", "delete")} />}
          {tab === "documents" && <DocumentsTab tenderId={selectedTenderId} canCreate={can("qto_documents", "can_create")} canDelete={can("qto_documents", "delete")} />}
        </>
      )}
    </div>
  );
}

// ── Take-off tab ──────────────────────────────────────────────────────────────
function TakeOffTab({ tenderId, canCreate, canEdit, canDelete }: { tenderId: string; canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<QtoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [summary, setSummary] = useState<QtoSummaryRow[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);

  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState("all");
  const [discipline, setDiscipline] = useState("all");
  const [status, setStatus] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QtoItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QtoItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [listRes, statsRes, summaryRes, riskRes] = await Promise.all([
      listQtoItems(tenderId),
      getProgress(tenderId),
      getQtoSummary(tenderId),
      getRiskRegister(tenderId),
    ]);
    if (listRes.error) setErrorMsg(listRes.error);
    else setRows(listRes.data ?? []);
    setStats(statsRes);
    setSummary(summaryRes);
    setRisks(riskRes);
    setLoading(false);
  }, [tenderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let result = rows;
    if (building !== "all") result = result.filter((r) => r.building === building);
    if (discipline !== "all") result = result.filter((r) => r.discipline === discipline);
    if (status !== "all") result = result.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.qto_no.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.item_code ?? "").toLowerCase().includes(q) ||
          (r.drawing?.drawing_no ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, building, discipline, status, search]);

  const approvedQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of summary) {
      map.set(`${s.building ?? "—"} · ${s.discipline ?? "—"} · ${s.work_section ?? "—"}`, s.quantity);
    }
    return map;
  }, [summary]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const res = await deleteQtoItem(confirmDelete.id);
    setDeleting(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(`${confirmDelete.qto_no} deleted`);
      setConfirmDelete(null);
      void load();
    }
  }

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of QTO_STATUSES) map.set(s, 0);
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total Items</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Draft / In Progress</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {(stats?.byStatus.DRAFT ?? 0) + (stats?.byStatus.MEASURED ?? 0) + (stats?.byStatus["SELF CHECKED"] ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Approved</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{stats?.approved ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Posted to BOQ</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-600">{stats?.posted ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {/* Header + filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search qto no, description, drawing…" className="pl-8" />
            </div>
            <select value={building} onChange={(e) => setBuilding(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="all">All Buildings</option>
              {QTO_BUILDINGS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="all">All Disciplines</option>
              {QTO_DISCIPLINES.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="all">All Status</option>
              {QTO_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} disabled={!canCreate}>
              <Plus className="h-4 w-4" /> New QTO Item
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <ClipboardIcon />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? "No QTO items yet. Create the first item to begin measuring." : "No items match your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">QTO No</th>
                    <th className="px-3 py-2">Building</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 w-14">Unit</th>
                    <th className="px-3 py-2">Drawing</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.id} onClick={() => router.push(`/dashboard/qto/${r.id}`)} className="cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs font-medium">{r.qto_no}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-medium">{r.building ?? "—"}</span>
                        <span className="block text-[10px] text-muted-foreground">{r.discipline ?? ""}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="line-clamp-1">{r.description}</div>
                        {r.item_code && <span className="font-mono text-[10px] text-muted-foreground">{r.item_code}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{r.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">{r.unit}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.drawing ? (
                          <>
                            <span className="font-mono">{r.drawing.drawing_no}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">Rev {r.drawing_revision?.revision ?? "—"}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === "APPROVED" || r.status === "POSTED TO BOQ" ? "default" : "outline"}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <button
                              onClick={() => { setEditing(r); setShowForm(true); }}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setConfirmDelete(r)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                              title="Delete (draft only)"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Progress by Status</p>
            </div>
            <div className="space-y-2 p-3">
              {QTO_STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{s}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", s === "APPROVED" ? "bg-emerald-500" : s === "POSTED TO BOQ" ? "bg-blue-500" : "bg-primary")}
                      style={{ width: `${stats && stats.total > 0 ? ((statusCounts.get(s) ?? 0) / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums">{statusCounts.get(s) ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Approved Quantities</p>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-border">
              {approvedQty.size === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing approved yet.</p>
              )}
              {[...approvedQty.entries()].map(([key, qty]) => (
                <div key={key} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate text-xs">{key}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs tabular-nums">{qty.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Risk Register</p>
            </div>
            <div className="divide-y divide-border">
              {risks.map((r) => (
                <div key={r.type} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs">{r.label}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", r.count > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <QtoItemForm open={showForm} onOpenChange={setShowForm} tenderId={tenderId} editItem={editing} onSaved={() => void load()} />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete {confirmDelete.qto_no}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Only DRAFT items can be deleted. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={deleting} onClick={() => void handleDelete()}>
                {deleting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClipboardIcon() {
  return <FilePlus2 className="h-8 w-8 text-muted-foreground/50" />;
}

// ── Drawings tab ──────────────────────────────────────────────────────────────
function DrawingsTab({ tenderId, canCreate, canDelete }: { tenderId: string; canCreate: boolean; canDelete: boolean }) {
  const [drawings, setDrawings] = useState<QtoDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisions, setRevisions] = useState<Record<string, QtoDrawingRevision[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newDrawing, setNewDrawing] = useState({ drawing_no: "", title: "", discipline: "", building: "", drawing_type: "" });

  const [uploadFor, setUploadFor] = useState<QtoDrawing | null>(null);
  const [uploadRevision, setUploadRevision] = useState("");
  const [uploadScale, setUploadScale] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDrawings(tenderId);
    setDrawings(res.data ?? []);
    if (res.error) toast.error(res.error);
    setLoading(false);
  }, [tenderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const loadRevisions = async (drawingId: string) => {
    const { listRevisions } = await import("@/lib/qs/qto-service");
    const res = await listRevisions(drawingId);
    setRevisions((prev) => ({ ...prev, [drawingId]: res.data ?? [] }));
  };

  async function handleCreateDrawing() {
    if (!newDrawing.drawing_no.trim() || !newDrawing.title.trim()) {
      toast.error("Drawing no and title are required");
      return;
    }
    const res = await createDrawing({
      tender_id: tenderId,
      drawing_no: newDrawing.drawing_no.trim(),
      title: newDrawing.title.trim(),
      discipline: newDrawing.discipline || null,
      building: newDrawing.building || null,
      drawing_type: newDrawing.drawing_type || null,
      status: "current",
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Drawing added");
      setShowForm(false);
      setNewDrawing({ drawing_no: "", title: "", discipline: "", building: "", drawing_type: "" });
      void load();
    }
  }

  async function handleUpload() {
    if (!uploadFor) return;
    if (!uploadFile) { toast.error("Choose a file to upload"); return; }
    if (!uploadRevision.trim()) { toast.error("Revision is required (e.g. P01)"); return; }
    setUploading(true);

    const supabase = createClient();
    const ext = uploadFile.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${tenderId}/${uploadFor.id}/rev-${uploadRevision.trim()}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("qto-files").upload(path, uploadFile, { contentType: uploadFile.type || "application/octet-stream" });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const isPdf = uploadFile.type === "application/pdf" || ext === "pdf";
    const res = await addRevision(uploadFor.id, {
      revision: uploadRevision.trim(),
      status: "current",
      scale: uploadScale.trim() || null,
      units: "mm",
      file_path: path,
      pdf_path: isPdf ? path : null,
      revision_date: new Date().toISOString().slice(0, 10),
    });
    setUploading(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Revision uploaded");
      setUploadFor(null);
      setUploadRevision("");
      setUploadScale("");
      setUploadFile(null);
      void load();
    }
  }

  async function handleMakeCurrent(drawing: QtoDrawing, revId: string) {
    // supersede existing current revision, then mark the new one current
    const supabase = createClient();
    const currentId = drawing.current_revision?.id;
    if (currentId) {
      await updateQtoDrawingRevisionById({ status: "superseded" }, currentId);
    }
    const res = await setCurrentRevision(drawing.id, revId);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Revision made current");
      void load();
      if (expanded) void loadRevisions(expanded);
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{drawings.length} drawings in register</p>
        <Button size="sm" onClick={() => setShowForm(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> Add Drawing
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
      ) : drawings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No drawings in the register yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {drawings.map((d) => (
            <div key={d.id}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    const next = expanded === d.id ? null : d.id;
                    setExpanded(next);
                    if (next) void loadRevisions(d.id);
                  }}
                >
                  <span className={cn("transition-transform", expanded === d.id && "rotate-90")}>▶</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{d.drawing_no}</span>
                    <span className="text-sm">{d.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {d.discipline ?? "—"} · {d.building ?? "—"} · {d.drawing_type ?? "—"}
                  </p>
                </div>
                <Badge variant={d.status === "current" ? "default" : "outline"}>{d.current_revision ? `Rev ${d.current_revision.revision}` : d.status}</Badge>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setUploadFor(d); setUploadRevision(""); setUploadScale(""); setUploadFile(null); }} disabled={!canCreate}>
                    <Upload className="mr-1 h-3 w-3" /> Revision
                  </Button>
                  {canDelete && (
                    <button
                      onClick={() => { if (confirm(`Delete drawing ${d.drawing_no}?`)) void deleteDrawing(d.id).then((r) => { if (r.error) toast.error(r.error); else { toast.success("Drawing deleted"); void load(); } }); }}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded === d.id && (
                <div className="border-t border-border bg-muted/20 px-4 py-2">
                  {(revisions[d.id] ?? []).length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">No revisions yet.</p>
                  )}
                  {(revisions[d.id] ?? []).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-1.5">
                      <span className={cn("w-12 text-xs font-semibold", r.status === "current" ? "text-emerald-600" : "text-muted-foreground")}>
                        {r.revision}
                      </span>
                      <span className="w-24 text-[11px] text-muted-foreground">{r.revision_date ?? "—"}</span>
                      <span className="text-[11px] text-muted-foreground">{r.scale ?? "no scale"}</span>
                      <a
                        href={getDrawingUrl(r) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className={cn("text-[11px] underline", !getDrawingUrl(r) && "pointer-events-none text-muted-foreground")}
                      >
                        {r.pdf_path ? "Open PDF" : r.file_path ? "File (no PDF)" : "No file"}
                      </a>
                      {r.status === "superseded" && canCreate && (
                        <button
                          onClick={() => void handleMakeCurrent(d, r.id)}
                          className="ml-auto rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          Make current
                        </button>
                      )}
                      {r.status === "current" && <Badge variant="outline" className="ml-auto">current</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Add Drawing</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Drawing No *</label><input className={inputCls} value={newDrawing.drawing_no} onChange={(e) => setNewDrawing((f) => ({ ...f, drawing_no: e.target.value }))} placeholder="S-101" /></div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Drawing Type</label><input className={inputCls} value={newDrawing.drawing_type} onChange={(e) => setNewDrawing((f) => ({ ...f, drawing_type: e.target.value }))} placeholder="layout" /></div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Title *</label><input className={inputCls} value={newDrawing.title} onChange={(e) => setNewDrawing((f) => ({ ...f, title: e.target.value }))} placeholder="Foundation Layout" /></div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Discipline</label>
                <select className={inputCls} value={newDrawing.discipline} onChange={(e) => setNewDrawing((f) => ({ ...f, discipline: e.target.value }))}>
                  <option value="">—</option>
                  {QTO_DISCIPLINES.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Building</label>
                <select className={inputCls} value={newDrawing.building} onChange={(e) => setNewDrawing((f) => ({ ...f, building: e.target.value }))}>
                  <option value="">—</option>
                  {QTO_BUILDINGS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void handleCreateDrawing()}>Add Drawing</Button>
            </div>
          </div>
        </div>
      )}

      {uploadFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Upload Revision — {uploadFor.drawing_no}</h3>
            <div className="mt-3 space-y-3">
              <div><label className="text-xs font-medium text-muted-foreground">Revision *</label><input className={inputCls} value={uploadRevision} onChange={(e) => setUploadRevision(e.target.value)} placeholder="P01" /></div>
              <div><label className="text-xs font-medium text-muted-foreground">Scale</label><input className={inputCls} value={uploadScale} onChange={(e) => setUploadScale(e.target.value)} placeholder="1:100" /></div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">File (PDF preferred for measuring)</label>
                <input type="file" accept=".pdf,.dwg,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setUploadFor(null)}>Cancel</Button>
              <Button size="sm" disabled={uploading} onClick={() => void handleUpload()}>
                {uploading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ tenderId, canCreate, canDelete }: { tenderId: string; canCreate: boolean; canDelete: boolean }) {
  const [docs, setDocs] = useState<QtoDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ document_no: "", title: "", document_type: "specification", discipline: "", building: "", revision: "", remarks: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDocuments(tenderId);
    setDocs(res.data ?? []);
    if (res.error) toast.error(res.error);
    setLoading(false);
  }, [tenderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!form.document_no.trim() || !form.title.trim()) {
      toast.error("Document no and title are required");
      return;
    }
    const res = await createDocument({
      tender_id: tenderId,
      document_no: form.document_no.trim(),
      title: form.title.trim(),
      document_type: form.document_type,
      discipline: form.discipline || null,
      building: form.building || null,
      revision: form.revision || null,
      remarks: form.remarks || null,
      status: "registered",
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Document added");
      setShowForm(false);
      setForm({ document_no: "", title: "", document_type: "specification", discipline: "", building: "", revision: "", remarks: "" });
      void load();
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{docs.length} documents in register</p>
        <Button size="sm" onClick={() => setShowForm(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> Add Document
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No documents in the register yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Document No</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rev</th>
                <th className="px-3 py-2">Building</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-mono text-xs font-medium">{d.document_no}</td>
                  <td className="px-3 py-2 text-xs">{d.title}</td>
                  <td className="px-3 py-2 text-xs uppercase">{d.document_type}</td>
                  <td className="px-3 py-2 text-xs">{d.revision ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.building ?? "—"}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{d.status}</Badge></td>
                  <td className="px-3 py-2">
                    {canDelete && (
                      <button
                        onClick={() => { if (confirm(`Delete ${d.document_no}?`)) void deleteDocument(d.id).then((r) => { if (r.error) toast.error(r.error); else { toast.success("Document deleted"); void load(); } }); }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Add Document</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Document No *</label><input className={inputCls} value={form.document_no} onChange={(e) => setForm((f) => ({ ...f, document_no: e.target.value }))} placeholder="SPEC-STR-001" /></div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Type</label>
                <select className={inputCls} value={form.document_type} onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}>
                  <option value="specification">Specification</option>
                  <option value="boq">BOQ</option>
                  <option value="addendum">Addendum</option>
                  <option value="drawing">Drawing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Title *</label><input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Structural Specification Volume 1" /></div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Revision</label><input className={inputCls} value={form.revision} onChange={(e) => setForm((f) => ({ ...f, revision: e.target.value }))} placeholder="C" /></div>
              <div className="col-span-1"><label className="text-xs font-medium text-muted-foreground">Building</label>
                <select className={inputCls} value={form.building} onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}>
                  <option value="">—</option>
                  {QTO_BUILDINGS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Remarks</label><input className={inputCls} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void handleCreate()}>Add Document</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
