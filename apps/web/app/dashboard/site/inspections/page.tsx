"use client";

import { SitePageShell } from "@/components/site/site-page-shell";
import { SiteInspections } from "@/components/site/site-inspections";
import { ClipboardCheck } from "lucide-react";

export default function InspectionsPage() {
  return (
    <SitePageShell title="Inspections" description="Inspection requests and quality control" icon={ClipboardCheck} iconColor="text-indigo-600" iconBg="bg-indigo-50">
      <SiteInspections />
    </SitePageShell>
  );
}
