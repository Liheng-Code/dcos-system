import Link from "next/link";
import { Database, ExternalLink } from "lucide-react";

/** Where each QS-owned Activity Database tab is edited. */
export const QS_SOURCE = {
  boq: { label: "Cost Item Library", href: "/dashboard/qs/dwl-cost-items" },
  material: { label: "Material Master", href: "/dashboard/qs/dwl-materials" },
  resource: { label: "All Resources", href: "/dashboard/qs/dwl-resources" },
} as const;

/** Banner for tabs that show Quantity Surveying data: read-only here, edited in the QS cost library. */
export function QsSourceNote({ source, children }: { source: keyof typeof QS_SOURCE; children?: React.ReactNode }) {
  const { label, href } = QS_SOURCE[source];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Database className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium text-foreground">From the QS Cost Library, read-only here.</span> {children}
        </span>
      </p>
      <Link href={href} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
        Open {label} in QS <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
