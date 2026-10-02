// Shared label + color maps for the Stakeholders module.

export const EXTERNAL_TYPE_LABELS: Record<string, string> = {
  CLI: "Client / Owner",
  CON: "Consultant",
  MC: "Main Contractor",
  SUB: "Subcontractor",
  SUP: "Supplier",
  AUT: "Authority",
  TST: "Testing Agency",
  FM: "Facility Management",
};

export const INTERNAL_TYPE_LABELS: Record<string, string> = {
  INT: "Internal Department",
};

export const ALL_TYPE_LABELS: Record<string, string> = {
  ...EXTERNAL_TYPE_LABELS,
  ...INTERNAL_TYPE_LABELS,
};

export const TYPE_COLORS: Record<string, string> = {
  CLI: "bg-blue-500/10 text-blue-700 border-blue-200",
  CON: "bg-violet-500/10 text-violet-700 border-violet-200",
  MC: "bg-orange-500/10 text-orange-700 border-orange-200",
  SUB: "bg-amber-500/10 text-amber-700 border-amber-200",
  SUP: "bg-teal-500/10 text-teal-700 border-teal-200",
  AUT: "bg-red-500/10 text-red-700 border-red-200",
  TST: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  FM: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  INT: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
};

// Top accent bar per type (solid tints).
export const TYPE_ACCENTS: Record<string, string> = {
  CLI: "bg-blue-500",
  CON: "bg-violet-500",
  MC: "bg-orange-500",
  SUB: "bg-amber-500",
  SUP: "bg-teal-500",
  AUT: "bg-red-500",
  TST: "bg-cyan-500",
  FM: "bg-emerald-500",
  INT: "bg-indigo-500",
};

// Initials-avatar tint rotation.
export const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600",
  "bg-emerald-500/10 text-emerald-600",
  "bg-amber-500/10 text-amber-600",
  "bg-violet-500/10 text-violet-600",
  "bg-rose-500/10 text-rose-600",
];

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-gray-500/10 text-gray-500 border-gray-200",
  blacklisted: "bg-red-500/10 text-red-600 border-red-200",
  preferred: "bg-blue-500/10 text-blue-600 border-blue-200",
};

export const APPROVAL_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500",
  pending_review: "bg-amber-500/10 text-amber-600",
  approved: "",
  rejected: "bg-red-500/10 text-red-600",
};

export const EXTERNAL_TYPE_OPTIONS = Object.entries(EXTERNAL_TYPE_LABELS);
export const INTERNAL_TYPE_OPTIONS = Object.entries(INTERNAL_TYPE_LABELS);
export const ALL_TYPE_OPTIONS = Object.entries(ALL_TYPE_LABELS);

export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
