import { DesignPageShell } from "@/components/design/design-page-shell";
import { MepSleeveCoordination } from "@/components/design/mep-schedules";
import { GitCompare } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Sleeve/Opening Coordination" description="MEP sleeves and structural openings" icon={<GitCompare className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><MepSleeveCoordination /></DesignPageShell>); }
