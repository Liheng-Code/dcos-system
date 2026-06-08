import { DesignPageShell } from "@/components/design/design-page-shell";
import { MepEquipment } from "@/components/design/mep-schedules";
import { Cpu } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Equipment Schedule" description="MEP equipment register" icon={<Cpu className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><MepEquipment /></DesignPageShell>); }
