"use client";

import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { SitePageShell } from "@/components/construction/site/site-page-shell";
import { DrWorkspace } from "@/components/construction/daily-reporting/dr-workspace";

export default function DailyReportingPage() {
  return (
    <SitePageShell
      title="Daily Reporting"
      description="Versioned daily reports from each reporting unit, reviewed and approved by the Project Manager"
      icon={ClipboardCheck}
    >
      <Suspense fallback={null}>
        <DrWorkspace />
      </Suspense>
    </SitePageShell>
  );
}
