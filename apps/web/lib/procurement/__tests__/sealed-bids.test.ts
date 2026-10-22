import { describe, expect, it } from "vitest";
import { bangkokToday, bidsOpenAt, formatBangkok, isBidsOpen } from "../sealed-bids";

describe("bidsOpenAt (Asia/Bangkok, UTC+7)", () => {
  it("opens at 00:00 Bangkok the day after the deadline", () => {
    // 2026-10-23 00:00 +07:00 = 2026-10-22 17:00 UTC
    expect(bidsOpenAt("2026-10-22")?.toISOString()).toBe("2026-10-22T17:00:00.000Z");
  });
  it("rolls over month and year ends", () => {
    expect(bidsOpenAt("2026-12-31")?.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(bidsOpenAt("2026-02-28")?.toISOString()).toBe("2026-02-28T17:00:00.000Z");
  });
  it("accepts an ISO timestamp by its date part", () => {
    expect(bidsOpenAt("2026-10-22T09:30:00Z")?.toISOString()).toBe("2026-10-22T17:00:00.000Z");
  });
  it("returns null without a usable deadline", () => {
    expect(bidsOpenAt(null)).toBeNull();
    expect(bidsOpenAt(undefined)).toBeNull();
    expect(bidsOpenAt("")).toBeNull();
    expect(bidsOpenAt("soon")).toBeNull();
    expect(bidsOpenAt("2026-02-31")).toBeNull();
  });
});

describe("isBidsOpen", () => {
  const at = (iso: string) => new Date(iso);
  it("is sealed until the opening instant, open from it", () => {
    expect(isBidsOpen("2026-10-22", "issued", at("2026-10-22T16:59:59Z"))).toBe(false);
    expect(isBidsOpen("2026-10-22", "issued", at("2026-10-22T17:00:00Z"))).toBe(true);
    expect(isBidsOpen("2026-10-22", "quotations_received", at("2026-10-01T00:00:00Z"))).toBe(false);
  });
  it("is still sealed late in the Bangkok deadline day", () => {
    // 2026-10-22 23:30 Bangkok = 16:30 UTC
    expect(isBidsOpen("2026-10-22", "issued", at("2026-10-22T16:30:00Z"))).toBe(false);
  });
  it("is open without a deadline (legacy RFQ)", () => {
    expect(isBidsOpen(null, "issued", at("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("is open when the RFQ is awarded", () => {
    expect(isBidsOpen("2099-01-01", "awarded", at("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it.each(["rejected_all", "cancelled"])("does not open early when the RFQ is %s", (status) => {
    expect(isBidsOpen("2099-01-01", status, at("2026-01-01T00:00:00Z"))).toBe(false);
    expect(isBidsOpen("2026-10-22", status, at("2026-10-22T17:00:00Z"))).toBe(true);
  });
  it("stays sealed for draft and evaluation statuses before the opening", () => {
    expect(isBidsOpen("2099-01-01", "draft", at("2026-01-01T00:00:00Z"))).toBe(false);
    expect(isBidsOpen("2099-01-01", "under_evaluation", at("2026-01-01T00:00:00Z"))).toBe(false);
  });
  it("fails closed on an unreadable deadline", () => {
    expect(isBidsOpen("garbage", "issued", at("2030-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("formatBangkok", () => {
  it("formats like the database message", () => {
    expect(formatBangkok(new Date("2026-10-22T17:00:00Z"))).toBe("2026-10-23 00:00");
    expect(formatBangkok(new Date("2026-12-31T20:05:00Z"))).toBe("2027-01-01 03:05");
  });
});

describe("bangkokToday", () => {
  it("is the Bangkok calendar date", () => {
    expect(bangkokToday(new Date("2026-10-22T16:59:59Z"))).toBe("2026-10-22");
    expect(bangkokToday(new Date("2026-10-22T17:00:00Z"))).toBe("2026-10-23");
    expect(bangkokToday(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });
  it("defaults to now", () => {
    expect(bangkokToday()).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });
});
