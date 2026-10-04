import { NextResponse } from "next/server";

// Web app manifest for the Field App. Separate from app/manifest.ts (the
// attendance app), with its own scope so each installs as its own icon.
export function GET() {
  return NextResponse.json(
    {
      name: "DCOS Field — Daily Report",
      short_name: "DCOS Field",
      description: "Write the daily site report, with or without signal",
      start_url: "/field?source=pwa",
      scope: "/field",
      display: "standalone",
      background_color: "#fafafa",
      theme_color: "#223d81",
      icons: [
        { src: "/icons/192", sizes: "192x192", type: "image/png" },
        { src: "/icons/512", sizes: "512x512", type: "image/png" },
        { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
