// Loads a DXF file into a CadModel in a Web Worker (falls back to the main thread without workers).
import type { CadModel } from "./cad-geometry";

/** Reads DXF text (UTF-8 for AutoCAD 2007+, otherwise Windows-1252). */
export async function readDxfText(data: ArrayBuffer): Promise<string> {
  const head = new TextDecoder("latin1").decode(data.slice(0, 4000));
  const version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/.exec(head)?.[1];
  const utf8 = !version || Number(version) >= 1021;
  return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(data);
}

export async function loadCadModel(data: ArrayBuffer): Promise<CadModel> {
  const text = await readDxfText(data);
  if (typeof Worker === "undefined") {
    const [{ parseDxf }, { buildModel }] = await Promise.all([import("./dxf-parse"), import("./cad-geometry")]);
    return buildModel(parseDxf(text));
  }
  return new Promise<CadModel>((resolve, reject) => {
    const worker = new Worker(new URL("./cad-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; model?: CadModel; error?: string }>) => {
      worker.terminate();
      if (ev.data.ok && ev.data.model) resolve(ev.data.model);
      else reject(new Error(ev.data.error ?? "The DXF could not be read"));
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "The DXF could not be read")); };
    worker.postMessage({ text });
  });
}
