// Pure sealed-bid rules for RFQ quotations (BR-07).
//
// No database or React imports. Mirrors public.proc_rfq_bids_open_at / proc_rfq_bids_open
// (migration 20261022150000_procurement_p2_sealed_bids_numbering.sql): bids open at the end of the
// response_deadline day in Asia/Bangkok (UTC+7, no daylight saving), i.e. deadline + 1 day 00:00
// Bangkok time. An RFQ without a deadline is never sealed, and an awarded RFQ is open. Cancelling or
// rejecting all quotations does NOT open the bids early.

const BANGKOK_OFFSET_HOURS = 7;

/** RFQ statuses in which bids are always open, whatever the deadline. */
export const BIDS_OPEN_STATUSES: readonly string[] = ["awarded"];

/**
 * The instant bids open for a `YYYY-MM-DD` deadline (a longer ISO string is cut to its date part).
 * Returns null when there is no deadline or it is not a valid date.
 */
export function bidsOpenAt(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d + 1, -BANGKOK_OFFSET_HOURS, 0, 0, 0));
  // Reject dates JavaScript rolled over (e.g. 2026-02-31).
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc;
}

/**
 * True when quotations may be read by everyone with rfq.view. No deadline (legacy RFQ) or an
 * awarded RFQ is open. A deadline that cannot be read fails closed (sealed).
 */
export function isBidsOpen(
  deadline: string | null | undefined,
  status: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status && BIDS_OPEN_STATUSES.includes(status)) return true;
  if (!deadline) return true;
  const at = bidsOpenAt(deadline);
  if (!at) return false;
  return now.getTime() >= at.getTime();
}

/** "YYYY-MM-DD HH:mm" in Asia/Bangkok, the format the database puts in PROC_BIDS_SEALED. */
export function formatBangkok(date: Date): string {
  const t = new Date(date.getTime() + BANGKOK_OFFSET_HOURS * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/**
 * Today's date in Asia/Bangkok as YYYY-MM-DD. The server checks the RFQ issue deadline
 * (deadline >= Bangkok today) and numbers documents by year with this date.
 */
export function bangkokToday(now: Date = new Date()): string {
  return formatBangkok(now).slice(0, 10);
}
