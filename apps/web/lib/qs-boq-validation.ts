// Pure pre-lock validation for a post-contract BOQ (qs_boq / qs_boq_sections /
// qs_boq_items). No Supabase calls here — qs-service.ts loads the data
// (loadBoqForValidation) and this module only judges it, so it can be tested
// without a database.
//
// Errors block the lock; warnings are shown but do not. The severity split
// follows the live data: the locked main-works BOQ has no violations, and the
// only zero-qty/zero-rate rows are legitimate preliminary items. is_provisional
// is never written by any code path and hand-added builder items never get a
// budget_code_id, so "provisional" and "missing budget code" cannot be errors.
//
// Issue shape mirrors ImportIssue in components/qs/dwl-import-lib.ts.

export type BoqIssueLevel = "error" | "warn";

export interface BoqIssue {
  rule: string;
  level: BoqIssueLevel;
  itemId: string | null;
  itemLabel: string;
  sectionTitle: string;
  message: string;
}

export interface BoqValidationHeader {
  boq_type: "preliminary" | "main_works" | "variation" | "provisional_sum" | "supplement";
}

export interface BoqValidationSection {
  id: string;
  title: string;
}

export interface BoqValidationItem {
  id: string;
  boq_section_id: string;
  seq: number;
  item_no: string | null;
  item_code: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  unit_rate: number | null;
  is_provisional: boolean | null;
  budget_code_id: string | null;
  elemental_category: string | null;
}

export interface BoqValidationBudgetCode {
  id: string;
  code: string;
  is_active: boolean;
}

export interface BoqValidationInput {
  header: BoqValidationHeader;
  sections: BoqValidationSection[];
  items: BoqValidationItem[];
  budgetCodes: BoqValidationBudgetCode[];
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function itemLabel(item: BoqValidationItem): string {
  const ref = item.item_code?.trim() || item.item_no?.trim();
  const desc = item.description?.trim() || "(no description)";
  const short = desc.length > 60 ? `${desc.slice(0, 57)}...` : desc;
  return ref ? `${ref} — ${short}` : short;
}

export function validateBoqForLock(input: BoqValidationInput): BoqIssue[] {
  const { header, sections, items, budgetCodes } = input;
  const issues: BoqIssue[] = [];
  const sectionTitle = new Map(sections.map((s) => [s.id, s.title]));
  const codeById = new Map(budgetCodes.map((c) => [c.id, c]));
  const push = (issue: Omit<BoqIssue, "itemLabel" | "sectionTitle"> & { item?: BoqValidationItem; sectionTitle?: string }) => {
    issues.push({
      rule: issue.rule,
      level: issue.level,
      itemId: issue.item?.id ?? null,
      itemLabel: issue.item ? itemLabel(issue.item) : "",
      sectionTitle: issue.item ? sectionTitle.get(issue.item.boq_section_id) ?? "" : issue.sectionTitle ?? "",
      message: issue.message,
    });
  };

  if (items.length === 0) {
    push({ rule: "boq-empty", level: "error", itemId: null, message: "The BOQ has no items." });
    return issues;
  }

  const itemsBySection = new Map<string, number>();
  for (const item of items) itemsBySection.set(item.boq_section_id, (itemsBySection.get(item.boq_section_id) ?? 0) + 1);
  for (const section of sections) {
    if (!itemsBySection.has(section.id)) {
      push({ rule: "section-empty", level: "warn", itemId: null, sectionTitle: section.title, message: "Section has no items." });
    }
  }

  // Zero-qty / zero-rate is an error on priced main-works style lines, a warning where zero is legitimate.
  const headerAllowsZero = header.boq_type === "preliminary" || header.boq_type === "provisional_sum";

  const byCode = new Map<string, BoqValidationItem[]>();
  const byNo = new Map<string, BoqValidationItem[]>();

  for (const item of items) {
    if (!item.description?.trim()) push({ rule: "description-blank", level: "error", itemId: item.id, item, message: "Description is blank." });
    if (!item.unit?.trim()) push({ rule: "unit-blank", level: "error", itemId: item.id, item, message: "Unit is blank." });

    const qty = Number(item.quantity ?? 0);
    const rate = Number(item.unit_rate ?? 0);
    if (qty < 0) push({ rule: "quantity-negative", level: "error", itemId: item.id, item, message: `Quantity is negative (${qty}).` });
    if (rate < 0) push({ rule: "rate-negative", level: "error", itemId: item.id, item, message: `Unit rate is negative (${rate}).` });

    if (qty === 0 || rate === 0) {
      const zeroLegit = headerAllowsZero || item.is_provisional === true || item.elemental_category === "prelims";
      const what = qty === 0 && rate === 0 ? "quantity and unit rate are both zero" : qty === 0 ? "quantity is zero" : "unit rate is zero";
      push({
        rule: "zero-qty-or-rate",
        level: zeroLegit ? "warn" : "error",
        itemId: item.id,
        item,
        message: zeroLegit
          ? `Zero value allowed here (provisional or preliminary item): ${what}.`
          : `Priced item with ${what}. Enter a value, or mark the item provisional.`,
      });
    }

    if (norm(item.item_code)) {
      const key = norm(item.item_code);
      byCode.set(key, [...(byCode.get(key) ?? []), item]);
    } else {
      push({ rule: "item-code-missing", level: "warn", itemId: item.id, item, message: "Item has no item code." });
    }
    if (norm(item.item_no)) {
      const key = norm(item.item_no);
      byNo.set(key, [...(byNo.get(key) ?? []), item]);
    }

    if (!item.budget_code_id && !item.elemental_category) {
      push({ rule: "budget-code-missing", level: "warn", itemId: item.id, item, message: "No budget code or elemental category." });
    } else if (item.budget_code_id) {
      const code = codeById.get(item.budget_code_id);
      if (code && !code.is_active) {
        push({ rule: "budget-code-inactive", level: "warn", itemId: item.id, item, message: `Budget code ${code.code} is inactive.` });
      }
    }
  }

  for (const group of byCode.values()) {
    if (group.length < 2) continue;
    for (const item of group) {
      push({
        rule: "item-code-duplicate",
        level: "error",
        itemId: item.id,
        item,
        message: `Item code "${item.item_code?.trim()}" is used by ${group.length} items in this BOQ.`,
      });
    }
  }
  for (const group of byNo.values()) {
    if (group.length < 2) continue;
    for (const item of group) {
      push({
        rule: "item-no-duplicate",
        level: "warn",
        itemId: item.id,
        item,
        message: `Item number "${item.item_no?.trim()}" is used by ${group.length} items in this BOQ.`,
      });
    }
  }

  return issues;
}

export function summarizeBoqIssues(issues: BoqIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.level === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

// Errors first, then warnings, stable within each level.
export function sortBoqIssues(issues: BoqIssue[]): BoqIssue[] {
  return [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

export class BoqLockValidationError extends Error {
  issues: BoqIssue[];
  constructor(issues: BoqIssue[]) {
    const { errors } = summarizeBoqIssues(issues);
    super(`BOQ cannot be locked: ${errors} error${errors !== 1 ? "s" : ""} must be fixed first.`);
    this.name = "BoqLockValidationError";
    this.issues = issues;
  }
}
