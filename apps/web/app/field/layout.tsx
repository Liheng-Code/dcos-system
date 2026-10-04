import type { Metadata } from "next";

// The Field App is its own installable app: its own manifest and scope, no
// dashboard chrome, nothing that needs the network to render.
export const metadata: Metadata = {
  title: "DCOS Field — Daily Report",
  manifest: "/field/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DCOS Field" },
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-background">{children}</main>;
}
