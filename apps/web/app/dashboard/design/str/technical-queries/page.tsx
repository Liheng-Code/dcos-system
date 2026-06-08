import { DesignPageShell } from "@/components/design/design-page-shell";
import { StrTechnicalQueries } from "@/components/design/str-schedules";
import { HelpCircle } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Technical Queries" description="Site structural queries and clarifications" icon={<HelpCircle className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><StrTechnicalQueries /></DesignPageShell>); }
