import { DesignPageShell } from "@/components/design/design-page-shell";
import { BimModelRegister } from "@/components/bim/bim-model-register";
import { Box } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell
      title="BIM Viewer"
      description="IFC model import, 3D visualization, and element property inspection"
      icon={<Box className="h-5 w-5 text-blue-600" />}
      iconBg="bg-blue-50"
    >
      <BimModelRegister />
    </DesignPageShell>
  );
}
