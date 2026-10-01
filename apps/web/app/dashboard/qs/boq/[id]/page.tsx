"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BoqBuilder } from "@/components/qs/boq-builder";
import { UpdateBoqSlideIn } from "@/components/qs/update-boq-slidein";
import { getBoq, type QsBoq } from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

const BOQ_TYPE_LABELS: Record<string, string> = {
  preliminary: "Preliminary",
  main_works: "Main Works",
  variation: "Variation",
  provisional_sum: "Provisional Sum",
  supplement: "Supplement",
};

export default function BoqDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { can } = useQsPermissions();

  const [checking, setChecking] = useState(true);
  const [boq, setBoq] = useState<QsBoq | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getBoq(id)
      .then(setBoq)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load BOQ");
        router.push("/dashboard/qs/boq");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (checking || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!boq) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Page header with breadcrumb */}
      <div className="shrink-0 border-b border-border bg-white px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/dashboard/qs" className="hover:text-primary">QS & Cost</Link>
          <span>/</span>
          <Link href="/dashboard/qs/boq" className="hover:text-primary">Bill of Quantities</Link>
          <span>/</span>
          <span className="font-medium text-slate-800">{boq.boq_number}</span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/dashboard/qs/boq"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{boq.title}</h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                  v{boq.version}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {boq.boq_number} · {BOQ_TYPE_LABELS[boq.boq_type] ?? boq.boq_type} · {boq.currency_code}
              </p>
            </div>
          </div>
          {can("boq", "edit") && (
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit BOQ
            </Button>
          )}
        </div>
      </div>

      {/* Builder content */}
      <div className="flex-1 overflow-y-auto p-6">
        <BoqBuilder projectId={boq.project_id} boqId={boq.id} boq={boq} />
      </div>

      {showEdit && boq && (
        <UpdateBoqSlideIn
          boq={boq}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => {
            setBoq(updated);
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
}
