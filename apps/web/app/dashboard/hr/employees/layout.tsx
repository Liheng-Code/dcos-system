"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ListChecks } from "lucide-react";

const TABS = [
  { href: "/dashboard/hr/employees", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/hr/employees/list", label: "Detail List", icon: ListChecks },
];

export default function EmployeesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <div className="inline-flex items-center rounded-lg border bg-muted/40 p-1 shadow-sm">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
