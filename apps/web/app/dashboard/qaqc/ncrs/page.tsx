"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function NcrsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/qaqc?sub=ncrs");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
