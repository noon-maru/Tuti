"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";

// 완성 PDF의 실제 첫 페이지를 축소한다. 현재 기록 사진으로 표지를 다시 만들지 않는다.
export async function renderHarumadiPdfCover(pdf: PDFDocumentProxy) {
  const page = await pdf.getPage(1);
  const original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(320 / original.width, 460 / original.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  try {
    await page.render({ canvas, canvasContext: context, viewport, background: "#FFFFFF" }).promise;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob && blob.size <= 131072 ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } finally { canvas.width = 0; canvas.height = 0; }
}
