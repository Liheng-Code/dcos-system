"use client";

import { SitePageShell } from "@/components/site/site-page-shell";
import { SiteNcrs } from "@/components/site/site-ncrs";
import { AlertTriangle } from "lucide-react";

export default function NcrsPage() {
  return (
    <SitePageShell title="NCRs" description="Non-conformance reports and corrective actions" icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50">
      <SiteNcrs />
    </SitePageShell>
  );
}
