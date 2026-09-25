"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  DollarSign,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { CreateBoqSlideIn } from "@/components/qs/create-boq-slidein";
import {
  type QsBoqSummary,
  type BoqType,
  type BoqStatus,
  deleteBoq,
  getBoqList,
} from "@/lib/qs-service";

const BOQ_TYPE_LABELS: Record<BoqType, string> = {
  preliminary: "Preliminary",
  main_works: "Main Works",
  variation: "Variation",
  provisional_sum: "Provisional Sum",
  supplement: "Supplement",
};

const STATUS_CLASSES: Record<BoqStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  locked: "bg-slate-900 text-white",
  superseded: "bg-amber-100 text-amber-700",
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BoqListPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { selectedProjectId: projectId, selectedProject } = useProject();
  const { can } = useQsPermissions();

  const [boqs, setBoqs] = useState<QsBoqSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (!projectId) return;
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        setBoqs(await getBoqList(projectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load BOQ list");
      } finally {
        setLoading(false);
      }
    });
  }, [projectId]);

  const filtered = boqs.filter((b) => {
    if (search && !b.boq_number.toLowerCase().includes(search.toLowerCase()) && !b.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && b.boq_type !== typeFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: boqs.length,
    draft: boqs.filter((b) => b.status === "draft").length,
    active: boqs.filter((b) => b.status === "active").length,
    locked: boqs.filter((b) => b.status === "locked").length,
  };

  async function handleDelete(boq: QsBoqSummary) {
    if (!confirm(`Delete ${boq.boq_number}: ${boq.title}? This will remove all sections and items.`)) return;
    try {
      await deleteBoq(boq.id);
      setBoqs((p) => p.filter((b) => b.id !== boq.id));
      toast.success("BOQ deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete BOQ");
    }
  }

  const hasFilters = Boolean(search || typeFilter || statusFilter);

  if (checking) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/dashboard/qs"><ChevronRight className="h-4 w-4 rotate-180" /></Link>
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Bill of Quantities</h1>
            <p className="truncate text-sm text-muted-foreground">
              Manage multiple BOQs for {selectedProject?.project_name ?? "selected project"}
            </p>
          </div>
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search BOQ number or title..."
              className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            {Object.entries(BOQ_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">All Status</option>
            {(["draft", "active", "locked", "superseded"] as const).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}>
              Clear
            </Button>
          )}
          {can("boq", "can_create") && (
            <Button onClick={() => setShowCreate(true)} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" /> New BOQ
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            Select a project to view BOQs.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total BOQs", value: stats.total, tone: "default" },
                { label: "Draft", value: stats.draft, tone: "muted" },
                { label: "Active", value: stats.active, tone: "success" },
                { label: "Locked", value: stats.locked, tone: "default" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                  <p className={cn(
                    "mt-1 text-2xl font-bold",
                    kpi.tone === "success" ? "text-emerald-600" : kpi.tone === "muted" ? "text-slate-400" : "text-slate-900",
                  )}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* BOQ list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
                <BookOpen className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">
                  {boqs.length === 0 ? "No BOQs yet. Create your first Bill of Quantities." : "No BOQs match your filters."}
                </p>
                {boqs.length === 0 && can("boq", "can_create") && (
                  <Button className="mt-4 gap-1.5" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4" /> New BOQ
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((boq) => (
                  <Link
                    key={boq.id}
                    href={`/dashboard/qs/boq/${boq.id}`}
                    className="group block rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 group-hover:bg-emerald-100">
                        <FileText className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{boq.boq_number}</span>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                            STATUS_CLASSES[boq.status as BoqStatus] ?? "bg-slate-100 text-slate-600",
                          )}>
                            {boq.status}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            v{boq.version}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-700">{boq.title}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                          <span>{BOQ_TYPE_LABELS[boq.boq_type] ?? boq.boq_type}</span>
                          <span>·</span>
                          <span>{boq.section_count} section{boq.section_count !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span>{boq.item_count} item{boq.item_count !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span className="font-medium text-emerald-600">${fmt(boq.total_amount)}</span>
                          {boq.currency_code !== "USD" && (
                            <span className="text-[10px] text-slate-400">({boq.currency_code})</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {can("boq", "delete") && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDelete(boq); }}
                            className="rounded p-1.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400">
              Showing {filtered.length} of {boqs.length} BOQ{boqs.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBoqSlideIn
          projectId={projectId!}
          onClose={() => setShowCreate(false)}
          onCreated={(boqId) => {
            setShowCreate(false);
            router.push(`/dashboard/qs/boq/${boqId}`);
          }}
        />
      )}
    </div>
  );
}
