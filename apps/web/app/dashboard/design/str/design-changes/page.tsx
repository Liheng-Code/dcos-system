import { DesignPageShell } from "@/components/design/design-page-shell";
import { StrDesignChanges } from "@/components/design/str-schedules";
import { GitBranch } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Design Changes" description="Structural design change control" icon={<GitBranch className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><StrDesignChanges /></DesignPageShell>); }
