"use client";

import { SitePageShell } from "@/components/construction/site/site-page-shell";
import { SiteEquipment } from "@/components/construction/site/site-equipment";
import { Wrench } from "lucide-react";

export default function EquipmentPage() {
  return (
    <SitePageShell title="Equipment" description="Heavy equipment tracking and status" icon={Wrench}>
      <SiteEquipment />
    </SitePageShell>
  );
}
