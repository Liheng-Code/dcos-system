"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ModuleSettingsProvider } from "@/contexts/module-settings-context";
import { ProjectProvider } from "@/components/dashboard/project-context";
import { TaskAlertsProvider } from "@/components/dashboard/task-alerts-provider";
import { ModuleHub } from "@/components/dashboard/module-hub";
import { UserMenu } from "@/components/dashboard/user-menu";

const WELCOME_TEXT = "Welcome to Digital Construction Operating System (DCOS)";
const TYPE_SPEED_MS = 32;
const IDLE_BEFORE_DELETE_MS = 6000;
const PAUSE_BEFORE_RETYPE_MS = 600;

type TypePhase = "typing" | "idle" | "deleting";

function TypewriterTitle() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<TypePhase>("typing");
  const full = count >= WELCOME_TEXT.length;

  useEffect(() => {
    let t: number;
    if (phase === "typing") {
      if (full) {
        t = window.setTimeout(() => setPhase("idle"), 400);
      } else {
        t = window.setTimeout(() => setCount((c) => c + 1), TYPE_SPEED_MS);
      }
    } else if (phase === "idle") {
      t = window.setTimeout(() => setPhase("deleting"), IDLE_BEFORE_DELETE_MS);
    } else {
      if (count === 0) {
        t = window.setTimeout(() => setPhase("typing"), PAUSE_BEFORE_RETYPE_MS);
      } else {
        t = window.setTimeout(() => setCount((c) => c - 1), TYPE_SPEED_MS);
      }
    }
    return () => window.clearTimeout(t);
  }, [phase, count, full]);

  const textClass =
    "animate-text-shine whitespace-nowrap bg-gradient-to-r from-blue-700 via-indigo-500 to-blue-700 text-xl font-bold tracking-tight sm:text-2xl md:text-3xl";

  return (
    <div className="relative flex min-w-0 max-w-full justify-center overflow-hidden">
      <h1 className={`${textClass} invisible`}>{WELCOME_TEXT}</h1>
      <div className="absolute inset-0 flex items-center justify-center">
        <h1 className={textClass}>{WELCOME_TEXT.slice(0, count)}</h1>
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[1.1em] w-[3px] animate-pulse rounded-full bg-indigo-500"
        />
      </div>
    </div>
  );
}

export default function ModulesPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ error }) => {
      if (error) {
        router.push("/");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ModuleSettingsProvider>
      <ProjectProvider>
        <TaskAlertsProvider>
          <div className="relative min-h-screen bg-slate-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-indigo-100/70 via-blue-50/30 to-transparent" />
              <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-200/60 blur-3xl" />
              <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-sky-200/60 blur-3xl" />
              <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-blue-200/50 blur-3xl" />
              <div
                className="absolute inset-0 opacity-[0.3]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                }}
              />
            </div>

            <header className="relative z-10 grid h-24 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-200/80 bg-white/70 px-6 backdrop-blur-sm sm:h-28 md:px-10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-sm">
                  <HardHat className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-lg font-semibold tracking-tight text-slate-900">DCOS</span>
              </div>

              <div className="flex min-w-0 flex-col items-center justify-center self-stretch py-2">
                <TypewriterTitle />
              </div>

              <div className="flex items-center justify-end">
                <UserMenu />
              </div>
            </header>

            <div className="relative z-10 flex flex-col items-center px-6 pt-8 text-center md:px-10">
              <p className="max-w-2xl text-sm text-slate-500 md:text-base">
                Select a module to open its workspace. The navigation panel appears once you enter
                a module.
              </p>
            </div>

            <main className="relative z-10 w-full px-6 py-10 md:px-10">
              <ModuleHub />
            </main>
          </div>
        </TaskAlertsProvider>
      </ProjectProvider>
    </ModuleSettingsProvider>
  );
}
