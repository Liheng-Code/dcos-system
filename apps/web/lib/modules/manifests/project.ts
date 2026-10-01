import { LayoutDashboard, HardHat, FolderTree, UserCheck, ListChecks, Network, Users } from "lucide-react";
import type { ModuleManifest } from "@/lib/modules/types";

export const projectModule: ModuleManifest = {
  key: "project",
  name: "Project",
  rbacModules: ["task_management"],
  roleGoverned: true,
  routePrefixes: [
    "/dashboard/projects",
    "/dashboard/wbs",
    "/dashboard/tasks",
    "/dashboard/my-tasks",
    "/dashboard/department",
    "/dashboard/stakeholders",
  ],
  navItems: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/projects", label: "Projects", icon: HardHat },
    { href: "/dashboard/wbs", label: "WBS", icon: FolderTree, precontractLabel: "WBS (Preliminary)" },
    { href: "/dashboard/my-tasks", label: "My Tasks", icon: UserCheck, executionOnly: true },
    { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks, executionOnly: true },
    { href: "/dashboard/department", label: "Department", icon: Network, executionOnly: true },
    { href: "/dashboard/stakeholders", label: "Stakeholders", icon: Users },
  ],
  hub: {
    title: "Project",
    description: "Dashboard, projects, WBS, and task management",
    href: "/dashboard",
    icon: LayoutDashboard,
    gradient: "from-blue-500 to-indigo-600",
    order: 1,
  },
};
