"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CertificationPage } from "@/components/qs/certification-page";
import { getProgressClaimById, getClaimItems, type QsProgressClaim, type QsClaimItem } from "@/lib/qs/qs-service";
import { Loader2 } from "lucide-react";

export default function ClaimCertifyPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [checking, setChecking] = useState(true);
  const [claim, setClaim] = useState<QsProgressClaim | null>(null);
  const [items, setItems] = useState<QsClaimItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (checking || !id) return;
    setLoading(true);
    Promise.all([getProgressClaimById(id), getClaimItems(id)])
      .then(([c, i]) => {
        if (c.status !== "client_reviewed") {
          toast.error("This IPC is not ready for certification.");
          router.push("/dashboard/qs/claims");
          return;
        }
        setClaim(c);
        setItems(i);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load IPC");
        router.push("/dashboard/qs/claims");
      })
      .finally(() => setLoading(false));
  }, [checking, id, router]);

  if (checking || loading || !claim) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return <CertificationPage claim={claim} items={items} />;
}
