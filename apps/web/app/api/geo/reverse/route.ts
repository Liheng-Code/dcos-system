import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");
  if (!lat || !lng) return NextResponse.json({ display_name: "" });

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "DCOS-AttendanceApp/1.0 (contact@dcos.local)",
      "Accept-Language": "en",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) return NextResponse.json({ display_name: "" });
  return NextResponse.json(await res.json());
}
