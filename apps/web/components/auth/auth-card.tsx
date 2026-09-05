"use client";

import type { ReactNode } from "react";
import { HardHat } from "lucide-react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Shared centered-card shell for unauthenticated auth pages (/forgot-password,
 * /reset-password) — matches the visual style of the landing page's RightPanel/AuthForm
 * (06-UI-UX-Design.md USR-08/USR-09: "Single-column centered form, matching the visual
 * style of the landing page's auth-form.tsx").
 */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6 md:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <HardHat className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
