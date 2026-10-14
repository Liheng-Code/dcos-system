"use client";

import { Suspense, use } from "react";
import { ProjectWorkspace } from "@/components/project/projects/project-workspace";

// /dashboard/projects/[code] and /dashboard/projects/[code]/[tab]
export default function ProjectWorkspacePage({ params }: { params: Promise<{ code: string; tab?: string[] }> }) {
  const { code, tab } = use(params);
  const projectCode = decodeURIComponent(code);
  // Suspense: the workspace reads ?step for the edit wizard (useSearchParams).
  return (
    <Suspense>
      <ProjectWorkspace key={projectCode} code={projectCode} tab={tab?.[0] ?? null} />
    </Suspense>
  );
}
