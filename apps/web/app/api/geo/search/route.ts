import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q?.trim()) return NextResponse.json([]);

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "DCOS-AttendanceApp/1.0 (contact@dcos.local)",
      "Accept-Language": "en",
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) return NextResponse.json([]);
  return NextResponse.json(await res.json());
}
