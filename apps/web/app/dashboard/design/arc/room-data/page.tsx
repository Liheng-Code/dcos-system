import { DesignPageShell } from "@/components/design/design-page-shell";
import { ArcRoomDataSheet } from "@/components/design/arc-room-data-sheet";
import { Grid } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Room Data Sheets" description="Room requirements and finishes" icon={<Grid className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <ArcRoomDataSheet />
    </DesignPageShell>
  );
}
