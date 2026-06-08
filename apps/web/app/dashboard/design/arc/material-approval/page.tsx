import { DesignPageShell } from "@/components/design/design-page-shell";
import { ArcMaterialApproval } from "@/components/design/arc-schedules";
import { CheckSquare } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Material Approval" description="Material selection and approval" icon={<CheckSquare className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <ArcMaterialApproval />
    </DesignPageShell>
  );
}
