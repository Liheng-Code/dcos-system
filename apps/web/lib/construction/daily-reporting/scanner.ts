// Module 10-01 Daily Reporting — malware scan of uploaded evidence (design G12).
// Talks to a ClamAV daemon (clamd) over its INSTREAM protocol. Server-only.
//
//   CLAMAV_HOST                  clamd host; unset = no scanner configured
//   CLAMAV_PORT                  default 3310
//   DR_EVIDENCE_SCAN_REQUIRED    "true" = refuse evidence when no scan could be
//                                made (no scanner configured, or it is down).
//                                Set this in production.
//
// Without DR_EVIDENCE_SCAN_REQUIRED an unscanned file is still accepted after
// the content-type check, and its scan_engine says so ("signature-check").

import net from "node:net";

export type ScanResult =
  | { status: "clean"; engine: string }
  | { status: "infected"; engine: string; signature: string }
  | { status: "unavailable"; reason: string };

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 30_000;

export function scannerConfig(): { host: string; port: number } | null {
  const host = process.env.CLAMAV_HOST;
  if (!host) return null;
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return { host, port: Number.isFinite(port) ? port : 3310 };
}

export const scanRequired = () => process.env.DR_EVIDENCE_SCAN_REQUIRED === "true";

/** Interprets clamd's reply to INSTREAM, e.g. "stream: OK" or "stream: Eicar-Signature FOUND". */
export function parseClamdReply(reply: string): ScanResult {
  const text = reply.replace(/\0/g, "").trim();
  if (/:\s*OK$/.test(text)) return { status: "clean", engine: "clamav" };
  const found = /:\s*(.+)\s+FOUND$/.exec(text);
  if (found) return { status: "infected", engine: "clamav", signature: found[1] };
  return { status: "unavailable", reason: text || "empty reply from scanner" };
}

export function scanBuffer(bytes: Buffer, config = scannerConfig()): Promise<ScanResult> {
  if (!config) return Promise.resolve({ status: "unavailable", reason: "no scanner configured" });

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(TIMEOUT_MS, () => finish({ status: "unavailable", reason: "scanner timed out" }));
    socket.on("error", (e) => finish({ status: "unavailable", reason: e.message }));
    socket.on("data", (d) => chunks.push(d));
    socket.on("end", () => finish(parseClamdReply(Buffer.concat(chunks).toString("utf8"))));

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        const part = bytes.subarray(offset, offset + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length, 0);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  });
}
