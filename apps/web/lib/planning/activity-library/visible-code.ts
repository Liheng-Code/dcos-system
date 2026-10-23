// Visible activity code, e.g. D04-001: "D" + two-digit CSI division + "-" + a running number per division.
// The database trigger plan_act_master_assign_visible_code assigns the next number; these helpers mirror its format.

export const DIVISION_CODES = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0"));

export function formatVisibleCode(divisionCode: string, n: number): string {
  return `D${divisionCode}-${String(n).padStart(3, "0")}`;
}

export function parseVisibleCode(v: string): { division: string; n: number } | null {
  const m = /^D(\d{2})-(\d{3,})$/.exec(v.trim().toUpperCase());
  return m ? { division: m[1], n: Number(m[2]) } : null;
}

/** Normalises a division cell (3, "3", "03", " 03 ") to "03"; null when it is not a number of 1 to 2 digits. */
export function normalizeDivisionCode(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  return s.padStart(2, "0");
}

export function isValidDivisionCode(code: string | null): boolean {
  return code !== null && DIVISION_CODES.includes(code);
}
