"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TemplateListPage } from "@/components/stakeholders/template-list-page";
import { Loader2 } from "lucide-react";

export default function StakeholderTemplatesPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/");
      } else {
        setAuthed(true);
      }
    });
  }, [router]);

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stakeholder Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create reusable templates with company placeholders and teams for quick project setup.
        </p>
      </div>
      <TemplateListPage />
    </div>
  );
}
