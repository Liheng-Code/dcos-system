import { redirect } from "next/navigation";
import { getHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  license_admin: "License admin",
  account_manager: "Account manager",
  support: "Support",
  ops: "Ops",
  viewer: "Viewer",
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getHqUser();
  if (!user) redirect("/login?denied=1");

  const db = serviceClient();
  const [{ data: tenants }, { count: drafts }] = await Promise.all([
    db.from("tenants").select("id, display_name, code").is("deleted_at", null).order("display_name"),
    db.from("licenses").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={{ email: user.email }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          // HQ_ENVIRONMENT names this HQ instance (Local, Staging, Production).
          environment={process.env.HQ_ENVIRONMENT ?? "Local"}
          tenants={tenants ?? []}
          drafts={drafts ?? 0}
          user={{ name: user.displayName, role: ROLE_LABEL[user.role] ?? user.role }}
        />
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
