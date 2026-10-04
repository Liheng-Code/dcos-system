import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseClamdReply, scanBuffer } from "../scanner";

/** Minimal clamd stand-in: reads one INSTREAM request and replies as told. */
function fakeClamd(reply: (payload: Buffer) => string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("data", (d) => {
        buffer = Buffer.concat([buffer, d]);
        const header = Buffer.from("zINSTREAM\0");
        if (buffer.length < header.length) return;
        // Walk the length-prefixed chunks until the zero-length terminator.
        let offset = header.length;
        const parts: Buffer[] = [];
        while (offset + 4 <= buffer.length) {
          const size = buffer.readUInt32BE(offset);
          if (size === 0) {
            socket.end(reply(Buffer.concat(parts)));
            return;
          }
          if (offset + 4 + size > buffer.length) return;
          parts.push(buffer.subarray(offset + 4, offset + 4 + size));
          offset += 4 + size;
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() });
    });
  });
}

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("evidence scanner", () => {
  it("reads clamd replies", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ status: "clean", engine: "clamav" });
    expect(parseClamdReply("stream: Eicar-Signature FOUND\0")).toEqual({
      status: "infected",
      engine: "clamav",
      signature: "Eicar-Signature",
    });
    expect(parseClamdReply("INSTREAM size limit exceeded. ERROR\0").status).toBe("unavailable");
    expect(parseClamdReply("").status).toBe("unavailable");
  });

  it("streams the whole file to the scanner in chunks", async () => {
    const file = Buffer.alloc(200_000, 7); // larger than one chunk
    let received = 0;
    const server = await fakeClamd((payload) => {
      received = payload.length;
      return payload.equals(file) ? "stream: OK\0" : "stream: Mismatch FOUND\0";
    });
    stop = server.close;
    expect(await scanBuffer(file, { host: "127.0.0.1", port: server.port })).toEqual({ status: "clean", engine: "clamav" });
    expect(received).toBe(file.length);
  });

  it("reports an infected file with its signature", async () => {
    const server = await fakeClamd(() => "stream: Win.Test.EICAR_HDB-1 FOUND\0");
    stop = server.close;
    expect(await scanBuffer(Buffer.from("x"), { host: "127.0.0.1", port: server.port })).toMatchObject({
      status: "infected",
      signature: "Win.Test.EICAR_HDB-1",
    });
  });

  it("is unavailable, not clean, when no scanner is configured or reachable", async () => {
    expect((await scanBuffer(Buffer.from("x"), null)).status).toBe("unavailable");
    // Port 1 on localhost: nothing listens there.
    expect((await scanBuffer(Buffer.from("x"), { host: "127.0.0.1", port: 1 })).status).toBe("unavailable");
  });
});
