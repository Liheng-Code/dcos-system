"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MyTasksDashboard } from "@/components/project/tasks/my-tasks-dashboard";
import { MyWorkspace } from "@/components/project/tasks/my-workspace";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MyTasksPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"work" | "overview">("work");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 pt-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "work" | "overview")}>
          <TabsList>
            <TabsTrigger value="work">My Work</TabsTrigger>
            <TabsTrigger value="overview">Overview &amp; approvals</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1">{tab === "work" ? <MyWorkspace /> : <MyTasksDashboard />}</div>
    </div>
  );
}
