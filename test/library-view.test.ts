import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createLibraryViewPreferences } from "@/lib/libraryViewPreferences";
import { parseLibraryView, spineColumnCount } from "@/shared/harumadi/libraryView";
import { HarumadiShelf, HarumadiSpine } from "@/features/tuti/components/HarumadiShelf";
import { LibraryViewSwitch } from "@/features/tuti/components/LibraryViewSwitch";
import { harumadiContent } from "./fixtures/harumadiContent";

test("한 권씩 보기가 기본이고 기존 선택은 계정별 기기 저장소와 메모리에 유지한다", async () => {
  const data = new Map<string, string>();
  const storage = { async getItem(key: string) { return data.get(key) ?? null; }, async setItem(key: string, value: string) { data.set(key, value); } };
  const first = createLibraryViewPreferences(storage);
  assert.equal(first.peek("a"), "carousel");
  await first.save("a", "spines");
  assert.equal(first.peek("a"), "spines");
  assert.equal(first.peek("b"), "carousel");
  assert.equal(await createLibraryViewPreferences(storage).load("a"), "spines");
  assert.equal(await first.load("b"), "carousel");
  for (const invalid of [null, "", "grid", "book", "{}", undefined]) assert.equal(parseLibraryView(invalid), "carousel");
  await first.save("b", "covers");
  assert.equal(await createLibraryViewPreferences(storage).load("b"), "covers");
});

test("느린 저장소 읽기는 방금 선택한 보기나 다른 계정의 선택을 덮어쓰지 않는다", async () => {
  let resolve!: (value: string | null) => void;
  const preferences = createLibraryViewPreferences({ getItem: () => new Promise(done => { resolve = done; }), async setItem() {} });
  const loading = preferences.load("a");
  await preferences.save("a", "spines");
  resolve("covers");
  assert.equal(await loading, "spines");
  await preferences.save("b", "covers");
  assert.equal(preferences.peek("a"), "spines");
  assert.equal(preferences.peek("b"), "covers");
  const unavailable = createLibraryViewPreferences({ async getItem() { throw new Error("unavailable"); }, async setItem() { throw new Error("unavailable"); } });
  assert.equal(await unavailable.load("a"), "carousel");
  await unavailable.save("a", "spines");
  assert.equal(await unavailable.load("a"), "spines");
});

test("보기 선택은 현재 보기 하나만 노출하고 공용 팝오버에서 세 보기를 선택한다", () => {
  for (const view of ["covers", "spines", "carousel"] as const) {
    const html = renderToStaticMarkup(createElement(LibraryViewSwitch, { view, onChange() {} }));
    const label = { covers: "표지", spines: "책등", carousel: "한 권씩" }[view];
    assert.ok(html.includes(`aria-label="책장 보기 방식, 현재 ${label}"`));
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));
    assert.deepEqual(buttons, [label]);
    assert.match(html, /min-height:44px/);
  }
  const source = readFileSync("src/features/tuti/components/LibraryViewSwitch.tsx", "utf8");
  assert.match(source, /selected: item.value === view/);
  assert.match(source, /kind: "radio"/);
  assert.match(source, /onSelect: \(\) => onChange\(item.value\)/);
  for (const label of ["한 권씩", "표지", "책등"]) assert.ok(source.includes(`label: "${label}"`));
  const menu = readFileSync("src/features/tuti/components/ContextMenu.tsx", "utf8");
  assert.match(menu, /role=\{item.kind === "radio" \? "menuitemradio" : "menuitem"\}/);
  assert.match(menu, /aria-checked=\{item.kind === "radio" \? Boolean\(item.selected\) : undefined\}/);
  assert.match(menu, /\[role="menuitem"\], \[role="menuitemradio"\]/);
});

