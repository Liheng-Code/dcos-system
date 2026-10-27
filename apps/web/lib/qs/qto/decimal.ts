// Fixed-point decimal arithmetic for take-off quantities (no binary floating point).
// A Dec is a bigint holding the value × 10^SCALE. Parse from strings where possible:
// numbers are converted through their shortest decimal string, which is exact for typed input.

export const SCALE = 12;
const ONE = BigInt(10) ** BigInt(SCALE);

export type Dec = bigint & { readonly __dec: unique symbol };
export type RoundingMode = "half_up" | "up" | "down";

const asDec = (v: bigint) => v as Dec;

export class DecimalError extends Error {}

export function dec(input: string | number | bigint): Dec {
  if (typeof input === "bigint") return asDec(input * ONE);
  let s = typeof input === "number" ? numberToString(input) : input.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) throw new DecimalError(`Not a decimal number: "${input}"`);
  let negative = false;
  if (s[0] === "+" || s[0] === "-") {
    negative = s[0] === "-";
    s = s.slice(1);
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > SCALE) {
    // More precision than we hold: round half-up at SCALE digits.
    const kept = BigInt((whole || "0") + frac.slice(0, SCALE));
    const next = Number(frac[SCALE]);
    const v = kept + (next >= 5 ? BigInt(1) : BigInt(0));
    return asDec(negative ? -v : v);
  }
  const v = BigInt((whole || "0") + frac.padEnd(SCALE, "0"));
  return asDec(negative ? -v : v);
}

function numberToString(n: number): string {
  if (!Number.isFinite(n)) throw new DecimalError(`Not a finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  // Expand exponent notation (1e-7, 1.5e+21) into plain digits.
  const [mant, expStr] = s.toLowerCase().split("e");
  const exp = Number(expStr);
  const negative = mant.startsWith("-");
  const digits = mant.replace(/^[-+]/, "");
  const [w, f = ""] = digits.split(".");
  const all = w + f;
  const point = w.length + exp;
  let out: string;
  if (point <= 0) out = "0." + "0".repeat(-point) + all;
  else if (point >= all.length) out = all + "0".repeat(point - all.length);
  else out = all.slice(0, point) + "." + all.slice(point);
  return (negative ? "-" : "") + out;
}

export const ZERO = dec(0);

export function add(a: Dec, b: Dec): Dec {
  return asDec(a + b);
}

export function sub(a: Dec, b: Dec): Dec {
  return asDec(a - b);
}

export function neg(a: Dec): Dec {
  return asDec(-a);
}

export function abs(a: Dec): Dec {
  return asDec(a < BigInt(0) ? -a : a);
}

/** Integer division of a bigint with half-up rounding (away from zero at .5). */
function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (r === BigInt(0)) return q;
  const twice = (r < BigInt(0) ? -r : r) * BigInt(2);
  const dAbs = d < BigInt(0) ? -d : d;
  if (twice >= dAbs) return q + ((n < BigInt(0)) !== (d < BigInt(0)) ? -BigInt(1) : BigInt(1));
  return q;
}

export function mul(a: Dec, b: Dec): Dec {
  return asDec(divRound(a * b, ONE));
}

export function div(a: Dec, b: Dec): Dec {
  if (b === BigInt(0)) throw new DecimalError("Division by zero");
  return asDec(divRound(a * ONE, b));
}

export function cmp(a: Dec, b: Dec): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isZero(a: Dec): boolean {
  return a === BigInt(0);
}

/** Round to `dp` decimal places. half_up = away from zero at .5; up = away from zero; down = toward zero. */
export function round(a: Dec, dp: number, mode: RoundingMode = "half_up"): Dec {
  if (!Number.isInteger(dp) || dp < 0 || dp > SCALE) throw new DecimalError(`Invalid decimal places: ${dp}`);
  const unit = BigInt(10) ** BigInt(SCALE - dp);
  const q = a / unit;
  const r = a % unit;
  if (r === BigInt(0)) return a;
  const away = a < BigInt(0) ? -BigInt(1) : BigInt(1);
  let k = q;
  if (mode === "up") k = q + away;
  else if (mode === "half_up") k = (r < BigInt(0) ? -r : r) * BigInt(2) >= unit ? q + away : q;
  return asDec(k * unit);
}

/** Plain decimal string, trailing zeros trimmed (or padded to `dp` places when given). */
export function toFixedString(a: Dec, dp?: number): string {
  const negative = a < BigInt(0);
  const digits = (negative ? -a : a).toString().padStart(SCALE + 1, "0");
  const whole = digits.slice(0, digits.length - SCALE);
  let frac = digits.slice(digits.length - SCALE);
  if (dp === undefined) frac = frac.replace(/0+$/, "");
  else frac = frac.slice(0, dp).padEnd(dp, "0");
  return (negative ? "-" : "") + whole + (frac ? "." + frac : "");
}

export function toNumber(a: Dec): number {
  return Number(toFixedString(a));
}
