"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Shield, Building2, BookType } from "lucide-react";
import { cn } from "@/lib/utils";
import { RolePermissionsPage } from "@/components/settings/role-permissions-page";
import { CompanyProfilePage } from "@/components/settings/company-profile-page";
import { NamingConventionAdminPage } from "@/components/naming/naming-convention-admin-page";

type Tab = "roles" | "company" | "naming";

const tabs: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: "company", label: "Company Profile", icon: Building2 },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "naming", label: "Naming Convention", icon: BookType },
];

export default function SettingsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("company");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/");
        return;
      }
      supabase.from("profiles").select("role").eq("id", data.session.user.id).single().then(({ data: profile }) => {
        if (profile && profile.role !== "admin") {
          router.push("/dashboard");
        } else {
          setChecking(false);
        }
      });
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative",
                tab === t.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      {tab === "company" && <CompanyProfilePage />}
      {tab === "roles" && <RolePermissionsPage />}
      {tab === "naming" && <NamingConventionAdminPage />}
    </div>
  );
}
