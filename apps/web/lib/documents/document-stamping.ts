import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import QRCode from "qrcode";

export interface StampingOptions {
  documentId: string;
  documentNumber: string;
  title: string;
  revisionCode: string;
  status: string;
  reviewCode?: string | null;
  projectCode: string;
  projectName: string;
  copyNumber?: number;
  issuedToParty?: string;
  issuedDate?: string;
  baseUrl?: string;
}

/**
 * Generates a PNG data URL for a given URL using the qrcode library.
 */
export async function generateQrPngDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    color: {
      dark: "#0F2548",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

/**
 * Stamps a PDF with an official construction title-block stamp and embedded QR code,
 * or a prominent VOID watermark if superseded.
 */
export async function stampPdfDocument(
  pdfBuffer: ArrayBuffer,
  options: StampingOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const baseUrl = options.baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://dcos.app");
  const verificationUrl = `${baseUrl}/verify/doc/${options.documentId}`;

  // Generate QR Code PNG
  const qrDataUrl = await generateQrPngDataUrl(verificationUrl);
  const qrImage = await pdfDoc.embedPng(qrDataUrl);

  const isIFC = options.status === "ifc" || options.reviewCode === "code_a";
  const isSuperseded = options.status === "superseded";
  const isRejected = options.status === "rejected" || options.reviewCode === "code_c" || options.reviewCode === "code_d";
  const isReview = !isIFC && !isSuperseded && !isRejected;

  const todayStr = options.issuedDate || new Date().toISOString().split("T")[0];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    // ─────────────────────────────────────────────────────────────
    // 1. Diagonal Watermark (if Superseded or For Review)
    // ─────────────────────────────────────────────────────────────
    if (isSuperseded) {
      page.drawText("VOID — SUPERSEDED", {
        x: width * 0.15,
        y: height * 0.35,
        size: Math.min(width, height) * 0.1,
        font: fontBold,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(35),
        opacity: 0.28,
      });

      page.drawText("DO NOT USE FOR CONSTRUCTION WORK", {
        x: width * 0.18,
        y: height * 0.28,
        size: Math.min(width, height) * 0.04,
        font: fontBold,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(35),
        opacity: 0.35,
      });
    } else if (isReview) {
      page.drawText("FOR REVIEW ONLY", {
        x: width * 0.2,
        y: height * 0.35,
        size: Math.min(width, height) * 0.09,
        font: fontBold,
        color: rgb(0.8, 0.5, 0.1),
        rotate: degrees(35),
        opacity: 0.22,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Official Title Block Stamp (Bottom-Right Corner)
    // ─────────────────────────────────────────────────────────────
    const stampWidth = 230;
    const stampHeight = 85;
    const margin = 15;
    const stampX = width - stampWidth - margin;
    const stampY = margin;

    // Stamp Background & Border
    page.drawRectangle({
      x: stampX,
      y: stampY,
      width: stampWidth,
      height: stampHeight,
      color: rgb(1, 1, 1),
      borderColor: isIFC ? rgb(0.08, 0.45, 0.25) : isSuperseded ? rgb(0.8, 0.15, 0.15) : rgb(0.1, 0.3, 0.6),
      borderWidth: 1.5,
    });

    // Stamp Header Ribbon
    const headerHeight = 18;
    page.drawRectangle({
      x: stampX,
      y: stampY + stampHeight - headerHeight,
      width: stampWidth,
      height: headerHeight,
      color: isIFC ? rgb(0.08, 0.45, 0.25) : isSuperseded ? rgb(0.8, 0.15, 0.15) : rgb(0.1, 0.3, 0.6),
    });

    const headerText = isIFC
      ? "CONTROLLED COPY • ISSUED FOR CONSTRUCTION"
      : isSuperseded
      ? "VOID • SUPERSEDED DRAWING"
      : "CONTROLLED DOCUMENT • FOR REVIEW ONLY";

    page.drawText(headerText, {
      x: stampX + 8,
      y: stampY + stampHeight - 13,
      size: 7,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Left Column Text Lines
    const leftTextX = stampX + 8;
    let currentY = stampY + stampHeight - headerHeight - 12;
    const lineHeight = 10;

    // Doc Number & Rev
    page.drawText(`DOC: ${options.documentNumber}`, {
      x: leftTextX,
      y: currentY,
      size: 7.5,
      font: fontMono,
      color: rgb(0.1, 0.15, 0.25),
    });
    currentY -= lineHeight;

    page.drawText(`REV: ${options.revisionCode || "R00"}  |  DATE: ${todayStr}`, {
      x: leftTextX,
      y: currentY,
      size: 7,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.25),
    });
    currentY -= lineHeight;

    page.drawText(`PROJECT: ${options.projectCode}`, {
      x: leftTextX,
      y: currentY,
      size: 6.5,
      font: font,
      color: rgb(0.3, 0.35, 0.45),
    });
    currentY -= lineHeight;

    if (options.copyNumber) {
      page.drawText(`COPY NO: #${String(options.copyNumber).padStart(2, "0")}`, {
        x: leftTextX,
        y: currentY,
        size: 6.5,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.3),
      });
      currentY -= lineHeight;
    }

    if (options.issuedToParty) {
      page.drawText(`ISSUED TO: ${options.issuedToParty.slice(0, 24)}`, {
        x: leftTextX,
        y: currentY,
        size: 6,
        font: font,
        color: rgb(0.4, 0.45, 0.5),
      });
    }

    // Embed QR Code on the right side of the stamp box
    const qrSize = 54;
    const qrX = stampX + stampWidth - qrSize - 6;
    const qrY = stampY + (stampHeight - headerHeight - qrSize) / 2 + 2;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    page.drawText("SCAN TO VERIFY", {
      x: qrX + 2,
      y: qrY - 7,
      size: 5.5,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.45),
    });
  }

  return await pdfDoc.save();
}
