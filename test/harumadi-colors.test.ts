import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HARUMADI_COVER_COLORS, HARUMADI_PAPER_COLORS, getHarumadiPaperPalette } from "@/shared/harumadi/colors";
import { HARUMADI_PDF_COVER_STYLES, getHarumadiPdfCoverPalette, parseHarumadiPdfInput, parseHarumadiPdfDraft, emptyHarumadiPdfDraft } from "@/shared/api/harumadiPdf";
import { parseHarumadiSettings, parseHarumadiUpdate } from "@/shared/api/harumadi";
import { harumadiEditsDirty } from "@/shared/harumadi/editState";
import { HarumadiAppearanceFields } from "@/features/tuti/components/HarumadiAppearanceFields";
import { HarumadiPageSheet } from "@/features/tuti/components/HarumadiSheet";
import { buildHarumadiReaderPages } from "@/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";
import { isReadContent } from "@/lib/harumadiReadCache";
import { findMadiControl } from "./fixtures/madiCreateHarness";

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const contrast = (a: string, b: string) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };

test("표지 6색·사진 유무 12조합과 속지 6색은 읽을 수 있는 대비를 유지한다", () => {
  assert.equal(HARUMADI_COVER_COLORS.length, 6); assert.equal(HARUMADI_PAPER_COLORS.length, 6);
  assert.equal(HARUMADI_PDF_COVER_STYLES.length, 12);
  for (const color of HARUMADI_COVER_COLORS) {
    for (const layout of ["plain", "image"]) {
      const style = `${color.id}-${layout}` as typeof HARUMADI_PDF_COVER_STYLES[number];
      assert.ok(HARUMADI_PDF_COVER_STYLES.includes(style));
      assert.equal(getHarumadiPdfCoverPalette(style).background, color.background);
    }
    assert.ok(contrast(color.background, color.foreground) >= 4.5, color.id);
  }
  for (const color of HARUMADI_PAPER_COLORS) {
    const palette = getHarumadiPaperPalette(color.id);
    assert.ok(contrast(palette.background, palette.foreground) >= 4.5);
    assert.ok(contrast(palette.background, palette.muted) >= 4.5);
  }
});
test("생성·수정·PDF·초안이 같은 색상 허용 목록을 사용하고 임의 값을 거절한다", () => {
  const { harumadi } = harumadiContent();
  for (const color of HARUMADI_PAPER_COLORS) {
    for (const coverStyle of HARUMADI_PDF_COVER_STYLES) {
      const input = { ...harumadi, coverStyle, paperColor: color.id, letter: "", coverEntryId: null };
      assert.equal(parseHarumadiSettings(input)?.paperColor, color.id);
      assert.equal(parseHarumadiUpdate(input)?.paperColor, color.id);
      assert.equal(parseHarumadiPdfInput(input)?.paperColor, color.id);
      assert.equal(parseHarumadiPdfDraft({ ...emptyHarumadiPdfDraft(), ...input })?.paperColor, color.id);
    }
  }
  for (const paperColor of [null, "#fff", "url(secret)", "peach", 123]) {
    const input = { ...harumadi, paperColor, letter: "", coverEntryId: null };
    assert.equal(parseHarumadiSettings(input), null); assert.equal(parseHarumadiPdfInput(input), null);
  }
  assert.equal(parseHarumadiSettings(harumadi)?.paperColor, undefined);
});
test("색상은 캐시와 이탈 보호에 포함되고 이전 흰 속지와 구분된다", () => {
  const content = harumadiContent();
  const book = { ...content.harumadi, paperColor: "blue" as const, coverStyle: "peach-image" as const };
  assert.equal(isReadContent({ ...content, harumadi: book }), true);
  assert.equal(isReadContent({ ...content, harumadi: { ...book, paperColor: "custom" } }), false);
  assert.equal(harumadiEditsDirty(content.harumadi, "settings", book, [], []), true);
  assert.equal(harumadiEditsDirty(content.harumadi, "settings", { ...content.harumadi, paperColor: "white" }, [], []), false);
});
test("표지 구성·색상·속지 선택은 구분되며 읽기의 모든 속지에 같은 색을 전달한다", () => {
  const html = renderToStaticMarkup(createElement(HarumadiAppearanceFields, { value: { coverStyle: "pink-image", paperColor: "blue" }, onChange() {}, disabled: true }));
  assert.equal((html.match(/<button /g) ?? []).length, 14);
  assert.equal((html.match(/<button[^>]*aria-pressed="true"/g) ?? []).length, 3);
  assert.match(html, /aria-label="속지 하늘"/); assert.match(html, /<fieldset[^>]*disabled/);
  const { harumadi, entries } = harumadiContent();
  const pages = buildHarumadiReaderPages({ ...harumadi, coverStyle: "pink-image", paperColor: "blue" }, entries);
  for (const page of pages) {
    const sheet = renderToStaticMarkup(createElement(HarumadiPageSheet, { page, number: 1, coverStyle: "pink-image", paperColor: "blue" }));
    assert.ok(sheet.includes(page.kind === "cover" || page.kind === "back" ? "#F5E3EB" : "--hm-paper-background:#F1F7FC"));
  }
});

