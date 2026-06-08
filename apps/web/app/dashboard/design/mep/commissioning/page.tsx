import { DesignPageShell } from "@/components/design/design-page-shell";
import { MepCommissioning } from "@/components/design/mep-schedules";
import { Settings } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Commissioning Data" description="Testing and commissioning records" icon={<Settings className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><MepCommissioning /></DesignPageShell>); }
