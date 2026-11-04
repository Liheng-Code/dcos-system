import { redirect } from "next/navigation";

// The Activity Database moved to core as the Construction Work Library (Administration).
export default function ActivityDatabasePage() {
  redirect("/dashboard/administration/work-library");
}
