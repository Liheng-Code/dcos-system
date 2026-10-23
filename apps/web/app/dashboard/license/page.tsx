"use client";

// Where the route guard sends a user who opens a module outside the license
// ("?module=<key>") or any page while the license is locked (design 9.2.1).

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Lock, PackageX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLicense } from "@/contexts/license-context";
import { moduleLabel } from "@/lib/licensing/catalogue";

function LicenseNotice() {
  const params = useSearchParams();
  const { summary } = useLicense();
  const moduleKey = params.get("module");
  const admin = !!summary?.admin;
  const locked = summary?.enforced && summary.access === "locked";

  const Icon = locked ? Lock : PackageX;
  const title = locked
    ? "DCOS is not available"
    : moduleKey
      ? `${moduleLabel(moduleKey)} is not in your plan`
      : "Not in your plan";
  const body = locked
    ? summary?.state === "suspended"
      ? (summary.notice ?? "This deployment is suspended.")
      : "The license for this DCOS deployment is no longer active. Contact your administrator."
    : admin
      ? "This module is not included in your DCOS license. Contact DCOS to add it."
      : "This module is not included in your DCOS license. Ask your administrator if you need it.";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="flex gap-2">
        {!locked && (
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Back to dashboard
          </Link>
        )}
        {admin && (
          <Link href="/dashboard/administration/license" className={buttonVariants()}>
            View license
          </Link>
        )}
      </div>
    </div>
  );
}

export default function LicenseNoticePage() {
  return (
    <Suspense>
      <LicenseNotice />
    </Suspense>
  );
}
