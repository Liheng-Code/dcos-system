"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, PenTool, Building2, Wind, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const disciplines = [
  { key: "arc", label: "Architecture", icon: Building2, color: "bg-blue-50 text-blue-600", href: "/dashboard/design/arc/drawings", desc: "Drawings, room data, schedules, materials, RFI" },
  { key: "str", label: "Structure", icon: PenTool, color: "bg-amber-50 text-amber-600", href: "/dashboard/design/str/drawings", desc: "Calculations, models, rebar, TQ, design changes" },
  { key: "mep", label: "MEP", icon: Wind, color: "bg-emerald-50 text-emerald-600", href: "/dashboard/design/mep/drawings", desc: "Equipment, loads, sleeves, submittals, commissioning" },
] as const;

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
      supabase.from("design_drawings").select("id", { count: "exact", head: true }).eq("discipline", "arc"),
      supabase.from("design_drawings").select("id", { count: "exact", head: true }).eq("discipline", "str"),
      supabase.from("design_drawings").select("id", { count: "exact", head: true }).eq("discipline", "mep"),
      supabase.from("design_rfi").select("id", { count: "exact", head: true }).eq("status", "open"),
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {disciplines.map(d => (
            <Card key={d.key} className="cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => router.push(d.href)}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${d.color}`}>
                    <d.icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm">{d.label}</CardTitle>
                  <span className="ml-auto text-lg font-bold font-mono">{counts[d.key] ?? 0}</span>
                </div>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">{d.desc}</p></CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {counts.openRfi !== undefined && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardContent className="pt-4 flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-orange-600" />
                <div><div className="text-xs text-muted-foreground">Open RFIs</div><div className="text-lg font-bold">{counts.openRfi}</div></div>
              </CardContent>
            </Card>
          )}
          <Card className="cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => router.push("/dashboard/design/coordination")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-indigo-600" />
              <div><div className="text-xs text-muted-foreground">Coordination Log</div><div className="text-sm font-medium">Cross-discipline</div></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
