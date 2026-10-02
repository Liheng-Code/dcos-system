"use client";

import { useEffect, useState } from "react";
import { countHseIncidents, countHseObservations, countHsePermits, countHseRiskAssessments, countHseToolboxTalks } from "@/lib/construction/construction-queries";
import { HsePageShell } from "@/components/construction/hse/hse-page-shell";
import {
  ShieldCheck, FileText, MessageSquare, AlertTriangle, ClipboardList, Eye, Loader2
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const MODULES = [
  { href: "/dashboard/hse/permits",          label: "Work Permits",       icon: FileText,        desc: "PTW system",           color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/hse/toolbox-talks",    label: "Toolbox Talks",      icon: MessageSquare,   desc: "Daily safety briefings", color: "bg-green-50 text-green-600" },
  { href: "/dashboard/hse/incidents",        label: "Incidents",          icon: AlertTriangle,   desc: "Incident register",    color: "bg-red-50 text-red-600" },
  { href: "/dashboard/hse/risk-assessments", label: "Risk Assessments",   icon: ClipboardList,   desc: "HIRA & JSA",           color: "bg-orange-50 text-orange-600" },
  { href: "/dashboard/hse/observations",     label: "Observations",       icon: Eye,             desc: "Safety observations",  color: "bg-purple-50 text-purple-600" },
];

export default function HsePage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      countHsePermits(),
      countHseToolboxTalks(),
      countHseIncidents(),
      countHseRiskAssessments(),
      countHseObservations(),
    ]).then(([pm, tb, ic, ra, ob]) => {
      setCounts({
        permits: pm.count ?? 0, toolbox: tb.count ?? 0, incidents: ic.count ?? 0,
        risk: ra.count ?? 0, observations: ob.count ?? 0,
      });
      setLoading(false);
    });
  }, []);

  return (
    <HsePageShell title="HSE" description="Health, Safety & Environment management" icon={ShieldCheck}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(m => (
            <Link key={m.href} href={m.href}>
              <Card className="transition-colors hover:bg-muted/50 cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.color}`}>
                    <m.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{m.label}</p>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-lg font-bold tabular-nums">{counts[m.href.split("/").pop() || ""] || 0}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </HsePageShell>
  );
}
