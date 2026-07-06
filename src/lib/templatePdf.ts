import {
  debugPdfPositions,
  pdfImageFields,
  pdfMarkFields,
  pdfTemplatePath,
  pdfTemplateReferenceSize,
  pdfTextFields,
  type PdfPosition
} from "@/lib/pdfTemplateMap";
import type { HandoffData } from "@/types/form";

type PdfPage = {
  getWidth: () => number;
  getHeight: () => number;
  drawImage: (image: unknown, options: { x: number; y: number; width: number; height: number; rotate?: unknown }) => void;
  drawRectangle: (options: { x: number; y: number; width: number; height: number; borderColor: unknown; borderWidth: number; rotate?: unknown }) => void;
};

type PdfLibModule = {
  PDFDocument: {
    load: (bytes: ArrayBuffer) => Promise<{
      getPages: () => PdfPage[];
      embedPng: (bytes: Uint8Array) => Promise<unknown>;
      embedJpg: (bytes: Uint8Array) => Promise<unknown>;
      save: () => Promise<Uint8Array>;
    }>;
  };
  degrees: (angle: number) => unknown;
  rgb: (red: number, green: number, blue: number) => unknown;
};

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "未入力";
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of [...text]) {
    const next = line + char;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textToPng(text: string, field: PdfPosition) {
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(field.width * scale));
  canvas.height = Math.max(1, Math.floor(field.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを作成できませんでした。");

  let fontSize = (field.fontSize || 9) * scale;
  const maxLines = field.maxLines || 1;
  context.fillStyle = "#111";
  context.textBaseline = "top";

  for (let attempt = 0; attempt < 10; attempt += 1) {
    context.font = `${fontSize}px "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif`;
    const lines = wrapText(context, text, canvas.width - 4 * scale);
    const lineHeight = fontSize * 1.2;
    if (lines.length <= maxLines && lines.length * lineHeight <= canvas.height) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      lines.forEach((line, index) => {
        const metrics = context.measureText(line);
        const x = field.align === "center" ? Math.max(0, (canvas.width - metrics.width) / 2) : 2 * scale;
        context.fillText(line, x, scale + index * lineHeight);
      });
      return canvas.toDataURL("image/png");
    }
    fontSize -= 1;
  }

  return canvas.toDataURL("image/png");
}

async function dataUrlBytes(dataUrl: string) {
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadPdfLib(): Promise<PdfLibModule> {
  const modulePath = "/vendor/pdf-lib.esm.min.js";
  return import(/* webpackIgnore: true */ modulePath) as Promise<PdfLibModule>;
}

function scalePosition(field: PdfPosition, page: PdfPage): PdfPosition {
  // /Rotate 270 means a visually portrait page is pageHeight x pageWidth.
  // This reads the real template dimensions instead of assuming a fixed A4 box.
  const scaleX = page.getHeight() / pdfTemplateReferenceSize.width;
  const scaleY = page.getWidth() / pdfTemplateReferenceSize.height;
  return {
    ...field,
    x: field.x * scaleX,
    y: field.y * scaleY,
    width: field.width * scaleX,
    height: field.height * scaleY,
    fontSize: (field.fontSize || 9) * Math.min(scaleX, scaleY)
  };
}

function drawVisualImage(pdfLib: PdfLibModule, page: PdfPage, image: unknown, originalField: PdfPosition) {
  const field = scalePosition(originalField, page);
  page.drawImage(image, {
    x: field.y + field.height,
    y: page.getHeight() - field.x,
    width: field.width,
    height: field.height,
    rotate: pdfLib.degrees(270)
  });

  if (debugPdfPositions) {
    page.drawRectangle({
      x: field.y + field.height,
      y: page.getHeight() - field.x,
      width: field.width,
      height: field.height,
      borderColor: pdfLib.rgb(0.9, 0, 0),
      borderWidth: 0.4,
      rotate: pdfLib.degrees(270)
    });
    console.info("PDF position", { x: field.x, y: field.y, width: field.width, height: field.height });
  }
}

export async function createTemplatePdf(data: HandoffData, vendorName: string) {
  const pdfLib = await loadPdfLib();
  const templateResponse = await fetch(pdfTemplatePath);
  if (!templateResponse.ok) {
    throw new Error("テンプレートPDFが見つかりません。public/templates/handoff-template.pdf を配置してください。");
  }

  const pdfDoc = await pdfLib.PDFDocument.load(await templateResponse.arrayBuffer());

  for (const field of pdfTextFields) {
    const text = field.value(data);
    if (!text) continue;
    const page = pdfDoc.getPages()[field.pageIndex];
    if (!page) continue;
    const png = await pdfDoc.embedPng(await dataUrlBytes(textToPng(text, field)));
    drawVisualImage(pdfLib, page, png, field);
  }

  for (const field of pdfMarkFields) {
    const position = field.positions[field.value(data)];
    if (!position) continue;
    const page = pdfDoc.getPages()[position.pageIndex];
    if (!page) continue;
    const png = await pdfDoc.embedPng(await dataUrlBytes(textToPng("○", { ...position, align: "center" })));
    drawVisualImage(pdfLib, page, png, position);
  }

  for (const field of pdfImageFields) {
    const dataUrl = field.value(data);
    if (!dataUrl) continue;
    const page = pdfDoc.getPages()[field.pageIndex];
    if (!page) continue;
    const bytes = await dataUrlBytes(dataUrl);
    const image = dataUrl.startsWith("data:image/png") ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    drawVisualImage(pdfLib, page, image, field);
  }

  const outputBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(outputBytes).buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `業務引継書_${sanitizeFileName(vendorName)}_${sanitizeFileName(data.deceased.name)}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
