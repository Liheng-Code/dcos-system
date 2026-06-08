"use client";

import { SitePageShell } from "@/components/site/site-page-shell";
import { SiteDailyReports } from "@/components/site/site-daily-reports";
import { FileText } from "lucide-react";

export default function DailyReportsPage() {
  return (
    <SitePageShell title="Daily Reports" description="Site diary with weather, work summary, and issues" icon={FileText}>
      <SiteDailyReports />
    </SitePageShell>
  );
}
