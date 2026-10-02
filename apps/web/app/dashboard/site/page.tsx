"use client";

import { useEffect, useState } from "react";
import { countInspectionRequests, countNcrs, countSiteDailyReports, countSiteEquipment, countSiteManpower, countSiteProgressPhotos } from "@/lib/construction/construction-queries";
import { SitePageShell } from "@/components/construction/site/site-page-shell";
import { HardHat, FileText, Users, Wrench, Camera, ClipboardCheck, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const MODULES = [
  { href: "/dashboard/site/daily-reports",  label: "Daily Reports",  icon: FileText,        desc: "Site diary, weather, issues", color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/site/manpower",       label: "Manpower",       icon: Users,           desc: "Labor tracking by trade",     color: "bg-green-50 text-green-600" },
  { href: "/dashboard/site/equipment",      label: "Equipment",      icon: Wrench,          desc: "Heavy equipment register",    color: "bg-orange-50 text-orange-600" },
  { href: "/dashboard/site/progress-photos", label: "Progress Photos", icon: Camera,        desc: "Photo documentation",         color: "bg-purple-50 text-purple-600" },
  { href: "/dashboard/site/inspections",    label: "Inspections",    icon: ClipboardCheck,  desc: "Inspection requests & ITP",   color: "bg-indigo-50 text-indigo-600" },
  { href: "/dashboard/site/ncrs",           label: "NCRs",           icon: AlertTriangle,   desc: "Non-conformance reports",     color: "bg-red-50 text-red-600" },
];

export default function SitePage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      countSiteDailyReports(),
      countSiteManpower(),
      countSiteEquipment(),
      countSiteProgressPhotos(),
      countInspectionRequests(),
      countNcrs(),
    ]).then(([dr, mp, eq, pp, ir, nc]) => {
      setCounts({
        "daily-reports": dr.count ?? 0,
        "manpower": mp.count ?? 0,
        "equipment": eq.count ?? 0,
        "progress-photos": pp.count ?? 0,
        "inspections": ir.count ?? 0,
        "ncrs": nc.count ?? 0,
      });
      setLoading(false);
    });
  }, []);

  return (
    <SitePageShell title="Site Execution" description="Daily construction tracking and QA/QC" icon={HardHat}>
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
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <span className="text-lg font-bold tabular-nums">{counts[m.href.split("/").pop() || ""] || 0}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </SitePageShell>
  );
}
