"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ProjectProvider } from "@/components/dashboard/project-context";
import { ProjectSwitcher } from "@/components/dashboard/project-switcher";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { TaskAlertsMenu } from "@/components/dashboard/task-alerts-menu";
import { TaskAlertsProvider } from "@/components/dashboard/task-alerts-provider";
import { ModuleSettingsProvider, useModuleSettings } from "@/contexts/module-settings-context";
import { isRouteBlocked } from "@/lib/module-settings-service";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { LicenseProvider, useLicense } from "@/contexts/license-context";
import { LicenseBanner } from "@/components/administration/license/license-banner";
import { entitlementForPath } from "@/lib/licensing/catalogue";
import { isPageAllowedWhenLocked } from "@/lib/licensing/guard";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, permittedModuleKeys, permittedLoading, activeKeys, navItemSettings, navLoading } = useModuleSettings();
  const license = useLicense();
  const isLoading = loading || permittedLoading || navLoading || license.loading;
  const licenseRedirect = isLoading ? null : licenseRedirectFor(pathname, license);
  const blocked =
    !isLoading &&
    !licenseRedirect &&
    isRouteBlocked(pathname, permittedModuleKeys, { activeModuleKeys: activeKeys, navItemSettings });

  useEffect(() => {
    if (licenseRedirect) {
      router.replace(licenseRedirect);
    } else if (blocked) {
      router.replace("/dashboard");
    }
  }, [blocked, licenseRedirect, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (blocked || licenseRedirect) {
    return null;
  }

  return <>{children}</>;
}

// Where the license sends this path, or null to let it through (design 9.2.1).
// Locked: everyone but administrators sees the license notice; administrators keep
// Administration so they can renew and export. Unlicensed module: "not in your plan".
function licenseRedirectFor(pathname: string, license: ReturnType<typeof useLicense>): string | null {
  const summary = license.summary;
  if (!summary || !summary.enforced) return null;
  if (pathname.startsWith("/dashboard/license")) return null;
  if (summary.access === "locked") {
    const admin = !!summary.admin;
    if (isPageAllowedWhenLocked(pathname)) return null;
    if (admin && pathname.startsWith("/dashboard/administration")) return null;
    return admin ? "/dashboard/administration/license" : "/dashboard/license";
  }
  if (!license.isPathLicensed(pathname)) {
    const key = entitlementForPath(pathname);
    return `/dashboard/license?module=${encodeURIComponent(key ?? "")}`;
  }
  return null;
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
    <LicenseProvider>
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
                  <CommandPalette />
                  <div className="flex-1" />
                  <TaskAlertsMenu />
                  <UserMenu />
                </header>
                <LicenseBanner />
                <main className="min-h-0 flex-1 overflow-auto bg-muted p-2">
                  <RouteGuard>{children}</RouteGuard>
                </main>
              </div>
            </div>
          </TaskAlertsProvider>
        </ProjectProvider>
      </ModuleSettingsProvider>
    </LicenseProvider>
  );
}
