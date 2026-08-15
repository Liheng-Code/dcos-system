"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OTRequestDetail } from "@/components/hr/overtime/ot-request-detail";

export default function OTSingleRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true) }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-3xl mx-auto pt-[5rem] pb-6">
      <OTRequestDetail
        requestId={id}
        onClose={() => router.push("/dashboard/hr/overtime/my-requests")}
        onStatusChange={() => {}}
      />
    </div>
  );
}
