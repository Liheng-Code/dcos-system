import { redirect } from "next/navigation";
import { can, requireHqUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TenantForm } from "@/components/tenant-forms";

export default async function NewTenantPage() {
  const user = await requireHqUser();
  if (!can(user, "manageTenants")) redirect("/tenants");
  return (
    <div className="max-w-2xl">
      <PageHeader title="New tenant" description="The customer company. Add its DCOS deployment next, then issue a license." />
      <TenantForm />
    </div>
  );
}
