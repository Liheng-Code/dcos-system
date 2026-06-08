import { DesignPageShell } from "@/components/design/design-page-shell";
import { ArcDoorSchedule } from "@/components/design/arc-schedules";
import { DoorOpen } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Door Schedule" description="Door types, sizes, and hardware" icon={<DoorOpen className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <ArcDoorSchedule />
    </DesignPageShell>
  );
}
