import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignRfiList } from "@/components/design/design-rfi-list";
import { HelpCircle } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Architecture RFI" description="Design clarifications and requests" icon={<HelpCircle className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <DesignRfiList discipline="arc" />
    </DesignPageShell>
  );
}
