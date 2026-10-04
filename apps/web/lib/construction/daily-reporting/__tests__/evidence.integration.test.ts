// Integration test of evidence verification against real Supabase Storage and
// a real ClamAV daemon. Opt-in: skipped unless all of these are set.
//
//   DR_IT_SUPABASE_URL   e.g. http://127.0.0.1:54321
//   DR_IT_SERVICE_KEY    service-role key of that stack
//   DR_IT_UNIT_ID        an existing dr_reporting_units.id on that stack
//   CLAMAV_HOST          clamd host (CLAMAV_PORT optional)
//
// It uploads two small files under the unit's evidence prefix and removes them.

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVIDENCE_BUCKET, EvidenceError, verifyEvidence } from "../server";

const URL = process.env.DR_IT_SUPABASE_URL;
const KEY = process.env.DR_IT_SERVICE_KEY;
const UNIT = process.env.DR_IT_UNIT_ID;

// The standard anti-virus test string. Harmless; every scanner flags it.
const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

describe.skipIf(!URL || !KEY || !UNIT || !process.env.CLAMAV_HOST)("evidence verification (integration)", () => {
  let admin: SupabaseClient;
  let unit: { id: string; project_id: string };
  const keys: string[] = [];

  const upload = async (bytes: Buffer, ext: string, contentType: string) => {
    const key = `${unit.project_id}/${unit.id}/it/${randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(EVIDENCE_BUCKET).upload(key, bytes, { contentType });
    expect(error).toBeNull();
    keys.push(key);
    return key;
  };

  beforeAll(async () => {
    admin = createClient(URL as string, KEY as string, { auth: { persistSession: false } });
    const { data } = await admin.from("dr_reporting_units").select("id, project_id").eq("id", UNIT).single();
    unit = data as { id: string; project_id: string };
  });

  afterAll(async () => {
    if (keys.length) await admin.storage.from(EVIDENCE_BUCKET).remove(keys);
  });

  it("accepts a clean photo and records that ClamAV scanned it", async () => {
    const key = await upload(JPEG, "jpg", "image/jpeg");
    const [verified] = await verifyEvidence(admin, unit, [{ storage_key: key, target_section: "evidence" }], new Set());
    expect(verified).toMatchObject({ mime_type: "image/jpeg", size_bytes: JPEG.length, scan_status: "Available", scan_engine: "clamav" });
    expect(verified.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an infected file, deletes it and audits the quarantine", async () => {
    // Uploaded with an image name and type: the scanner must not be fooled by either.
    const key = await upload(EICAR, "jpg", "image/jpeg");
    await expect(verifyEvidence(admin, unit, [{ storage_key: key, target_section: "evidence" }], new Set())).rejects.toThrow(EvidenceError);

    const gone = await admin.storage.from(EVIDENCE_BUCKET).download(key);
    expect(gone.data).toBeNull();

    const { data: audit } = await admin
      .from("dr_audit_log")
      .select("details")
      .eq("event_code", "DR.EVIDENCE_QUARANTINED")
      .eq("unit_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(1);
    expect((audit?.[0]?.details as { storage_key: string; signature: string }).storage_key).toBe(key);
    expect((audit?.[0]?.details as { signature: string }).signature).toMatch(/eicar/i);
  });

  it("refuses a file outside the unit's storage prefix", async () => {
    await expect(
      verifyEvidence(admin, unit, [{ storage_key: `${randomUUID()}/${randomUUID()}/x.jpg`, target_section: "evidence" }], new Set()),
    ).rejects.toThrow(/does not belong/);
  });
});
