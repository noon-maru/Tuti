import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildHarumadiSpread, HarumadiSpreadSheets } from "@/features/tuti/components/HarumadiSpreadPreview";
import { HarumadiPageSheet } from "@/features/tuti/components/HarumadiSheet";
import { buildHarumadiReaderPages } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_LAYOUT as layout } from "@/shared/harumadi/pdfLayout";
import { harumadiContent } from "./fixtures/harumadiContent";

test("텍스트 미리보기만 본문·제목·메타를 키우고 실제 읽기는 기존 조판을 유지한다", () => {
  const { harumadi: book, entries: [entry] } = harumadiContent();
  const pages = buildHarumadiSpread(book, [entry]);
  const preview = renderToStaticMarkup(createElement(HarumadiSpreadSheets, { book, pages, still: true }));
  assert.match(preview, /--hm-body:18px;--hm-title:20px;--hm-meta:12px/);
  assert.match(preview, /color:#202826/);
  assert.match(preview, /data-reader-text-body="true"/);
  const actual = renderToStaticMarkup(createElement(HarumadiPageSheet, { page: pages[1]!, coverStyle: book.coverStyle, number: 1 }));
  assert.match(actual, /--hm-body:16px/);
  assert.doesNotMatch(actual, /--hm-body:18px|line-clamp:6|#202826/);
  const source = readFileSync("src/features/tuti/components/HarumadiSpreadPreview.tsx", "utf8");
  assert.match(source, /> \[data-harumadi-page="text"\], > \[data-harumadi-page="empty"\]/);
  assert.doesNotMatch(source, /> \[data-harumadi-page="photo"\]/);
});

test("긴 제목과 본문은 미리보기 안에서만 제한하고 실제 읽기의 전체 본문은 보존한다", () => {
  const { harumadi: book, entries: [entry] } = harumadiContent();
  const long = { ...entry, title: "기억하고 싶은 긴 하루의 이야기 ".repeat(10), content: "오늘의 작은 순간을 남깁니다.\n".repeat(100) };
  const pages = buildHarumadiReaderPages(book, [long]);
  assert.equal(pages.filter(page => page.entryId === entry.id).map(page => page.content).join(""), long.content);
  const html = renderToStaticMarkup(createElement(HarumadiSpreadSheets, { book, pages: buildHarumadiSpread(book, [long]), still: true }));
  assert.match(html, /\[data-reader-text-title\]\{-webkit-line-clamp:3/);
  assert.match(html, /\[data-reader-text-body\]\{-webkit-line-clamp:6/);
  const scale = 320 / layout.page.width;
  const maxShortCopyHeight = 2 * layout.shortText.paddingVertical * scale + 12 * 1.6 + layout.shortText.captionGap * scale + 3 * 20 * 1.5 + layout.shortText.titleGap * scale + 6 * 18 * 1.75;
  assert.ok(maxShortCopyHeight < layout.page.height * scale, "확대된 글자와 최대 줄 수가 지면 높이 안에 들어간다");
});

test("책 아래 제목은 한 단계 줄이고 감성 서체·두 줄 제한은 유지한다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const caption = source.match(/const Caption = styled.div`([^`]+)`/)![1];
  assert.match(caption, /font-size: var\(--font-size-300\)/);
  assert.match(caption, /font-family: var\(--font-emotional\)/);
  assert.match(caption, /-webkit-line-clamp: 2/);
});
