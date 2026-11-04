import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildHarumadiReaderPages } from "@/shared/harumadi/readerPages";
import { readerMetaLabel, readerTextLines } from "@/shared/harumadi/readerText";
import { HARUMADI_PDF_LAYOUT as pdf } from "@/shared/harumadi/pdfLayout";
import { HARUMADI_READING_TYPE as type, HARUMADI_READING_LAYOUT as ui } from "@/shared/harumadi/readingTypography";
import { harumadiContent } from "./fixtures/harumadiContent";

test("장문 첫 쪽은 실제 넓은 본문과 상단 정렬 여백을 사용하며 원문을 보존한다", () => {
  for (const width of [220, 280, 320, 350, 400]) for (const title of ["", "작은 하루"]) for (const place of ["", "산책길"]) {
    const { harumadi: book, entries } = harumadiContent();
    Object.assign(entries[0], { title, placeName: place, image: null, content: "가".repeat(2000) });
    const pages = buildHarumadiReaderPages(book, entries, width).slice(1, -1);
    const first = pages[0], scale = width / pdf.page.width;
    const bodyWidth = width - 2 * pdf.page.padding * scale;
    const meta = Math.min(2, readerTextLines(readerMetaLabel(first.date, place), bodyWidth, type.meta).length) * type.meta * ui.continuation.metaLineHeight + pdf.shortText.captionGap * scale;
    const titleHeight = title ? readerTextLines(title, bodyWidth, type.title, undefined, 600).length * type.title * type.titleLineHeight + pdf.shortText.titleGap * scale : 0;
    const header = ui.longText;
    const available = width * pdf.page.height / pdf.page.width - (pdf.page.padding + pdf.page.paddingBottom + header.headerGapPt + header.headerPaddingPt + header.headerBorderPt) * scale - meta - titleHeight;
    const count = readerTextLines(first.content, bodyWidth, type.body).length;
    assert.ok(first.long);
    assert.equal(count, Math.floor((available - ui.safety) / (type.body * type.bodyLineHeight)), `${width}px ${title} ${place}`);
    assert.equal(pages.map(page => page.content).join(""), entries[0].content);
    if (width === 320 && title && !place) assert.ok(first.content.length > 120, "이전 짧은 글용 분할보다 첫 쪽에 더 담는다");
  }
});

test("사진 간격은 22–36px에서 연속 조정하고 맞는 글을 다음 쪽으로 보내지 않는다", () => {
  const { harumadi: book, entries } = harumadiContent();
  Object.assign(entries[0], { title: "하루", image: "/synthetic-photo.jpg", placeName: "", content: "가\n나\n다\n라" });
  const pages = buildHarumadiReaderPages(book, entries, 350);
  assert.deepEqual(pages.map(page => page.kind), ["cover", "photo", "back"]);
  assert.ok(pages[1].storyGap! > ui.photo.longGap && pages[1].storyGap! < ui.photo.shortGap);
  assert.equal(pages[1].content, entries[0].content);
  for (const width of [220, 280, 320, 350, 400]) {
    entries[0].content = "사진과 함께 남기는 하루. ".repeat(200);
    const result = buildHarumadiReaderPages(book, entries, width).slice(1, -1);
    assert.equal(result[0].storyGap, ui.photo.longGap);
    assert.equal(result.map(page => page.content).join(""), entries[0].content);
  }
  assert.equal(pdf.photo.shortGap, 66);
  assert.equal(pdf.photo.longGap, 30, "인쇄 간격은 화면 조정과 별개다");
});

test("사진의 긴 장소명은 두 줄 높이를 예약하고 없는 장소는 장식과 구분점을 남기지 않는다", () => {
  const { harumadi: book, entries } = harumadiContent();
  Object.assign(entries[0], { title: "하루", image: "/synthetic-photo.jpg", placeName: "아주긴장소".repeat(20), content: "사진에 남긴 이야기. ".repeat(80) });
  const pages = buildHarumadiReaderPages(book, entries, 320);
  assert.equal(pages[1].headerHeight, ui.photo.metaLines * type.meta * ui.photo.metaLineHeight);
  assert.equal(pages.slice(1, -1).map(page => page.content).join(""), entries[0].content);
  entries[0].title = ""; entries[0].content = "";
  assert.equal(buildHarumadiReaderPages(book, entries, 320)[1].headerHeight, pages[1].headerHeight);
  entries[0].placeName = "";
  assert.equal(buildHarumadiReaderPages(book, entries, 320)[1].headerHeight, ui.headerHeight);
  assert.equal(readerMetaLabel("2026-11-04", ""), "2026-11-04");
  const sheet = readFileSync("src/features/tuti/components/HarumadiSheet.tsx", "utf8");
  assert.match(sheet, /place && <Place>/);
  assert.match(sheet, /-webkit-line-clamp: var\(--hm-place-lines, unset\)/);
  assert.match(sheet, /height=\{page.headerHeight\}/);
  assert.match(sheet, /page.storyGap \?\? readingLayout.photo.shortGap/);
});
