// Phone matching for Telegram auto-link. Cambodian numbers are written many ways
// ("+855 12 503 6303", "012 503 6303", "85512503630"), so both sides are reduced to the
// national number before comparing.

const COUNTRY_CODE = "855";

/** Digits of the national number, without country code or leading trunk zero. Empty if unusable. */
export function normalisePhone(raw: string | null | undefined): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(COUNTRY_CODE)) digits = digits.slice(COUNTRY_CODE.length);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Too short to identify anyone; never match on it.
  return digits.length >= 8 ? digits : "";
}

export type PhoneMatch =
  | { kind: "match"; employeeId: string }
  | { kind: "none" }
  | { kind: "multiple"; employeeIds: string[] };

export function matchEmployeeByPhone(phone: string, employees: { id: string; phone: string | null }[]): PhoneMatch {
  const wanted = normalisePhone(phone);
  if (!wanted) return { kind: "none" };
  const ids = employees.filter((e) => normalisePhone(e.phone) === wanted).map((e) => e.id);
  if (ids.length === 0) return { kind: "none" };
  if (ids.length === 1) return { kind: "match", employeeId: ids[0] };
  return { kind: "multiple", employeeIds: ids };
}
