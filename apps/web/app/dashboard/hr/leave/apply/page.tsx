"use client";

import { useRouter } from "next/navigation";
import LeaveRequestForm from "@/components/hr/leave/leave-request-form";

export default function ApplyForLeavePage() {
  const router = useRouter();

  return (
    <div>
      <LeaveRequestForm
        title="Apply for leave"
        description="Submit a new leave request for approval. Add CC's and attachments as needed."
        onSuccess={() => router.push("/dashboard/hr/leave/my-requests")}
        onCancel={() => router.push("/dashboard/hr/leave")}
      />
    </div>
  );
}
