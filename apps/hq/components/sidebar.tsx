"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Building2, FileClock, KeyRound, LayoutDashboard, LogOut, Package, ScrollText, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui";

// Design 9.1 navigation. Later phases add Onboarding, Subscriptions, Usage,
// Releases, Deployments, Support and Notifications.
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/licenses", label: "Licenses", icon: ScrollText },
  { href: "/plans", label: "Plans & Catalogue", icon: Package },
  { href: "/keys", label: "Signing Keys", icon: KeyRound },
  { href: "/audit", label: "Audit Log", icon: FileClock },
];

export function Sidebar({ user }: { user: { email: string } }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="rounded-lg bg-amber-500 p-1.5 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-bold leading-tight">DCOS HQ</div>
          <div className="text-[11px] text-sidebar-muted">Licensing control plane</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-sidebar-active text-white" : "text-sidebar-muted hover:bg-sidebar-active hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-sidebar-muted">
        <span title={user.email}>DCOS HQ v0.1</span>
        <button onClick={signOut} className="flex items-center gap-1.5 hover:text-white">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
