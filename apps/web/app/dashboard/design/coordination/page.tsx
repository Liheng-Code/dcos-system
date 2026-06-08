import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignCoordinationLog } from "@/components/design/design-coordination-log";
import { GitBranch } from "lucide-react";

export default function Page() {
  return (
    <DesignPageShell title="Cross-Discipline Coordination" description="Coordination log between Architecture, Structure, and MEP" icon={<GitBranch className="h-5 w-5 text-indigo-600" />}>
      <DesignCoordinationLog />
    </DesignPageShell>
  );
}
