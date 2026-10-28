import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HARUMADI_PDF_LAYOUT as layout, harumadiPdfCssLength } from "@/shared/harumadi/pdfLayout";

test("PDF와 예시는 A5 기준 크기·사진 지면·짧은 글 지면·쪽번호 수치를 공유한다", () => {
  const pdf = readFileSync("src/server/pdf/harumadiPdf.tsx", "utf8");
  const sample = readFileSync("src/features/tuti/components/HarumadiSheet.tsx", "utf8");
  for (const source of [pdf, sample]) assert.match(source, /shared\/harumadi\/pdfLayout/);
  for (const field of ["photo.padding", "photo.paddingBottom", "photo.imageHeight", "photo.imageRadius", "photo.titlePaddingRight",
    "cover.bodyHeight", "cover.imageWidth", "cover.imageHeight", "shortText.frameLeft", "shortText.frameRight",
    "shortText.bodySize", "shortText.titleGap", "folio.right", "folio.bottom", "folio.fontSize"]) {
    assert.ok(pdf.includes(`layout.${field}`), `PDF: ${field}`);
    assert.ok(sample.includes(`layout.${field}`), `sample: ${field}`);
  }
  assert.deepEqual([layout.page.width, layout.page.height], [419.53, 595.28]);
  assert.equal(layout.photo.imageHeight, 250);
  assert.equal(layout.photo.shortGap, 66);
  assert.equal(layout.photo.longGap, 30);
  assert.equal(layout.photo.titleSize, 10);
  assert.equal(layout.photo.titleWeight, 600);
  assert.equal(layout.folio.bottom, 20);
});

test("pt 변환은 화면 너비에 비례하며 근삿값을 사용하지 않는다", () => {
  for (const pt of [9, 10, 14, 20, 34, 42, 48, 66, 210, 250, 260]) {
    const css = harumadiPdfCssLength(pt);
    assert.ok(Math.abs(parseFloat(css) / 100 * layout.page.width - pt) < 1e-10);
  }
  const sample = readFileSync("src/features/tuti/components/HarumadiSheet.tsx", "utf8");
  assert.doesNotMatch(sample, /top: 36%|59\.59cqw|15\.73cqw|17\.16cqw|object-fit: contain/);
  assert.match(sample, /textAnchor="end" fontFamily="Helvetica, Arial, sans-serif"/);
  assert.match(sample, /2026-06-28 · 동네 산책길/);
  assert.match(sample, /font-family: var\(--font-pretendard\)/);
  assert.match(readFileSync("src/app/fonts.ts", "utf8"), /Pretendard-SemiBold\.woff2",\s*weight: "600"/);
});

test("공유 수치로 실제 PDF의 표지·사진과 글·사진만·글만·뒷표지를 생성한다", async () => {
  const { renderHarumadiPdf, getHarumadiPdfEntryLayout } = await import("@/server/pdf/harumadiPdf");
  const { PDFDocument } = await import("pdf-lib");
  const sharp = (await import("sharp")).default;
  const image = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c7e887" } }).jpeg().toBuffer();
  const base = { title: "남긴 하루", placeName: "동네 카페", visitedAt: new Date("2026-06-23T03:00:00Z") };
  const entries = [
    { ...base, id: "mixed", image, content: "함께여서 좋았던 오후." },
    { ...base, id: "photo", title: "", image, content: "" },
    { ...base, id: "text", image: null, content: "집까지 조금 더 천천히 걸었다." },
  ];
  assert.deepEqual(entries.map(getHarumadiPdfEntryLayout), ["photo-text", "photo-only", "short-text"]);
  const bytes = await renderHarumadiPdf({ title: "함께 남긴 하루", entryIds: entries.map(e => e.id),
    coverStyle: "green-image", coverEntryId: "mixed", letter: "" }, entries);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 5);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - layout.page.width) < 0.0001);
    assert.ok(Math.abs(page.getHeight() - layout.page.height) < 0.0001);
  }
});
