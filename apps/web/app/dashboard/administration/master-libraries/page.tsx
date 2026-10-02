"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MasterLibrariesPage } from "@/components/administration/master-libraries-page";

export default function MasterLibrariesRoute() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/");
      else setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return <MasterLibrariesPage />;
}
