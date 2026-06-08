import { DesignPageShell } from "@/components/design/design-page-shell";
import { StrRebarReview } from "@/components/design/str-schedules";
import { GitCompare } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Rebar / Shop Drawing Review" description="Rebar shop drawing review and approval" icon={<GitCompare className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><StrRebarReview /></DesignPageShell>); }
