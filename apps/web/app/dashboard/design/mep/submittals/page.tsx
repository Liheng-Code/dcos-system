import { DesignPageShell } from "@/components/design/design-page-shell";
import { MepMaterialSubmittal } from "@/components/design/mep-schedules";
import { CheckSquare } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Material Submittals" description="MEP material and shop drawing submittals" icon={<CheckSquare className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><MepMaterialSubmittal /></DesignPageShell>); }
