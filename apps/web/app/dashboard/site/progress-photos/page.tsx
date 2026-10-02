"use client";

import { SitePageShell } from "@/components/construction/site/site-page-shell";
import { SiteProgressPhotos } from "@/components/construction/site/site-progress-photos";
import { Camera } from "lucide-react";

export default function ProgressPhotosPage() {
  return (
    <SitePageShell title="Progress Photos" description="Site photo documentation" icon={Camera} iconColor="text-purple-600" iconBg="bg-purple-50">
      <SiteProgressPhotos />
    </SitePageShell>
  );
}
