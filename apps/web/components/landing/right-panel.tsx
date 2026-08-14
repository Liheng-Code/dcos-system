"use client";

import { useState } from "react";
import { AuthToggle } from "@/components/landing/auth-toggle";
import { AuthForm } from "@/components/landing/auth-form";
import { HardHat } from "lucide-react";

export function RightPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex items-center justify-center bg-muted md:col-span-2 min-h-screen p-6 md:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <HardHat className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight">
              Welcome to DCOS
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to manage your construction projects
            </p>
          </div>
        </div>
        <AuthToggle mode={mode} onChange={setMode} />
        <AuthForm mode={mode} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <button type="button" className="underline hover:text-foreground transition-colors">
            Terms of Service
          </button>{" "}
          and{" "}
          <button type="button" className="underline hover:text-foreground transition-colors">
            Privacy Policy
          </button>
        </p>
      </div>
    </div>
  );
}
