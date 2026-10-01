"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { useModuleSettings } from "@/contexts/module-settings-context";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";
import { HUB_MODULES } from "@/lib/modules/registry";
import { getProfileById } from "@/lib/dashboard/dashboard-queries";

export function ModuleHub() {
  const { isModuleActive, loading: modulesLoading } = useModuleSettings();
  const { selectedProject } = useProject();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      getProfileById(data.user.id, "role")
        .then(({ data: profile }) => {
          if (profile) setIsAdmin(profile.role === "admin");
        });
    });
  }, []);

  const isPrecontract = selectedProject?.project_type === "tender";
  // Same rule as the sidebar: Design & Build / Turnkey tenders carry the design.
  const isDesignTender = isPrecontract && ["design_build", "turnkey"].includes(selectedProject?.contract_type ?? "");

  if (modulesLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const visibleModules = HUB_MODULES.filter((manifest) => {
    if (!isModuleActive(manifest.key)) return false;
    if (manifest.hub.adminOnly && !isAdmin) return false;
    if (manifest.visible && !manifest.visible({ isPrecontract, isDesignTender })) return false;
    return true;
  });

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {visibleModules.map((manifest) => {
        const card = manifest.hub;
        const href = isPrecontract && card.precontractHref ? card.precontractHref : card.href;
        const Icon = card.icon;
        return (
          <Link
            key={manifest.key}
            href={href}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.gradient}`} />
            <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} transition-transform duration-300 group-hover:scale-105`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
              {card.description}
            </p>
            <span
              className={`mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r ${card.gradient} px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 group-hover:gap-2.5`}
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
