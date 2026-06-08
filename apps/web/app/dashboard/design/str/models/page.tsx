import { DesignPageShell } from "@/components/design/design-page-shell";
import { StrModelRegister } from "@/components/design/str-schedules";
import { Box } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Model Register" description="ETABS/SAFE/Revit model tracking" icon={<Box className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><StrModelRegister /></DesignPageShell>); }
