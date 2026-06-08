import { DesignPageShell } from "@/components/design/design-page-shell";
import { ArcFinishSchedule } from "@/components/design/arc-schedules";
import { Palette } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Finish Schedule" description="Floor, wall, and ceiling finishes" icon={<Palette className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <ArcFinishSchedule />
    </DesignPageShell>
  );
}
