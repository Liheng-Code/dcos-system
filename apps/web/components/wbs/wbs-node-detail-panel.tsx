"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  Eye, FileText, ClipboardCheck, MessageSquare, ShieldCheck,
  CheckCircle2, Clock3, AlertTriangle, Bell, BellOff, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { type WbsNodeData, type WbsNodeRecord, type WbsTaskRecord, type WbsAuditLogRecord } from "@/components/wbs/wbs-types";

interface WbsNodeDetailPanelProps {
  node: WbsNodeData | null;
  nodeRecord: WbsNodeRecord | null;
  tasks: WbsTaskRecord[];
  auditLogs: WbsAuditLogRecord[];
  projectId: string;
  onRefresh: () => void;
}

function auditIcon(action: string) {
  if (action === "insert") return CheckCircle2;
  if (action === "update") return Clock3;
  if (action === "delete") return AlertTriangle;
  return Clock3;
}

export function WbsNodeDetailPanel({ node, nodeRecord, tasks, auditLogs, projectId, onRefresh }: WbsNodeDetailPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subscribed, setSubscribed] = useState(false);
  const [togglingSub, setTogglingSub] = useState(false);

  async function toggleSubscription() {
    if (!node) return;
    setTogglingSub(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTogglingSub(false); return; }

    if (subscribed) {
      const { error } = await supabase.from("wbs_subscriptions").delete().eq("wbs_node_id", node.id).eq("user_id", user.id);
      if (error) toast.error(error.message);
      else { setSubscribed(false); toast.success("Unsubscribed"); }
    } else {
      const { error } = await supabase.from("wbs_subscriptions").insert({ wbs_node_id: node.id, user_id: user.id });
      if (error) toast.error(error.message);
      else { setSubscribed(true); toast.success("Subscribed to node updates"); }
    }
    setTogglingSub(false);
  }

  useEffect(() => {
    if (!node) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("wbs_subscriptions").select("id").eq("wbs_node_id", node.id).eq("user_id", data.user.id).maybeSingle().then(({ data: sub }) => {
        setSubscribed(!!sub);
      });
    });
  }, [node, supabase]);

  if (!node) {
    return (
      <aside className="space-y-3">
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Eye className="h-8 w-8 mb-2" />
              <p className="text-xs">Select a node to view details</p>
            </div>
          </CardContent>
        </Card>
      </aside>
    );
  }

  const linkedDocs = tasks.reduce((s, t) => s + t.docs_count, 0);
  const linkedPhotos = tasks.reduce((s, t) => s + t.photos_count, 0);
  const qaChecks = tasks.filter((t) => t.qa_status !== "not_required").length;
  const rfis = tasks.filter((t) => t.qa_status === "submitted" || t.qa_status === "review").length;
  const approvals = tasks.filter((t) => t.qa_status === "approved").length;

  const LABELS = {
    "insert": "created",
    "update": "updated",
    "delete": "deleted",
  } as Record<string, string>;

  return (
    <aside className="space-y-3 overflow-y-auto">
      {/* Node Detail */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold">Node Detail</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg h-6 w-6"
                onClick={toggleSubscription}
                disabled={togglingSub}
                title={subscribed ? "Unsubscribe" : "Subscribe"}
              >
                {subscribed ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="rounded-lg h-6 w-6">
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-2 text-[10px]">
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="text-slate-500">Code</span>
              <div className="font-semibold text-xs">{node.wbs_code}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="text-slate-500">Path</span>
              <div className="font-semibold text-[10px] font-mono">{nodeRecord?.full_path ?? "—"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="text-slate-500">Responsible</span>
              <div className="font-semibold text-xs">—</div>
            </div>
            {(node.budget_cost != null || node.actual_cost != null) && (
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="text-slate-500">Cost</span>
                <div className="flex gap-2 mt-0.5">
                  {node.budget_cost != null && <span className="text-[10px]">Budget: ${node.budget_cost.toLocaleString()}</span>}
                  {node.actual_cost != null && <span className="text-[10px]">Actual: ${node.actual_cost.toLocaleString()}</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Linked Control Items */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <h2 className="mb-2 text-xs font-semibold">Linked Control Items</h2>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="rounded-lg border border-slate-200 p-2">
              <FileText className="mb-1 h-3.5 w-3.5 text-slate-500" />
              Documents<br /><b>{linkedDocs}</b>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <ClipboardCheck className="mb-1 h-3.5 w-3.5 text-slate-500" />
              QA Checks<br /><b>{qaChecks}</b>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <MessageSquare className="mb-1 h-3.5 w-3.5 text-slate-500" />
              RFIs<br /><b>{rfis}</b>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <ShieldCheck className="mb-1 h-3.5 w-3.5 text-slate-500" />
              Approvals<br /><b>{approvals}</b>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold">Activity Timeline</h2>
            <span className="text-[10px] text-slate-400">{auditLogs.length} events</span>
          </div>
          <div className="space-y-2 text-[10px]">
            {auditLogs.length === 0 ? (
              <div className="py-4 text-center text-slate-400">No activity yet</div>
            ) : (
              auditLogs.slice(0, 10).map((log) => {
                const Icon = auditIcon(log.action);
                return (
                  <div key={log.id} className="flex gap-2">
                    <Icon className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      log.action === "insert" ? "text-emerald-500" :
                      log.action === "delete" ? "text-red-500" : "text-amber-500",
                    )} />
                    <div className="min-w-0">
                      <b className="capitalize">{LABELS[log.action] ?? log.action}</b>
                      {log.field_name && <span> {log.field_name}</span>}
                      <br />
                      <span className="text-slate-400">
                        {log.new_value && <span>→ {log.new_value}</span>}
                        {log.created_at && <span> · {new Date(log.created_at).toLocaleDateString()}</span>}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
