// Module 10-01 Daily Reporting — Phase 1B, photo size on the device.
// On a metered or slow connection a photo is reduced before it is stored, so
// the later upload is small. On Wi-Fi the original is kept (design §9.6).

const MAX_EDGE = 1600;
const QUALITY = 0.8;

interface ConnectionInfo {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

/** True when the browser reports a cellular, slow or data-saving connection. Unknown counts as not constrained. */
export function connectionIsConstrained(): boolean {
  const c = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  if (!c) return false;
  return c.saveData === true || c.type === "cellular" || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? "");
}

/** Target size for a photo, keeping its proportions. Never enlarges. */
export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Returns a smaller JPEG when that helps, otherwise the file unchanged.
 * Anything that is not a photo, or that the browser cannot decode (HEIC on
 * some devices), is passed through.
 */
export async function compressPhoto(file: File): Promise<{ blob: Blob; mimeType: string; compressed: boolean }> {
  const original = { blob: file as Blob, mimeType: file.type, compressed: false };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return original;
  try {
    const bitmap = await createImageBitmap(file);
    const size = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return original;
    return { blob, mimeType: "image/jpeg", compressed: true };
  } catch {
    return original;
  }
}
