"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function QtoItemRedirect({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = createClient();
      const { data: item } = await db.from("qto_items").select("session_version_id").eq("id", itemId).maybeSingle();
      const versionId = (item as { session_version_id: string | null } | null)?.session_version_id;
      if (!versionId) { setMissing(true); return; }
      const { data: v } = await db.from("qto_session_versions").select("session_id").eq("id", versionId).maybeSingle();
      const sessionId = (v as { session_id: string } | null)?.session_id;
      if (!sessionId) { setMissing(true); return; }
      router.replace(`/dashboard/qto/sessions/${sessionId}?version=${versionId}&item=${itemId}`);
    })();
  }, [itemId, router]);

  return missing ? (
    <p className="py-24 text-center text-sm text-muted-foreground">This take-off item was not found, or you do not have access to it.</p>
  ) : (
    <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );
}
