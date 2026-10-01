import {
  BookTemplate,
  Building2,
  Cog,
  FileClock,
  FileText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ModuleManifest } from "@/lib/modules/types";

export const administrationModule: ModuleManifest = {
  key: "administration",
  name: "Administration",
  rbacModules: ["admin_config"],
  // Never role-blocked by the route guard: the (isAdmin || isHr) sidebar gate
  // is the single source of truth for who enters these routes.
  roleGoverned: false,
  routePrefixes: ["/dashboard/administration", "/dashboard/settings"],
  sidebarGate: "admin_or_hr",
  navItems: [
    { href: "/dashboard/settings", label: "Settings", icon: Cog },
    { href: "/dashboard/administration/users", label: "User Management", icon: Users },
    { href: "/dashboard/administration/roles-permissions", label: "Roles & Permissions", icon: ShieldCheck },
    { href: "/dashboard/administration/departments", label: "Departments", icon: Building2 },
    { href: "/dashboard/administration/security", label: "Security", icon: ShieldAlert },
    { href: "/dashboard/administration/audit-logs", label: "Audit Logs", icon: FileClock },
    { href: "/dashboard/administration/stakeholder-templates", label: "Stakeholder Templates", icon: FileText },
    { href: "/dashboard/administration/master-libraries", label: "Master Libraries", icon: BookTemplate },
  ],
  hub: {
    title: "Administration",
    description: "Settings, stakeholders, and configuration",
    href: "/dashboard/settings",
    icon: Settings,
    gradient: "from-slate-600 to-slate-800",
    order: 12,
    adminOnly: true,
  },
};
