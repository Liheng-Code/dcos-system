import { notFound, redirect } from "next/navigation";
import { can, requireHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { allDeployments, allPlans, allTenants } from "@/lib/queries";
import type { License } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { LicenseForm, type LicenseFormMode } from "@/components/license-form";

// ?tenant=<id> preselects a tenant. ?from=<license id>&mode=renew|change drafts a
// new revision of that live license.
export default async function NewLicensePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireHqUser();
  if (!can(user, "manageLicenses")) redirect("/licenses");
  const { tenant, from: fromId, mode: modeParam } = await searchParams;

  let from: License | null = null;
  if (fromId) {
    const { data } = await serviceClient().from("licenses").select("*").eq("id", fromId).maybeSingle<License>();
    if (!data) notFound();
    from = data;
  }
  const mode: LicenseFormMode = from ? (modeParam === "change" ? "change" : "renew") : "new";
  const [tenants, deployments, plans] = await Promise.all([allTenants(), allDeployments(), allPlans()]);

  const title = mode === "renew" ? `Renew ${from!.number}` : mode === "change" ? `Change ${from!.number}` : "Create license";
  const description =
    mode === "renew"
      ? "Drafts the next revision, starting the day after the current term ends."
      : mode === "change"
        ? "Drafts the next revision with a different plan, modules or limits, keeping the current term."
        : "Drafts a license. You sign it on the next screen with your key file.";

  return (
    <div className="max-w-4xl">
      <PageHeader title={title} description={description} />
      <LicenseForm
        mode={mode}
        tenants={tenants}
        deployments={deployments}
        plans={plans}
        initialTenantId={tenant ?? null}
        from={from}
      />
    </div>
  );
}