test("한 권씩 보기의 설명과 넘기기 행은 24px 간격을 높이 측정에 포함한다", () => {
  const carousel = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const controls = carousel.match(/const Controls = styled\.nav`([^`]+)`/)![1];
  assert.match(controls, /margin-top: 24px/);
  assert.match(carousel, /carouselStageHeight\(node.clientWidth, available, description.offsetHeight\)/);
  assert.match(carousel, /<Details ref=\{details\}>[\s\S]*?<Controls[\s\S]*?<\/Details>/);
  assert.match(carousel, /for \(const target of \[parent, carousel, description/);
});

test("책등은 표지 색상과 세로 제목을 쓰며 사진 요청 없이 모든 책과 공통 메뉴를 표시한다", () => {
  const base = harumadiContent().harumadi;
  const books = Array.from({ length: 5 }, (_, index) => ({ ...base, id: `book-${index}`, title: `우리의 하루 ${index}`, coverStyle: "green-image" as const, shared: index === 1 }));
  const html = renderToStaticMarkup(createElement(HarumadiShelf, { books, ownerId: "owner", view: "spines", onOpen() {} }));
  assert.match(html, /data-library-view="spines"/);
  assert.equal((html.match(/data-harumadi-card="true"/g) ?? []).length, 5);
  assert.equal((html.match(/data-harumadi-spine="true"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<img|library-cover|loading="lazy"/);
  assert.match(html, /writing-mode:vertical-rl/);
  assert.match(html, /#EBF5D5/);
  assert.match(html, /함께/);
  for (const book of books) {
    assert.match(html, new RegExp(`aria-label="${book.title}, 마디 1개 열기"`));
    assert.match(html, new RegExp(`aria-label="${book.title} 메뉴"`));
  }
  const white = renderToStaticMarkup(createElement(HarumadiSpine, { book: { ...base, coverStyle: "white-plain" } }));
  assert.match(white, /#FFFFFF/);
});

test("기존 표지 보기는 두 열과 간격을 유지하고 사진이 없는 책도 열 수 있다", () => {
  const book = harumadiContent().harumadi;
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(HarumadiShelf, { books: [book], ownerId: "owner", view: "covers", onOpen() {} })));
  assert.match(html, /data-library-view="covers"/);
  assert.doesNotMatch(html, /data-harumadi-spine/);
  assert.match(html, /grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /gap:24px;padding:0 8px/);
  assert.match(html, /aria-label="함께한 하루, 마디 1개 열기"/);
});

test("표지·책등은 남는 높이에서 중앙 배치하고 넘치는 목록의 상단은 잘리지 않는다", () => {
  const shelf = readFileSync("src/features/tuti/components/HarumadiShelf.tsx", "utf8");
  assert.match(shelf, /<ShelfContent ref=\{shelf\} data-library-view=\{view\}/);
  assert.match(shelf, /const ShelfContent = styled.div`flex: none; width: 100%; margin-block: auto/);
  assert.match(shelf, /> div:last-child \{ margin-bottom: 0; \}/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /overflow-y: auto; overscroll-behavior: contain; padding: 12px 20px/);
  assert.doesNotMatch(home, /LibraryLinks|ArchiveMenu/);
});

test("책등 열 수는 CSS 너비로 계산하고 페이지네이션·열기 이력을 두 보기에서 공유한다", () => {
  assert.equal(spineColumnCount(280), 3);
  assert.equal(spineColumnCount(350), 4);
  assert.equal(spineColumnCount(200), 2);
  assert.equal(spineColumnCount(1000), 6);
  const shelf = readFileSync("src/features/tuti/components/HarumadiShelf.tsx", "utf8");
  assert.match(shelf, /spineColumnCount\(node.clientWidth\)/);
  assert.match(shelf, /spines \? <HarumadiSpine book=\{book\} \/> : <HarumadiCover/);
  assert.match(shelf, /items=\{harumadiActions\(book\)/);
  assert.match(shelf, /onOpen\(book, trigger, action.mode\)/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /useLibraryView\(ownerId\)/);
  assert.match(home, /<HarumadiShelf books=\{harumadiPdfs\} ownerId=\{ownerId\} view=\{!search.searching && view === "spines" \? "spines" : "covers"\} onOpen=\{openBook\}/);
  assert.doesNotMatch(home, /query.fetchNextPage\(\)/);
  assert.match(home, /harumadiLocalRect\(bounds, cover/);
});

test("표지·책등은 선반과 종이 단면 간격을 확보하고 설명·메뉴와 hover 기준은 유지한다", () => {
  const book = harumadiContent().harumadi;
  for (const view of ["covers", "spines"] as const) {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(HarumadiShelf, { books: [book], ownerId: "owner", view, onOpen() {} })));
    assert.match(html, /display:grid;gap:10px;width:100%/);
    assert.match(html, new RegExp(`bottom:${view === "spines" ? 92 : 108}px`));
    assert.match(html, /height:6px/);
    assert.match(html, /translateY\(-5px\)/);
    assert.match(html, /prefers-reduced-motion:\s*reduce/);
    assert.match(html, /함께한 하루 메뉴/);
  }
});
