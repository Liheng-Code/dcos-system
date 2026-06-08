"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Send, CheckCircle, XCircle, FileUp, Eye, Clock, History, Users, Link2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/components/documents/document-edit-sheet";

interface AuditEntry {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  user_id: string | null;
  created_at: string;
  profiles?: { full_name: string }[] | null;
}

interface ViewerEntry {
  id: string;
  user_id: string | null;
  email: string | null;
  company_name: string | null;
  viewed_at: string | null;
  transmitted_at: string;
  purpose: string;
  profiles?: { full_name: string }[] | null;
}

interface TaskLink {
  id: string;
  revision_id: string;
  task_id: string;
  link_type: string;
  wbs_tasks?: { task_code: string; task_name: string } | null;
}

interface WorkflowPanelProps {
  document: DocumentRecord;
  onClose: () => void;
  onUpdate: (doc: DocumentRecord) => void;
  onEdit?: (doc: DocumentRecord) => void;
}

const WORKFLOW_ACTIONS: Record<string, { next: string; label: string; icon: typeof Send; color: string; }[]> = {
  draft: [
    { next: "submitted", label: "Submit for Review", icon: Send, color: "bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20" },
  ],
  submitted: [
    { next: "under_review", label: "Start Review", icon: Eye, color: "bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20" },
    { next: "rejected", label: "Reject", icon: XCircle, color: "bg-red-500/10 text-red-600 border-red-200 hover:bg-red-500/20" },
  ],
  under_review: [
    { next: "approved", label: "Approve", icon: CheckCircle, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20" },
    { next: "approved_with_comment", label: "Approve with Comments", icon: CheckCircle, color: "bg-teal-500/10 text-teal-600 border-teal-200 hover:bg-teal-500/20" },
    { next: "rejected", label: "Reject", icon: XCircle, color: "bg-red-500/10 text-red-600 border-red-200 hover:bg-red-500/20" },
  ],
  approved: [
    { next: "ifc", label: "Issue for Construction", icon: FileUp, color: "bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20" },
  ],
  approved_with_comment: [
    { next: "ifc", label: "Issue for Construction", icon: FileUp, color: "bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20" },
  ],
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  submitted: "bg-blue-500/10 text-blue-600 border-blue-200",
  under_review: "bg-amber-500/10 text-amber-600 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  approved_with_comment: "bg-teal-500/10 text-teal-600 border-teal-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
  ifc: "bg-green-500/10 text-green-600 border-green-200",
  superseded: "bg-purple-500/10 text-purple-600 border-purple-200",
  archived: "bg-slate-500/10 text-slate-600 border-slate-200",
};

export function DocumentWorkflowPanel({ document, onClose, onUpdate, onEdit }: WorkflowPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const [taskLinks, setTaskLinks] = useState<TaskLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"workflow" | "audit" | "distribution" | "tasks">("workflow");
  const [comment, setComment] = useState("");
  const [showAddViewer, setShowAddViewer] = useState(false);
  const [newViewerEmail, setNewViewerEmail] = useState("");
  const [newViewerPurpose, setNewViewerPurpose] = useState<"info" | "review" | "approval" | "distribution">("info");

  useEffect(() => {
    Promise.all([
      supabase.from("document_audit_log")
        .select("*, profiles:user_id(full_name)")
        .eq("document_id", document.id)
        .order("created_at", { ascending: false }),
      supabase.from("document_viewers")
        .select("*, profiles:user_id(full_name)")
        .eq("document_id", document.id)
        .order("transmitted_at", { ascending: false }),
      supabase.from("document_revisions")
        .select("id")
        .eq("document_id", document.id)
        .order("revision_number", { ascending: false }),
    ]).then(([auditRes, viewerRes, revRes]) => {
      if (auditRes.data) setAuditLog(auditRes.data as AuditEntry[]);
      if (viewerRes.data) setViewers(viewerRes.data as ViewerEntry[]);
      if (revRes.data && revRes.data.length > 0) {
        supabase.from("document_revision_task_links")
          .select("*, wbs_tasks:task_id(task_code, task_name)")
          .eq("revision_id", revRes.data[0].id)
          .then(({ data }) => {
            if (data) setTaskLinks(data as TaskLink[]);
          });
      }
      setLoading(false);
    });
  }, [supabase, document.id]);

  async function handleAction(nextStatus: string) {
    setActionLoading(true);
    const { error } = await supabase.from("documents").update({ status: nextStatus }).eq("id", document.id).select().single();
    if (error) {
      toast.error(error.message);
      setActionLoading(false);
      return;
    }
    if (comment.trim()) {
      await supabase.from("document_audit_log").insert({
        document_id: document.id,
        action: "commented",
        comment: comment.trim(),
      });
      setComment("");
    }
    toast.success(`Document status changed to ${nextStatus.replace(/_/g, " ")}`);
    onUpdate({ ...document, status: nextStatus });
    setActionLoading(false);
  }

  async function handleAddViewer() {
    if (!newViewerEmail.trim()) return;
    const { error } = await supabase.from("document_viewers").insert({
      document_id: document.id,
      email: newViewerEmail.trim(),
      purpose: newViewerPurpose,
      transmitted_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Viewer added");
    setNewViewerEmail("");
    setShowAddViewer(false);
    const { data } = await supabase.from("document_viewers")
      .select("*, profiles:user_id(full_name)")
      .eq("document_id", document.id)
      .order("transmitted_at", { ascending: false });
    if (data) setViewers(data as ViewerEntry[]);
  }

  const availableActions = WORKFLOW_ACTIONS[document.status] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{document.document_number}</h2>
            <p className="text-xs text-muted-foreground">{document.title}</p>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(document)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-border">
          <div className="flex">
            {[
              { key: "workflow", label: "Workflow", icon: Send },
              { key: "audit", label: "Audit Log", icon: History },
              { key: "distribution", label: "Distribution", icon: Users },
              { key: "tasks", label: "Task Links", icon: Link2 },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {activeTab === "workflow" && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Status</span>
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
                  STATUS_COLORS[document.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                )}>
                  {document.status.replace(/_/g, " ")}
                </span>
              </div>

              {availableActions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {availableActions.map((action) => (
                      <button
                        key={action.next}
                        onClick={() => handleAction(action.next)}
                        disabled={actionLoading}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                          action.color,
                        )}
                      >
                        {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <action.icon className="h-3.5 w-3.5" />}
                        {action.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
                  />
                </div>
              )}

              {document.status === "rejected" && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  This document has been rejected.
                </div>
              )}

              {document.status === "ifc" && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  This document has been issued for construction.
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Info</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Project:</span> <span className="font-medium">{document.project_id}</span></div>
                  <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{document.document_type_id}</span></div>
                  <div><span className="text-muted-foreground">Discipline:</span> <span className="font-medium">{document.discipline || "—"}</span></div>
                  <div><span className="text-muted-foreground">Revision:</span> <span className="font-medium">R{document.current_revision}</span></div>
                  {document.wbs_node_id && (
                    <div className="col-span-2"><span className="text-muted-foreground">WBS:</span> <span className="font-medium">{document.wbs_node_id}</span></div>
                  )}
                  {document.description && (
                    <div className="col-span-2"><span className="text-muted-foreground">Description:</span> <span>{document.description}</span></div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "audit" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Log</p>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{entry.action.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        {entry.comment && <p className="text-xs text-muted-foreground mt-0.5">{entry.comment}</p>}
                        {entry.old_value && entry.new_value && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.field_name}: {entry.old_value} → {entry.new_value}
                          </p>
                        )}
                        {entry.profiles?.[0] && (
                          <p className="text-xs text-muted-foreground mt-0.5">by {entry.profiles[0].full_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "distribution" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distribution List</p>
                <Button variant="outline" size="sm" onClick={() => setShowAddViewer(!showAddViewer)}>
                  <Users className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {showAddViewer && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <input
                    value={newViewerEmail}
                    onChange={(e) => setNewViewerEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  />
                  <select
                    value={newViewerPurpose}
                    onChange={(e) => setNewViewerPurpose(e.target.value as typeof newViewerPurpose)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  >
                    <option value="info">For Information</option>
                    <option value="review">For Review</option>
                    <option value="approval">For Approval</option>
                    <option value="distribution">Distribution</option>
                  </select>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAddViewer(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddViewer}>Add</Button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : viewers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No viewers recorded</p>
              ) : (
                <div className="space-y-2">
                  {viewers.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{v.profiles?.[0]?.full_name || v.email || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.company_name && <span>{v.company_name} · </span>}
                          <span className="capitalize">{v.purpose}</span>
                          {v.viewed_at && <span> · Viewed {new Date(v.viewed_at).toLocaleDateString()}</span>}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.transmitted_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Tasks</p>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : taskLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No linked tasks</p>
              ) : (
                <div className="space-y-2">
                  {taskLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{link.wbs_tasks?.task_code || link.task_id}</p>
                        <p className="text-xs text-muted-foreground truncate">{link.wbs_tasks?.task_name || "—"}</p>
                      </div>
                      <span className="text-xs capitalize text-muted-foreground">{link.link_type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
