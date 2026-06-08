import { DesignPageShell } from "@/components/design/design-page-shell";
import { StrCalcNotes } from "@/components/design/str-schedules";
import { Calculator } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Calculation Notes" description="Structural design calculations" icon={<Calculator className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><StrCalcNotes /></DesignPageShell>); }
