// Next.js 16 request proxy (formerly middleware). Applies the DCOS license to API
// routes before they run (design section 7.3, E2). Pages are guarded in the
// dashboard layout, which already owns page redirects.
//
// With DCOS_LICENSE_MODE unset or "off" this only makes sure (once per process)
// that the database checks are off too, so deployments without a license behave
// exactly as before.

import { NextResponse, type NextRequest } from "next/server";
import { getLicense, licenseMode, reportDenial, syncEnforcementMode } from "@/lib/licensing/server";
import { checkApiRequest } from "@/lib/licensing/guard";
import { denialBody } from "@/lib/licensing/errors";

export async function proxy(request: NextRequest) {
  const mode = licenseMode();
  if (mode === "off") {
    await syncEnforcementMode();
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  let denial;
  try {
    const { effective } = await getLicense();
    denial = checkApiRequest(effective, request.method, pathname);
  } catch (err) {
    // The license could not be read (database down): let the route answer for itself.
    console.error("[licensing] proxy could not load the license:", err);
    return NextResponse.next();
  }
  if (!denial) return NextResponse.next();

  if (mode === "report") {
    await reportDenial(denial, { method: request.method, path: pathname });
    return NextResponse.next();
  }
  return NextResponse.json(denialBody(denial), { status: 403 });
}

export const config = {
  matcher: ["/api/:path*"],
};
