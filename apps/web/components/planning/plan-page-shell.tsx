"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PlanPageShell({
  title,
  description,
  icon: Icon,
  children,
  iconBg = "bg-teal-50",
  iconColor = "text-teal-600",
  contentClassName = "flex-1 overflow-y-auto p-6",
  headerClassName = "shrink-0 border-b border-border px-6 py-4",
  hideHeader = false,
}: {
  title: string; description: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
  iconBg?: string; iconColor?: string;
  contentClassName?: string; headerClassName?: string;
  /** Drop the title/description bar — the header tab already names the page. */
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  if (checking) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <div className={headerClassName}>
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
