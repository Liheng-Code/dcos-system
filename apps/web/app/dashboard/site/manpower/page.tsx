"use client";

import { SitePageShell } from "@/components/construction/site/site-page-shell";
import { SiteManpower } from "@/components/construction/site/site-manpower";
import { Users } from "lucide-react";

export default function ManpowerPage() {
  return (
    <SitePageShell title="Manpower" description="Daily labor tracking by trade and contractor" icon={Users}>
      <SiteManpower />
    </SitePageShell>
  );
}
