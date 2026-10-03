import { redirect } from "next/navigation";

// WBS templates moved to Administration › Master Libraries › WBS Templates.
export default function WbsTemplatesPage() {
  redirect("/dashboard/administration/master-libraries");
}
