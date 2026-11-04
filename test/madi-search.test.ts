import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterJournalEntries } from "@/shared/tuti/journalSearch";
import { MadiSearchField } from "@/features/tuti/components/MadiSearchField";
import { harumadiContent } from "./fixtures/harumadiContent";

test("마디 검색은 순서를 보존하고 제목·본문·장소·작성자·한국 날짜를 교차 검색한다", () => {
  const base = harumadiContent().entries[0];
  const entries = [
    { ...base, id: "a", title: "CAFE", authorName: "서연", visitedAt: "2026-10-01T16:00:00Z" },
    { ...base, id: "b", title: "다른 하루", content: "기분 좋은 바람", visitedAt: "2026-09-01T00:00:00Z" },
  ];
  assert.equal(filterJournalEntries(entries, "  "), entries);
  for (const query of ["cafe", "서연", "2026-10-02", "서연 cafe"]) assert.deepEqual(filterJournalEntries(entries, query).map(entry => entry.id), ["a"]);
  assert.deepEqual(filterJournalEntries(entries, "기분 바람").map(entry => entry.id), ["b"]);
  assert.deepEqual(filterJournalEntries(entries, "공원").map(entry => entry.id), ["a", "b"]);
  assert.deepEqual(filterJournalEntries(entries, "없는 글"), []);
  assert.deepEqual(entries.map(entry => entry.id), ["a", "b"]);
});

test("검색 필드는 명확한 이름과 지우기를 제공하고 검색 결과가 없어도 원본 삭제로 안내하지 않는다", () => {
  const html = renderToStaticMarkup(createElement(MadiSearchField, { value: "서울", onChange() {} }));
  assert.match(html, /role="search"/);
  assert.match(html, /aria-label="마디 검색"/);
  assert.match(html, /aria-label="검색 지우기"/);
  const source = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.match(source, /filterJournalEntries\(allEntries, search\)/);
  assert.match(source, /shareEntry = allEntries.find/);
  assert.match(source, /검색한 마디가 없어요/);
  assert.match(source, /onClick=\{\(\) => setSearch\(""\)\}>전체 마디 보기/);
});
