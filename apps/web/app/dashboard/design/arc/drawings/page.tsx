import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignDrawingList } from "@/components/design/design-drawing-list";
import { FileText } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Architecture Drawings" description="ARC drawing register" icon={<FileText className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50">
      <DesignDrawingList discipline="arc" />
    </DesignPageShell>
  );
}
