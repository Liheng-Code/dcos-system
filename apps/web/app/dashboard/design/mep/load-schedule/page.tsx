import { DesignPageShell } from "@/components/design/design-page-shell";
import { MepLoadSchedule } from "@/components/design/mep-schedules";
import { Zap } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Load Schedule" description="Electrical and mechanical load schedules" icon={<Zap className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><MepLoadSchedule /></DesignPageShell>); }
