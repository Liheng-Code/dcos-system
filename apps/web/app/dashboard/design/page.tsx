"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, PenTool, Building2, Wind, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DESIGN_GROUPS } from "@/lib/design/design-nav";
import { countDesignDrawingsWithDisciplineArc, countDesignDrawingsWithDisciplineMep, countDesignDrawingsWithDisciplineStr, countDesignRfiWithStatusOpen } from "@/lib/design/design-queries";

const CORRESPONDENCE_ITEMS = DESIGN_GROUPS.find((g) => g.key === "correspondence")!.items;

const CORRESPONDENCE_ICONS: Record<string, typeof PenTool> = {
  "Dashboard": PenTool,
  "Coordination": GitBranch,
  "Drawing Markup": PenTool,
  "BIM Viewer": Building2,
};

export default function DesignPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
    Promise.all([
      countDesignDrawingsWithDisciplineArc(),
      countDesignDrawingsWithDisciplineStr(),
      countDesignDrawingsWithDisciplineMep(),
      countDesignRfiWithStatusOpen(),
    ]).then(([arc, str, mep, openRfi]) => {
      setCounts({ arc: arc.count ?? 0, str: str.count ?? 0, mep: mep.count ?? 0, openRfi: openRfi.count ?? 0 });
    });
  }, []);

  if (checking) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <PenTool className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Design</h1>
            <p className="text-sm text-muted-foreground">Architecture, Structural, and MEP design workspace</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORRESPONDENCE_ITEMS.map((item) => {
              const Icon = CORRESPONDENCE_ICONS[item.label] ?? PenTool;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className={cn(
                    "cursor-pointer transition-colors h-full",
                    item.href === "/dashboard/design" ? "bg-muted/80 border-primary" : "hover:bg-muted/50",
                  )}>
                    <CardContent className="pt-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground">Click to open</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="pt-4 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-blue-600" />
                <div><div className="text-xs text-muted-foreground">Architecture</div><div className="text-lg font-bold">{counts.arc ?? 0}</div></div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-4 flex items-center gap-3">
                <PenTool className="h-5 w-5 text-amber-600" />
                <div><div className="text-xs text-muted-foreground">Structure</div><div className="text-lg font-bold">{counts.str ?? 0}</div></div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-4 flex items-center gap-3">
                <Wind className="h-5 w-5 text-emerald-600" />
                <div><div className="text-xs text-muted-foreground">MEP</div><div className="text-lg font-bold">{counts.mep ?? 0}</div></div>
              </CardContent>
            </Card>
          </div>
          {counts.openRfi !== undefined && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardContent className="pt-4 flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-orange-600" />
                <div><div className="text-xs text-muted-foreground">Open RFIs</div><div className="text-lg font-bold">{counts.openRfi}</div></div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
