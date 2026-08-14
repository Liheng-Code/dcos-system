"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { BudgetConfirmationForm } from "@/components/procurement/budget-confirmation-form";

export default function NewBudgetConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setAuthed(true);
      setChecking(false);
    });
  }, [router]);

  if (checking) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!authed) return null;

  return <BudgetConfirmationForm prId={id} />;
}
