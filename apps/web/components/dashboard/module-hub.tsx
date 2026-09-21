"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  LayoutDashboard,
  BarChart2,
  FileText,
  CalendarRange,
  PenTool,
  ShoppingCart,
  Calculator,
  HardHat,
  Users,
  Box,
  Landmark,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useModuleSettings } from "@/contexts/module-settings-context";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";

interface ModuleCard {
  moduleKey: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  gradient: string;
  adminOnly?: boolean;
  hiddenForPrecontract?: boolean;
}

const MODULES: ModuleCard[] = [
  { moduleKey: "project", title: "Project", description: "Dashboard, projects, WBS, and task management", href: "/dashboard", icon: LayoutDashboard, gradient: "from-blue-500 to-indigo-600" },
  { moduleKey: "reporting", title: "Reporting", description: "Reports hub, scheduled reports, and insights", href: "/dashboard/reports", icon: BarChart2, gradient: "from-emerald-500 to-teal-600" },
  { moduleKey: "document_control", title: "Document Control", description: "Documents, transmittals, and audit log", href: "/dashboard/documents", icon: FileText, gradient: "from-sky-500 to-blue-600" },
  { moduleKey: "planning", title: "Planning", description: "Gantt chart, look-ahead, and resource loading", href: "/dashboard/planning", icon: CalendarRange, gradient: "from-indigo-500 to-violet-600", hiddenForPrecontract: true },
  { moduleKey: "design", title: "Design", description: "Architecture, structure, MEP, and BIM", href: "/dashboard/design", icon: PenTool, gradient: "from-violet-500 to-purple-600", hiddenForPrecontract: true },
  { moduleKey: "procurement", title: "Procurement", description: "BOQ, suppliers, RFQs, and purchase orders", href: "/dashboard/procurement", icon: ShoppingCart, gradient: "from-amber-500 to-orange-600" },
  { moduleKey: "qs", title: "Quantity Surveying", description: "Tenders, cost control, and contract admin", href: "/dashboard/qs", icon: Calculator, gradient: "from-cyan-500 to-sky-600" },
  { moduleKey: "construction", title: "Construction", description: "Daily reports, inspections, and HSE", href: "/dashboard/site", icon: HardHat, gradient: "from-orange-500 to-red-600", hiddenForPrecontract: true },
  { moduleKey: "hr", title: "HR Management", description: "Employee Master, Attendance, E-Leave, OT Management, Payroll, Employee Asset", href: "/dashboard/hr", icon: Users, gradient: "from-rose-500 to-pink-600" },
  { moduleKey: "inventory", title: "Inventory", description: "Stores, stock, GRN, and tools", href: "/dashboard/inventory", icon: Box, gradient: "from-teal-500 to-cyan-600" },
  { moduleKey: "account", title: "Account", description: "Chart of accounts, AP/AR, and ledger", href: "/dashboard/account", icon: Landmark, gradient: "from-green-500 to-emerald-600" },
  { moduleKey: "administration", title: "Administration", description: "Settings, stakeholders, and configuration", href: "/dashboard/settings", icon: Settings, gradient: "from-slate-600 to-slate-800", adminOnly: true },
];

export function ModuleHub() {
  const { isModuleActive, loading: modulesLoading } = useModuleSettings();
  const { selectedProject } = useProject();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) setIsAdmin(profile.role === "admin");
        });
    });
  }, []);

  const isPrecontract = selectedProject?.project_type === "tender";

  if (modulesLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const visibleModules = MODULES.filter((module) => {
    if (!isModuleActive(module.moduleKey)) return false;
    if (module.adminOnly && !isAdmin) return false;
    if (module.hiddenForPrecontract && isPrecontract) return false;
    return true;
  });

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {visibleModules.map((module) => {
        const href =
          module.moduleKey === "qs" && isPrecontract
            ? "/dashboard/tenders/register"
            : module.href;
        const Icon = module.icon;
        return (
          <Link
            key={module.moduleKey}
            href={href}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${module.gradient}`} />
            <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${module.gradient} transition-transform duration-300 group-hover:scale-105`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">{module.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
              {module.description}
            </p>
            <span
              className={`mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r ${module.gradient} px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 group-hover:gap-2.5`}
            >
              Open Module
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