test("색상·사진 유무·속지를 차례로 고를 때 다른 선택을 잃지 않는다", () => {
  type Value = Parameters<typeof HarumadiAppearanceFields>[0]["value"];
  let value: Value = { coverStyle: "pink-image", paperColor: "ivory" };
  const render = () => HarumadiAppearanceFields({ value, onChange(next) { value = next; } });
  const click = (match: (p: Record<string, unknown>) => boolean) => {
    const control = findMadiControl(render(), match); assert.ok(control);
    (control.onClick as () => void)();
  };
  click(p => p["aria-label"] === "표지 하늘");
  assert.deepEqual(value, { coverStyle: "blue-image", paperColor: "ivory" });
  click(p => Array.isArray(p.children) && p.children.includes("사진 없이"));
  assert.deepEqual(value, { coverStyle: "blue-plain", paperColor: "ivory" });
  click(p => p["aria-label"] === "속지 보라");
  assert.deepEqual(value, { coverStyle: "blue-plain", paperColor: "lavender" });
});

test("실제 PDF의 앞뒤 표지와 사진·글·이어지는 본문·첫 장 글은 각각 선택한 색을 쓴다", async () => {
  const { renderHarumadiPdf } = await import("@/server/pdf/harumadiPdf");
  const sharp = (await import("sharp")).default;
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#d6e5bd" } }).jpeg().toBuffer();
  const base = { placeName: "동네", visitedAt: new Date("2026-11-18T00:00:00Z") };
  const entries = [
    { ...base, id: "photo", image, title: "", content: "" },
    { ...base, id: "mixed", image, title: "사진과 글", content: "한 장과 한 문장." },
    { ...base, id: "short", image: null, title: "짧은 글", content: "남겨두는 하루." },
    { ...base, id: "long", image: null, title: "긴 글", content: "함께 걷던 하루를 오래 기억하고 싶다.\n".repeat(100) },
  ];
  const pdf = await renderHarumadiPdf({ title: "색을 담은 하루", coverStyle: "pink-image", paperColor: "blue", coverEntryId: "photo", letter: "첫 장의 이야기", entryIds: entries.map(e => e.id) }, entries);
  const task = getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/` });
  try {
    const doc = await task.promise;
    assert.ok(doc.numPages >= 8);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), ops = await page.getOperatorList();
      const index = ops.fnArray.indexOf(OPS.setFillRGBColor);
      assert.equal(ops.argsArray[index]?.[0], i === 1 || i === doc.numPages ? "#f5e3eb" : "#f1f7fc", `page ${i}`);
    }
  } finally { await task.destroy(); }
});
