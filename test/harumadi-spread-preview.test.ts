import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildHarumadiSpread, HarumadiSpreadPreview, HarumadiSpreadSheets } from "@/features/tuti/components/HarumadiSpreadPreview";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { harumadiReadCache } from "@/lib/harumadiReadCache";
import { harumadiContent } from "./fixtures/harumadiContent";

test("펼친 미리보기는 지정 순서의 실제 첫 두 지면만 보여준다", () => {
  const { harumadi: book, entries: [entry] } = harumadiContent();
  const second = { ...entry, id: "second", title: "두 번째", image: "/api/signed-photo" };
  const third = { ...entry, id: "third", title: "미리보기 밖" };
  const pages = buildHarumadiSpread({ ...book, entryIds: [second.id, entry.id, third.id] }, [entry, third, second]);
  assert.equal(pages.length, 2);
  assert.equal(pages[0]!.title, "두 번째"); assert.equal(pages[0]!.image, second.image);
  assert.equal(pages[1]!.title, entry.title);
  const empty = buildHarumadiSpread({ ...book, entryIds: [] }, []);
  assert.deepEqual(empty.map(page => page?.kind ?? null), [null, "empty"]);
  const long = buildHarumadiSpread(book, [{ ...entry, content: "오래 기억할 하루. ".repeat(600) }]);
  assert.equal(long[0], null);
  assert.equal(long[1]!.kind, "text");
});

test("마디 0·1개의 미리보기는 왼쪽을 비우고 오른쪽에 첫 안내나 첫 마디를 표시한다", () => {
  const { harumadi: book, entries: [entry] } = harumadiContent();
  for (const count of [0, 1]) {
    const current = { ...book, entryIds: count ? [entry.id] : [], backCoverText: "미리보기에 나오면 안 되는 뒤표지" };
    const pages = buildHarumadiSpread(current, count ? [entry] : []);
    assert.equal(pages[0], null);
    assert.equal(pages[1]!.kind, count ? "text" : "empty");
    const html = renderToStaticMarkup(createElement(HarumadiSpreadSheets, { book: current, pages, still: true }));
    const left = html.indexOf('data-spread-leaf="left"');
    const right = html.indexOf('data-spread-leaf="right"');
    assert.doesNotMatch(html.slice(left, right), /data-harumadi-page|마디를 펼치는 중/);
    assert.match(html.slice(right), count ? /산책/ : /첫 마디를 채워보세요/);
    assert.doesNotMatch(html, /미리보기에 나오면 안 되는 뒤표지/);
  }
});

test("선택한 한 권만 펼치고 기존 지면을 재사용한다", () => {
  const content = harumadiContent(), owner = "spread-owner";
  const client = new QueryClient();
  client.setQueryData(["harumadi-content", owner, content.harumadi.id], { content, ticket: harumadiReadCache.ticket(owner, content.harumadi.id), cached: false, missingImages: 0 });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiCarousel, {
    books: [content.harumadi, { ...content.harumadi, id: "neighbor" }], ownerId: owner, onOpen() {},
  })));
  assert.equal((html.match(/data-harumadi-spread-preview="true"/g) ?? []).length, 1);
  assert.match(html, /data-harumadi-page="text"/);
  assert.match(html, /data-book-opening-origin="true"/);
  assert.match(html, /산책/);
  assert.match(html, /data-spread-ready="true"/);
  assert.match(html, /data-spread-turning-cover="true"/);
  assert.match(html, /rotateY\(173deg\)/);
  assert.match(html, /rotateY\(-173deg\)/);
  assert.match(html, /900ms cubic-bezier/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  client.clear();
});

test("책장 미리보기는 책등을 고정한 채 표지와 왼쪽 지면만 펼친다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiSpreadPreview.tsx", "utf8");
  const spread = source.match(/const Spread = styled\.span`([\s\S]*?)`;/)![1];
  assert.doesNotMatch(spread, /translate|animation: \$/);
  assert.doesNotMatch(source, /centerSpread/);
  assert.match(source, /const unfoldLeft = keyframes`from \{ transform: rotateY\(173deg\)/);
  assert.match(source, /const turnCover = keyframes/);
  assert.match(source, /transform-origin: left center/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

test("닫힌 표지와 펼친 오른쪽 지면은 같은 중심에 남고 두 쪽 전체를 중앙으로 옮기지 않는다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const button = source.match(/const CoverButton = styled\(BaseButton\)[^`]*`([\s\S]*?)`;/)![1];
  assert.match(button, /transform:.*\$spread.*translateX\(-25%\)/);
  for (const width of [182, 378, 472.5, 640]) {
    const closedCoverCenter = width / 2;
    const rightPageCenter = width * .75 - width * .25;
    assert.equal(rightPageCenter, closedCoverCenter);
  }
  const fold = readFileSync("src/lib/carouselBookFold.ts", "utf8");
  assert.doesNotMatch(fold, /spread\.animate\(/);
});

test("공동작성 책의 이전 응답은 현재 마운트에서 권한 재검증 전 노출하지 않는다", () => {
  const content = harumadiContent(), owner = "shared-preview-owner";
  content.cacheable = false; content.harumadi.shared = true;
  content.entries[0].content = "서버 재검증 전에는 보이지 않는 내용";
  const client = new QueryClient();
  client.setQueryData(["harumadi-content", owner, content.harumadi.id], { content, ticket: harumadiReadCache.ticket(owner, content.harumadi.id), cached: false, missingImages: 0 });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiSpreadPreview, { book: content.harumadi, ownerId: owner })));
  assert.doesNotMatch(html, /서버 재검증 전에는 보이지 않는 내용/);
  assert.match(html, /마디를 펼치는 중/);
  assert.match(html, /data-spread-ready="false"/);
  client.clear();
});
