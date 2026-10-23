"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

interface Props {
  environment: string;
  tenants: { id: string; display_name: string; code: string }[];
  drafts: number;
  user: { name: string; role: string };
}

// Top bar (reference: the "Acme Corporation · Production" bar): which HQ this is,
// jump to a tenant, waiting drafts, theme, who is signed in.
export function Topbar({ environment, tenants, drafts, user }: Props) {
  const router = useRouter();
  const production = environment.toLowerCase() === "production";
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
      <select
        aria-label="Go to tenant"
        defaultValue=""
        onChange={(e) => e.target.value && router.push(`/tenants/${e.target.value}`)}
        className="max-w-64 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium"
      >
        <option value="">All tenants ({tenants.length})</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.display_name} · {t.code}
          </option>
        ))}
      </select>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
          production
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300",
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {environment}
      </span>
      <div className="flex-1" />
      <Link
        href="/licenses?state=draft"
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`${drafts} unsigned draft${drafts === 1 ? "" : "s"}`}
        title={`${drafts} unsigned draft${drafts === 1 ? "" : "s"}`}
      >
        <Bell className="h-4 w-4" />
        {drafts > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
            {drafts}
          </span>
        )}
      </Link>
      <ThemeToggle />
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-sm leading-tight md:block">
          <span className="block font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{user.role}</span>
        </span>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // Read the class the pre-paint script in app/layout.tsx applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("hq-theme", next ? "dark" : "light");
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
