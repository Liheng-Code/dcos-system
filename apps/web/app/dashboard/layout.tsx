"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ProjectProvider } from "@/components/dashboard/project-context";
import { ProjectSwitcher } from "@/components/dashboard/project-switcher";
import { TaskAlertsMenu } from "@/components/dashboard/task-alerts-menu";
import { TaskAlertsProvider } from "@/components/dashboard/task-alerts-provider";
import { createClient } from "@/lib/supabase/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  // Validate session with the server on mount. If the JWT is stale (e.g. after
  // a Supabase restart) sign out and redirect to the login page instead of
  // flooding the console with repeated 403 errors.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ error }) => {
      if (error) {
        supabase.auth.signOut().finally(() => router.push("/"));
      }
    }).catch(() => {});
  }, [router]);

  return (
    <ProjectProvider>
      <TaskAlertsProvider>
        <div className="flex min-h-screen">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <div className="flex flex-1 flex-col">
            <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4 pr-6">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                {collapsed ? (
                  <PanelLeft className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
              <ProjectSwitcher />
              <div className="flex-1" />
              <TaskAlertsMenu />
              <UserMenu />
            </header>
            <main className="flex-1 bg-muted p-3">{children}</main>
          </div>
        </div>
      </TaskAlertsProvider>
    </ProjectProvider>
  );
}
