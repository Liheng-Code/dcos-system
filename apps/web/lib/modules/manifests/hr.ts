import { Clock, Users } from "lucide-react";
import { HR_GROUPS } from "@/lib/hr/hr-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const hrModule: ModuleManifest = {
  key: "hr",
  name: "HR Management",
  rbacModules: ["hr"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/hr"],
  navGroups: HR_GROUPS,
  groupIcons: {
    workforce: Users,
    time_payroll: Clock,
  },
  hub: {
    title: "HR Management",
    description: "Employee Master, Attendance, E-Leave, OT Management, Payroll, Employee Asset",
    href: "/dashboard/hr",
    icon: Users,
    gradient: "from-rose-500 to-pink-600",
    order: 9,
  },
};
