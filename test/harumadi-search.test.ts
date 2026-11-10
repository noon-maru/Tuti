import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MadiSearchField } from "../src/features/tuti/components/MadiSearchField";
import { filterHarumadis } from "../src/features/tuti/hooks/useHarumadiSearch";
import { harumadiContent } from "./fixtures/harumadiContent";

test("책 검색은 공통 검색 필드에 목적에 맞는 레이블과 지우기를 제공한다", () => {
  const html = renderToStaticMarkup(createElement(MadiSearchField, { value: "우리", onChange() {}, label: "하루마디 이름 검색", placeholder: "하루마디 이름으로 찾기" }));
  assert.match(html, /하루마디 이름 검색/); assert.match(html, /검색 지우기/);
});
test("검색은 전체 캐시를 즉시 필터링하고 검색어별 서버 조회나 디바운스를 만들지 않는다", () => {
  const base = harumadiContent().harumadi;
  const books = Array.from({ length: 15 }, (_, index) => ({ ...base, id: String(index), title: index === 14 ? "CAFÉ에서 함께한 하루" : "우리의 하루" }));
  assert.deepEqual(filterHarumadis(books, "  café  ").map(book => book.id), ["14"]);
  assert.equal(filterHarumadis(books, "  "), books);
  assert.deepEqual(filterHarumadis(books, "없는 이름"), []);
  assert.deepEqual(filterHarumadis([{ ...base, title: "한글".normalize("NFD") }], "한글").length, 1);
  const hook = readFileSync("src/features/tuti/hooks/useHarumadiSearch.ts", "utf8");
  assert.doesNotMatch(hook, /useQuery|useInfiniteQuery|fetchHarumadis|setTimeout/);
  const library = readFileSync("src/features/tuti/hooks/useHarumadiLibrary.ts", "utf8");
  assert.match(library, /\["library-harumadis", ownerId, "all"\]/);
  assert.match(library, /fetchAllHarumadis\(ownerId!, signal\)/);
  const picker = readFileSync("src/features/tuti/screens/journal/MadiHarumadiSelection.tsx", "utf8");
  assert.match(picker, /setSelected\(null\); search.setSearch\(value\)/);
  assert.match(picker, /useHarumadiLibrary\(ownerId\)/);
  assert.doesNotMatch(picker, /useInfiniteQuery|fetchNextPage/);
});
