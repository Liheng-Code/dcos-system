"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ProjectProvider } from "@/components/dashboard/project-context";
import { ProjectSwitcher } from "@/components/dashboard/project-switcher";
import { TaskAlertsMenu } from "@/components/dashboard/task-alerts-menu";
import { TaskAlertsProvider } from "@/components/dashboard/task-alerts-provider";
import { ModuleSettingsProvider, useModuleSettings } from "@/contexts/module-settings-context";
import { isRouteBlocked } from "@/lib/module-settings-service";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, permittedModuleKeys, permittedLoading, activeKeys, navItemSettings, navLoading } = useModuleSettings();
  const isLoading = loading || permittedLoading || navLoading;
  const blocked =
    !isLoading &&
    isRouteBlocked(pathname, permittedModuleKeys, { activeModuleKeys: activeKeys, navItemSettings });

  useEffect(() => {
    if (blocked) {
      router.replace("/dashboard");
    }
  }, [blocked, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (blocked) {
    return null;
  }

  return <>{children}</>;
}

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
    <ModuleSettingsProvider>
      <ProjectProvider>
        <TaskAlertsProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 pr-6">
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
              <main className="min-h-0 flex-1 overflow-auto bg-muted p-2">
                <RouteGuard>{children}</RouteGuard>
              </main>
            </div>
          </div>
        </TaskAlertsProvider>
      </ProjectProvider>
    </ModuleSettingsProvider>
  );
}
