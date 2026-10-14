"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { useModuleSettings } from "@/contexts/module-settings-context";
import { isRouteBlocked } from "@/lib/module-settings-service";
import { groupAttention, isoDay, type AttentionBucket, type AttentionItem } from "@/lib/project/projects/attention";
import { loadAttentionItems } from "@/lib/project/projects/overview-queries";

const BUCKET_TEXT: Record<AttentionBucket, string> = {
  overdue: "text-red-600 dark:text-red-400",
  soon: "text-amber-600 dark:text-amber-400",
  later: "text-muted-foreground",
};

function formatDay(due: string) {
  const [y, m, d] = due.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Open, dated items across the project's modules: overdue first, then due within 7 days.
export function AttentionPanel({ projectId }: { projectId: string }) {
  const { setSelectedProjectId } = useProject();
  const { loading: settingsLoading, permittedModuleKeys, permittedLoading, activeKeys, navItemSettings, navLoading } = useModuleSettings();
  const [items, setItems] = useState<AttentionItem[] | null>(null);

  useEffect(() => {
    loadAttentionItems(projectId).then(setItems).catch(() => setItems([]));
  }, [projectId]);

  // Only modules this user can open; while settings load, nothing is hidden (as the route guard does).
  const groups = useMemo(() => {
    if (!items) return [];
    const canOpen = (href: string) =>
      !isRouteBlocked(
        href.split("?")[0],
        permittedLoading ? undefined : permittedModuleKeys,
        settingsLoading || navLoading ? undefined : { activeModuleKeys: activeKeys, navItemSettings },
      );
    return groupAttention(items, isoDay(new Date())).filter((g) => canOpen(g.source.href));
  }, [items, permittedModuleKeys, permittedLoading, activeKeys, navItemSettings, navLoading, settingsLoading]);

  const overdue = groups.reduce((s, g) => s + g.overdue, 0);
  const soon = groups.reduce((s, g) => s + g.soon, 0);
  const selectProject = () => setSelectedProjectId(projectId);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-sm font-semibold">Needs attention</h3>
        {items && groups.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className={cn("font-medium", overdue ? BUCKET_TEXT.overdue : "text-muted-foreground")}>{overdue} overdue</span>
            <span className={cn("font-medium", soon ? BUCKET_TEXT.soon : "text-muted-foreground")}>{soon} due in 7 days</span>
          </div>
        )}
      </div>

      {!items ? (
        <div className="space-y-3 p-5">
          {[1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Nothing open with a due date.
        </div>
      ) : (
        <div className="divide-y">
          {groups.map((g) => (
            <div key={g.source.key} className="px-5 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-sm font-medium">{g.source.label}</p>
                  {g.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      <AlertCircle className="h-3 w-3" /> {g.overdue} overdue
                    </span>
                  )}
                  {g.soon > 0 && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {g.soon} this week
                    </span>
                  )}
                  {g.later > 0 && <span className="text-[10px] text-muted-foreground">{g.later} later</span>}
                </div>
                <Link href={g.source.href} onClick={selectProject} className="flex shrink-0 items-center text-xs font-medium text-primary hover:underline">
                  View all {g.total > g.preview.length ? `(${g.total})` : ""} <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <ul className="space-y-0.5">
                {g.preview.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={i.href ?? g.source.href}
                      onClick={selectProject}
                      className="flex items-center gap-3 rounded-md px-2 py-1 text-sm hover:bg-muted/60"
                    >
                      {i.ref && <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">{i.ref}</span>}
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      <span className={cn("shrink-0 text-xs tabular-nums", BUCKET_TEXT[i.bucket])} title={g.source.dueLabel}>
                        {formatDay(i.due)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
