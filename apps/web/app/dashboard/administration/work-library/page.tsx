"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Network } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WorkLibraryView } from "@/components/work-library/work-library-view";

const spinner = <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

// Construction Work Library: CSI division -> activity -> BOQ, method statement, material, coordination,
// shop drawing, resource, T&C and procurement package. Core master data; Planning and QS link here.
export default function WorkLibraryPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/");
      else setChecking(false);
    });
  }, [router]);

  if (checking) return spinner;

  return (
    <Suspense fallback={spinner}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <Network className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Construction Work Library</h1>
              <p className="text-sm text-muted-foreground">
                Divisions, activities and what each needs: BOQ items, method statements, materials, coordination, shop drawings, resources, T&amp;C and procurement packages
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6"><WorkLibraryView /></div>
      </div>
    </Suspense>
  );
}
