import { DesignPageShell } from "@/components/design/design-page-shell";
import { ArcWindowSchedule } from "@/components/design/arc-schedules";
import { Square } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Window Schedule" description="Window types, sizes, and glass" icon={<Square className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <ArcWindowSchedule />
    </DesignPageShell>
  );
}
