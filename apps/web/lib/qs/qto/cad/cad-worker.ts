// Web Worker: reads a DXF and builds its model off the main thread.
import { DxfError, parseDxf } from "./dxf-parse";
import { buildModel } from "./cad-geometry";

self.onmessage = (ev: MessageEvent<{ text: string }>) => {
  try {
    const model = buildModel(parseDxf(ev.data.text));
    self.postMessage({ ok: true, model });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof DxfError ? e.message : e instanceof Error ? `The DXF could not be read: ${e.message}` : "The DXF could not be read" });
  }
};
