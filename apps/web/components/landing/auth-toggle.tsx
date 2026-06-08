"use client";

import { cn } from "@/lib/utils";

interface AuthToggleProps {
  mode: "signin" | "signup";
  onChange: (mode: "signin" | "signup") => void;
}

export function AuthToggle({ mode, onChange }: AuthToggleProps) {
  return (
    <div className="flex border-b border-border mb-6">
      <button
        type="button"
        onClick={() => onChange("signin")}
        className={cn(
          "flex-1 pb-3 text-sm font-medium transition-colors relative",
          mode === "signin"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Sign In
        {mode === "signin" && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange("signup")}
        className={cn(
          "flex-1 pb-3 text-sm font-medium transition-colors relative",
          mode === "signup"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Sign Up
        {mode === "signup" && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
        )}
      </button>
    </div>
  );
}
