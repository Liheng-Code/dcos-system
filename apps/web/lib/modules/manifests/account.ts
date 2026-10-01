import { BarChart2, Landmark, LayoutDashboard } from "lucide-react";
import { ACCOUNT_GROUPS } from "@/lib/account/account-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const accountModule: ModuleManifest = {
  key: "account",
  name: "Account",
  rbacModules: ["account_finance"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/account"],
  navGroups: ACCOUNT_GROUPS,
  groupIcons: {
    overview: LayoutDashboard,
    reports: BarChart2,
  },
  hub: {
    title: "Account",
    description: "Chart of accounts, AP/AR, and ledger",
    href: "/dashboard/account",
    icon: Landmark,
    gradient: "from-green-500 to-emerald-600",
    order: 11,
  },
};
