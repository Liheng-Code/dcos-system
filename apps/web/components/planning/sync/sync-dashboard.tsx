"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { parseMspdXml } from "@/lib/planning/sync/mspd-parser";
import type { DiffOp, DiffPlan, MspSchedule, SyncConfigRow } from "@/lib/planning/sync/types";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Loader2,
  Settings2,
  Trash2,
} from "lucide-react";

interface SyncStatus {
  project: { id: string; project_code: string; project_name: string };
  config: SyncConfigRow | null;
  lastSession: {
    id: string;
    direction: string;
    status: string;
    summary: Record<string, number>;
    file_name: string | null;
    created_at: string;
  } | null;
  linkedTaskCount: number;
}

interface SyncSession {
  id: string;
  direction: string;
  status: string;
  file_name: string | null;
  summary: Record<string, number>;
  error: string | null;
  created_at: string;
  committed_at: string | null;
}

const ACTION_BADGE: Record<DiffOp["action"], "default" | "secondary" | "outline" | "destructive"> = {
  create: "default",
  update: "secondary",
  unchanged: "outline",
  orphan: "destructive",
  skip: "outline",
};

export function SyncDashboard() {
  const { selectedProjectId, selectedProject } = useProject();
  const [status, setStatus] = useState<SyncStatus | null>(null);

  const [syncLevel, setSyncLevel] = useState("3");
  const [syncProgress, setSyncProgress] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [schedule, setSchedule] = useState<MspSchedule | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [plan, setPlan] = useState<DiffPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [discardOrphans, setDiscardOrphans] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [sessions, setSessions] = useState<SyncSession[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<SyncSession | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    (async () => {
      const [statusRes, sessionsRes] = await Promise.all([
        fetch(`/api/planning/sync/${selectedProjectId}/status`),
        fetch(`/api/planning/sync/${selectedProjectId}/sessions`),
      ]);
      if (cancelled) return;
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
        if (data.config) {
          setSyncLevel(String(data.config.sync_level ?? 3));
          setSyncProgress(data.config.sync_progress ?? false);
        }
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  // Refresh sessions when the server broadcasts a sync completion.
  useEffect(() => {
    if (!selectedProjectId) return;
    const supabase = createClient();
    const channel = supabase.channel(`planning-sync:project:${selectedProjectId}`);
    channel
      .on("broadcast", { event: "schedule_synced" }, () => {
        fetch(`/api/planning/sync/${selectedProjectId}/sessions`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.sessions) setSessions(data.sessions);
          })
          .catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProjectId]);

  async function refreshStatus() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/planning/sync/${selectedProjectId}/status`);
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      if (data.config) {
        setSyncLevel(String(data.config.sync_level ?? 3));
        setSyncProgress(data.config.sync_progress ?? false);
      }
    }
  }

  async function refreshSessions() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/planning/sync/${selectedProjectId}/sessions`);
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
  }

  async function handleDeleteSession() {
    if (!selectedProjectId || !sessionToDelete) return;
    setDeletingSession(true);
    try {
      const res = await fetch(
        `/api/planning/sync/${selectedProjectId}/sessions/${sessionToDelete.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
      toast.success("Sync session deleted");
      setSessionToDelete(null);
      refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setDeletingSession(false);
    }
  }

  async function saveConfig() {
    if (!selectedProjectId) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/planning/sync/${selectedProjectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync_level: Number(syncLevel),
          sync_progress: syncProgress,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      toast.success("Sync settings saved");
      refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleFile(file: File) {
    if (!selectedProjectId) return;
    if (!/\.(xml|mspd)$/i.test(file.name)) {
      toast.error("Select an MSPDI XML file (.xml) exported from Project Desktop");
      return;
    }
    setPlan(null);
    setSessionId(null);
    setCommitted(false);
    try {
      const text = await file.text();
      const parsed = parseMspdXml(text, { fileName: file.name });
      setSchedule(parsed);
      setFileName(file.name);
      setPreviewing(true);
      const res = await fetch(`/api/planning/sync/${selectedProjectId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPlan(data.plan);
      setSessionId(data.sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
      setSchedule(null);
      setFileName(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!selectedProjectId || !sessionId) return;
    setCommitting(true);
    try {
      const res = await fetch(`/api/planning/sync/${selectedProjectId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, discardOrphans }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Commit failed");
      setCommitted(true);
      const discarded = data.applied?.discarded ?? 0;
      toast.success(
        `Committed: ${data.applied.create} created, ${data.applied.update} updated` +
          (discarded > 0 ? `, ${discarded} orphan${discarded === 1 ? "" : "s"} discarded` : "")
      );
      refreshStatus();
      refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function handleExport() {
    if (!selectedProjectId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/planning/sync/${selectedProjectId}/export`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      const blob = new Blob([data.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.summary.tasks} tasks`);
      refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!selectedProjectId || !selectedProject) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Select a project from the project switcher to manage its MS Project sync.
      </div>
    );
  }

  if (status === null || status.project.id !== selectedProjectId) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const summary = plan?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {selectedProject.project_code} — {selectedProject.project_name}
            </h2>
            <Badge variant={status?.config?.status === "active" ? "default" : "secondary"}>
              {status?.config?.status === "active" ? "Sync active" : "Not synced yet"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {status?.linkedTaskCount ?? 0} tasks linked to MS Project
            {status?.lastSession?.created_at
              ? ` · last ${status.lastSession.direction} ${new Date(status.lastSession.created_at).toLocaleString()}`
              : ""}
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Export XML
        </Button>
      </div>

      <Separator />

      {/* Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" /> Sync settings
          </CardTitle>
          <CardDescription>
            MSP is the source of truth for schedule fields; execution fields (status, priority,
            progress) stay owned by DCOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Sync level</Label>
              <Select value={syncLevel} onValueChange={(v) => { if (v) setSyncLevel(v as string); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>Level {l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <div className="flex h-9 items-center rounded-lg border border-input px-3 text-sm text-muted-foreground">
                Merge (upsert by MSP UID)
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={syncProgress} onCheckedChange={(c) => setSyncProgress(Boolean(c))} />
                Overwrite progress from MSP
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig && <Loader2 className="animate-spin" />} Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-4 w-4" /> Import from MS Project
          </CardTitle>
          <CardDescription>
            Upload an MSPDI XML export (Project Desktop: File → Save As → XML Format). You review
            the diff before anything is written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.mspd"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={previewing}>
              {previewing ? <Loader2 className="animate-spin" /> : <FileUp />}
              {fileName ? "Choose another file" : "Choose XML file"}
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground">
                {fileName} · {schedule?.level3Tasks.length ?? 0} level-{syncLevel} tasks
              </span>
            )}
            {previewing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {plan && summary && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{summary.create} create</Badge>
                <Badge variant="secondary">{summary.update} update</Badge>
                <Badge variant="outline">{summary.unchanged} unchanged</Badge>
                <Badge variant="destructive">{summary.orphan} orphan</Badge>
                {summary.skip > 0 && <Badge variant="outline">{summary.skip} skipped</Badge>}
              </div>

              {plan.warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {plan.warnings.slice(0, 8).map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                    {plan.warnings.length > 8 && <div>…and {plan.warnings.length - 8} more</div>}
                  </div>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Action</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Outline</TableHead>
                      <TableHead>Changes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.ops.map((op, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={ACTION_BADGE[op.action]}>{op.action}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {op.taskName ?? op.taskCode ?? "—"}
                          {op.taskCode && op.action === "create" && (
                            <span className="ml-1 text-xs text-muted-foreground">→ {op.taskCode}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{op.outlineNumber ?? "—"}</TableCell>
                        <TableCell className="max-w-md">
                          <ChangesCell op={op} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {summary.orphan > 0 && !committed && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={discardOrphans}
                      onCheckedChange={(c) => setDiscardOrphans(Boolean(c))}
                      disabled={committing}
                    />
                    Discard {summary.orphan} orphaned task{summary.orphan === 1 ? "" : "s"} (delete from DCOS)
                  </label>
                )}
                <Button onClick={handleCommit} disabled={committing || summary.total === 0 || committed}>
                  {committing ? <Loader2 className="animate-spin" /> : committed ? <CheckCircle2 /> : null}
                  {committed ? "Committed" : summary.total === 0 ? "Nothing to apply" : "Apply changes"}
                </Button>
                {committed && (
                  <span className="text-sm text-muted-foreground">
                    Import applied. Export is ready to open back in Project Desktop.
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Sync history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync sessions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.direction === "import" ? "default" : "secondary"}>
                        {s.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{s.status}</TableCell>
                    <TableCell className="text-muted-foreground">{s.file_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.direction === "import" && s.summary
                        ? `+${s.summary.create ?? 0} ~${s.summary.update ?? 0} =${s.summary.unchanged ?? 0}` +
                          ((s.summary.discarded ?? 0) > 0 ? ` -${s.summary.discarded}` : "")
                        : s.summary?.tasks != null
                          ? `${s.summary.tasks} tasks`
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setSessionToDelete(s)}
                        aria-label="Delete session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sync session?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the session record and its event history from{" "}
              {sessionToDelete ? new Date(sessionToDelete.created_at).toLocaleString() : ""}.
              Tasks already imported into the schedule are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSession}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteSession}
              disabled={deletingSession}
            >
              {deletingSession && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChangesCell({ op }: { op: DiffOp }) {
  if (op.action === "create") {
    const row = op.row as Record<string, unknown> | undefined;
    const start = row?.start_date as string | undefined;
    const end = row?.end_date as string | undefined;
    return (
      <span className="text-xs text-muted-foreground">
        {start && end ? `${start} → ${end}` : "new task"}
      </span>
    );
  }
  if (op.action === "update" && op.changes?.length) {
    return (
      <div className="flex flex-wrap gap-1">
        {op.changes.map((c, i) => (
          <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {c.field}: {String(c.to ?? "—")}
          </span>
        ))}
      </div>
    );
  }
  if (op.action === "unchanged") return <span className="text-xs text-muted-foreground">—</span>;
  if (op.warning) return <span className="text-xs text-muted-foreground">{op.warning}</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}
