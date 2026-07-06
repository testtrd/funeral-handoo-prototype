"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "未入力";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJsonFile(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, fileName);
}

export async function createElementPdfBlob(element: HTMLElement) {
  await document.fonts?.ready;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 3;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  async function renderCanvas(target: HTMLElement) {
    return html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight
    });
  }

  function addCanvas(canvas: HTMLCanvasElement, fitSinglePage: boolean) {
    const imageData = canvas.toDataURL("image/jpeg", 0.96);
    const imageHeight = (canvas.height * availableWidth) / canvas.width;
    if (imageHeight <= availableHeight || fitSinglePage) {
      const renderWidth = imageHeight > availableHeight
        ? Math.min(availableWidth, (canvas.width * availableHeight) / canvas.height)
        : availableWidth;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      const x = (pageWidth - renderWidth) / 2;
      pdf.addImage(imageData, "JPEG", x, margin, renderWidth, renderHeight);
      return;
    }

    let remainingHeight = imageHeight;
    let sourceY = 0;
    const sourcePageHeight = (canvas.width * availableHeight) / availableWidth;

    while (remainingHeight > 0) {
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.min(sourcePageHeight, canvas.height - sourceY);
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("PDF画像の作成に失敗しました。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, sourceY, pageCanvas.width, pageCanvas.height, 0, 0, pageCanvas.width, pageCanvas.height);
      const pageImage = pageCanvas.toDataURL("image/jpeg", 0.96);
      const pageImageHeight = (pageCanvas.height * availableWidth) / pageCanvas.width;
      pdf.addImage(pageImage, "JPEG", margin, margin, availableWidth, pageImageHeight);
      sourceY += sourcePageHeight;
      remainingHeight -= availableHeight;
      if (remainingHeight > 0) pdf.addPage();
    }
  }

  const internalReport = element.classList.contains("internal-storage-report")
    ? element
    : element.children.length === 1 && element.firstElementChild?.classList.contains("internal-storage-report")
      ? element.firstElementChild as HTMLElement
      : null;

  if (internalReport) {
    const pages = Array.from(internalReport.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage();
      addCanvas(await renderCanvas(page), page.classList.contains("paper-report"));
    }
  } else {
    const isSingleHandoffSheet =
      element.classList.contains("paper-report") ||
      element.classList.contains("relative-copy-report") ||
      Boolean(element.children.length === 1 && (
        element.firstElementChild?.classList.contains("paper-report") ||
        element.firstElementChild?.classList.contains("relative-copy-report")
      ));
    addCanvas(await renderCanvas(element), isSingleHandoffSheet);
  }

  return pdf.output("blob");
}

export async function downloadElementAsPdf(element: HTMLElement, fileName: string) {
  downloadBlob(await createElementPdfBlob(element), fileName);
}
