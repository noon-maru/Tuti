import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HarumadiByline } from "@/features/tuti/components/HarumadiByline";
import { HarumadiPageViewer } from "@/features/tuti/components/HarumadiPageViewer";
import { buildHarumadiReaderPages, harumadiPageAuthor } from "@/shared/harumadi/readerPages";
import { readerPageWidth } from "@/shared/harumadi/readerText";
import { HARUMADI_READING_LAYOUT } from "@/shared/harumadi/readingTypography";
import { harumadiContent } from "./fixtures/harumadiContent";

test("작성자 표시는 종이 바로 아래에 두고 쪽 이동 버튼·쪽수와 분리한다", () => {
  const { harumadi, entries } = harumadiContent();
  entries[0].authorName = "정연한";
  const html = renderToStaticMarkup(createElement(HarumadiPageViewer, { book: { ...harumadi, shared: true }, entries, onClose() {} }));
  const paper = html.indexOf('data-harumadi-page="text"');
  const byline = html.indexOf("data-harumadi-byline");
  const navigation = html.indexOf('aria-label="하루마디 쪽 이동"');
  assert.ok(paper >= 0 && paper < byline && byline < navigation);
  assert.match(html.slice(byline, navigation), /<strong[^>]*>정연한<\/strong>의 마디/);
  assert.doesNotMatch(html.slice(navigation), /정연한|의 마디|<small/);
  assert.match(html, /margin-top:8px/);
  assert.match(html, /text-align:left/);
});

test("공동작성 본문·이어지는 쪽에만 작성자를 표시하고 표지·빈 책·개인 책은 제외한다", () => {
  const { harumadi, entries } = harumadiContent();
  entries[0].authorName = "  정연한  ";
  const page = buildHarumadiReaderPages(harumadi, entries)[1];
  for (const kind of ["text", "photo", "photo-only", "continuation"] as const) {
    assert.equal(harumadiPageAuthor(true, { ...page, kind }), "정연한");
  }
  for (const kind of ["cover", "back", "empty"] as const) assert.equal(harumadiPageAuthor(true, { ...page, kind }), null);
  assert.equal(harumadiPageAuthor(false, page), null);
  assert.equal(harumadiPageAuthor(true, { ...page, authorName: " " }), null);
  assert.equal(renderToStaticMarkup(createElement(HarumadiByline, { shared: false, authorName: "정연한" })), "");
  const empty = renderToStaticMarkup(createElement(HarumadiByline, { shared: true, authorName: null }));
  assert.match(empty, /aria-hidden="true"/);
  assert.doesNotMatch(empty, /의 마디|<strong/);
});

test("서명 공간은 쪽 크기 계산에 함께 반영하고 페이지가 바뀌어도 지면 높이는 일정하게 유지한다", () => {
  const { byline } = HARUMADI_READING_LAYOUT;
  const reserved = byline.gap + byline.height;
  assert.equal(reserved, 28);
  assert.equal(readerPageWidth(400, 500, reserved), 330);
  assert.equal(readerPageWidth(340, 600, reserved), readerPageWidth(340, 600));
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(viewer, /readerPageWidth\(node.clientWidth, node.clientHeight, captionSpace\)/);
  assert.match(viewer, /authorName=\{harumadiPageAuthor\(book.shared, retained.page\)\}/);
  assert.match(viewer, /\}, \[captionSpace\]\)/);
});

test("긴 작성자 이름은 한 줄로 정리하되 원문은 title과 접근성 텍스트에 남긴다", () => {
  const name = "오래 함께 남기는 사람 ".repeat(10);
  const html = renderToStaticMarkup(createElement(HarumadiByline, { shared: true, authorName: name }));
  assert.ok(html.includes(`title="${name}의 마디"`));
  assert.match(html, /text-overflow:ellipsis;white-space:nowrap/);
  assert.doesNotMatch(html, /<button|<img|role="button"/);
});
