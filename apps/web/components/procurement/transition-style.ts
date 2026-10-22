import { CheckCircle, RotateCcw, Send, XCircle, type LucideIcon } from "lucide-react";
import type { ProcTransition } from "@/lib/procurement/procurement-transitions";

const VARIANT_CLASS: Record<ProcTransition["variant"], string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  approve: "bg-emerald-600 hover:bg-emerald-700 text-white",
  reject: "bg-red-600 hover:bg-red-700 text-white",
  warning: "bg-amber-600 hover:bg-amber-700 text-white",
  neutral: "bg-slate-600 hover:bg-slate-700 text-white",
};

const VARIANT_ICON: Record<ProcTransition["variant"], LucideIcon> = {
  primary: Send,
  approve: CheckCircle,
  reject: XCircle,
  warning: RotateCcw,
  neutral: Send,
};

export function transitionClass(t: ProcTransition): string {
  return VARIANT_CLASS[t.variant];
}

export function transitionIcon(t: ProcTransition): LucideIcon {
  return VARIANT_ICON[t.variant];
}

/** Stable key for a transition (an edge can repeat a `to` from different `from` sets). */
export function transitionKey(t: ProcTransition): string {
  return `${t.to}:${t.label}`;
}
