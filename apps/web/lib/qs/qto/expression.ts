// Allowlisted, unit-aware formula evaluator for take-off calculations.
// Grammar (no eval, no Function, no property access):
//   expr   := term (("+" | "-") term)*
//   term   := unary (("*" | "/") unary)*
//   unary  := "-" unary | primary
//   primary:= number | name | name "(" args ")" | "(" expr ")"
// Functions: min, max, abs, round(x, dp). Names are input variables or named definitions;
// definitions may reference each other, and cycles are rejected.
import {
  type Dec, DecimalError, abs as decAbs, add, cmp, dec, div, mul, neg, round, sub,
} from "./decimal";
import {
  DIMENSIONLESS, type Dimension, UnitError, describeDimension, dimensionOf, divideDims,
  multiplyDims, sameDimension, toBase,
} from "./units";

export const MAX_EXPRESSION_LENGTH = 500;
const MAX_DEPTH = 40;
const FUNCTIONS = new Set(["min", "max", "abs", "round"]);

/** A value in SI base units with its dimension. */
export interface Quantity {
  value: Dec;
  dim: Dimension;
}

export interface VariableInput {
  value: string | number;
  unit: string;
}

export type EvalResult = { ok: true; value: Quantity } | { ok: false; error: string };

type Token =
  | { t: "num"; v: string; pos: number }
  | { t: "name"; v: string; pos: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" | ","; pos: number };

type Node =
  | { k: "num"; v: string }
  | { k: "var"; name: string }
  | { k: "neg"; x: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

export class ExpressionError extends Error {}

export function tokenize(src: string): Token[] {
  if (src.length > MAX_EXPRESSION_LENGTH) throw new ExpressionError(`Formula is longer than ${MAX_EXPRESSION_LENGTH} characters`);
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] ?? ""))) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new ExpressionError(`Invalid number at position ${i + 1}`);
      out.push({ t: "num", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))!;
      out.push({ t: "name", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if ("+-*/(),".includes(c)) {
      out.push({ t: "op", v: c as "+", pos: i });
      i++;
      continue;
    }
    throw new ExpressionError(`Character "${c}" is not allowed (position ${i + 1})`);
  }
  return out;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExpressionError("Formula is empty");
  let p = 0;
  let depth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`Expected "${v}"${peek() ? ` at position ${peek()!.pos + 1}` : " at the end"}`);
    p++;
  };
  const enter = () => {
    if (++depth > MAX_DEPTH) throw new ExpressionError("Formula is nested too deeply");
  };

  function expr(): Node {
    enter();
    let n = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: "+" | "-" }).v;
      n = { k: "bin", op, a: n, b: term() };
    }
    depth--;
    return n;
  }
  function term(): Node {
    let n = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: "*" | "/" }).v;
      n = { k: "bin", op, a: n, b: unary() };
    }
    return n;
  }
  function unary(): Node {
    if (isOp("-")) { p++; enter(); const x = unary(); depth--; return { k: "neg", x }; }
    if (isOp("+")) { p++; return unary(); }
    return primary();
  }
  function primary(): Node {
    const tk = peek();
    if (!tk) throw new ExpressionError("Formula ends unexpectedly");
    if (tk.t === "num") { p++; return { k: "num", v: tk.v }; }
    if (tk.t === "name") {
      p++;
      if (isOp("(")) {
        const fn = tk.v.toLowerCase();
        if (!FUNCTIONS.has(fn)) throw new ExpressionError(`Function "${tk.v}" is not allowed`);
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) { p++; args.push(expr()); }
        }
        expect(")");
        return { k: "call", fn, args };
      }
      return { k: "var", name: tk.v };
    }
    if (isOp("(")) { p++; const n = expr(); expect(")"); return n; }
    throw new ExpressionError(`Unexpected "${tk.v}" at position ${tk.pos + 1}`);
  }

  const n = expr();
  if (p < toks.length) throw new ExpressionError(`Unexpected "${toks[p].v}" at position ${toks[p].pos + 1}`);
  return n;
}

