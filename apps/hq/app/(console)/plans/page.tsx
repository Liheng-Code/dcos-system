import { can, requireHqUser } from "@/lib/auth";
import { allPlans } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PlanMatrix, PlanNote } from "@/components/plan-editor";

export default async function PlansPage() {
  const user = await requireHqUser();
  const plans = await allPlans();
  return (
    <div className="space-y-4">
      <PageHeader title="Plans & Catalogue" description="What each plan includes by default. Only the owner can edit." />
      <PlanNote />
      <PlanMatrix plans={plans} editable={can(user, "managePlans")} />
    </div>
  );
}
