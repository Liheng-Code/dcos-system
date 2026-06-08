"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WbsTaskEditSheet } from "@/components/wbs/wbs-task-edit-sheet";
import { type WbsTaskRecord } from "@/components/wbs/wbs-types";

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const supabase = useMemo(() => createClient(), []);
  const [task, setTask] = useState<WbsTaskRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router, supabase]);

  useEffect(() => {
    if (!taskId || checking) return;
    setLoading(true);
    supabase.from("wbs_tasks").select("*").eq("id", taskId).single().then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/tasks"); return; }
      setTask(data as WbsTaskRecord);
      setLoading(false);
    });
  }, [taskId, supabase, router, checking]);

  if (checking || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="flex h-full flex-col">
      <WbsTaskEditSheet
        task={task}
        projectId={task.project_id}
        wbsNodeId={task.wbs_node_id}
        onClose={() => router.back()}
        onSave={() => { router.back(); }}
        fullPage
      />
    </div>
  );
}