/** Names used by a formula (variables only, not functions). */
export function referencedNames(src: string): string[] {
  const names = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === "var") names.add(n.name);
    else if (n.k === "neg") walk(n.x);
    else if (n.k === "bin") { walk(n.a); walk(n.b); }
    else if (n.k === "call") n.args.forEach(walk);
  };
  walk(parse(src));
  return [...names];
}

export function evaluate(
  src: string,
  variables: Record<string, VariableInput> = {},
  definitions: Record<string, string> = {},
): EvalResult {
  try {
    const resolved = new Map<string, Quantity>();
    const resolving = new Set<string>();

    const lookup = (name: string): Quantity => {
      if (resolved.has(name)) return resolved.get(name)!;
      if (name in variables) {
        const v = variables[name];
        let d: Dec;
        try { d = dec(v.value); } catch { throw new ExpressionError(`Input "${name}" is not a valid number`); }
        const q = { value: toBase(d, v.unit), dim: dimensionOf(v.unit) };
        resolved.set(name, q);
        return q;
      }
      if (name in definitions) {
        if (resolving.has(name)) throw new ExpressionError(`Circular definition involving "${name}"`);
        resolving.add(name);
        const q = run(parse(definitions[name]));
        resolving.delete(name);
        resolved.set(name, q);
        return q;
      }
      throw new ExpressionError(`Missing input "${name}"`);
    };

    const run = (n: Node): Quantity => {
      switch (n.k) {
        case "num": return { value: dec(n.v), dim: DIMENSIONLESS };
        case "var": return lookup(n.name);
        case "neg": { const x = run(n.x); return { value: neg(x.value), dim: x.dim }; }
        case "bin": {
          const a = run(n.a);
          const b = run(n.b);
          if (n.op === "+" || n.op === "-") {
            if (!sameDimension(a.dim, b.dim)) {
              throw new ExpressionError(`Cannot ${n.op === "+" ? "add" : "subtract"} ${describeDimension(b.dim)} ${n.op === "+" ? "to" : "from"} ${describeDimension(a.dim)}`);
            }
            return { value: n.op === "+" ? add(a.value, b.value) : sub(a.value, b.value), dim: a.dim };
          }
          if (n.op === "*") return { value: mul(a.value, b.value), dim: multiplyDims(a.dim, b.dim) };
          if (cmp(b.value, dec(0)) === 0) throw new ExpressionError("Division by zero");
          return { value: div(a.value, b.value), dim: divideDims(a.dim, b.dim) };
        }
        case "call": {
          const args = n.args.map(run);
          if (n.fn === "abs") {
            if (args.length !== 1) throw new ExpressionError("abs() takes one argument");
            return { value: decAbs(args[0].value), dim: args[0].dim };
          }
          if (n.fn === "round") {
            if (args.length !== 2) throw new ExpressionError("round() takes two arguments: round(x, places)");
            const places = Number(args[1].value / BigInt(10) ** BigInt(12));
            if (!sameDimension(args[1].dim, DIMENSIONLESS) || places < 0 || places > 6) {
              throw new ExpressionError("round() places must be a plain number from 0 to 6");
            }
            return { value: round(args[0].value, places), dim: args[0].dim };
          }
          if (args.length < 2) throw new ExpressionError(`${n.fn}() takes at least two arguments`);
          if (!args.every((x) => sameDimension(x.dim, args[0].dim))) {
            throw new ExpressionError(`${n.fn}() arguments must have the same unit type`);
          }
          return args.reduce((best, x) =>
            (n.fn === "min" ? cmp(x.value, best.value) < 0 : cmp(x.value, best.value) > 0) ? x : best);
        }
      }
    };

    return { ok: true, value: run(parse(src)) };
  } catch (e) {
    if (e instanceof ExpressionError || e instanceof UnitError || e instanceof DecimalError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
