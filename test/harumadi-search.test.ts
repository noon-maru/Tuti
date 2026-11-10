import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MadiSearchField } from "../src/features/tuti/components/MadiSearchField";

test("책 검색은 공통 검색 필드에 목적에 맞는 레이블과 지우기를 제공한다", () => {
  const html = renderToStaticMarkup(createElement(MadiSearchField, { value: "우리", onChange() {}, label: "하루마디 이름 검색", placeholder: "하루마디 이름으로 찾기" }));
  assert.match(html, /하루마디 이름 검색/); assert.match(html, /검색 지우기/);
});
test("검색은 계정별 서버 페이지를 사용하고 소유·활성 참여 권한 필터를 유지한다", () => {
  const service = readFileSync("src/server/harumadi/service.ts", "utf8");
  assert.match(service, /listHarumadis\(ownerId: string, cursorId: string \| null, search = ""\)/);
  assert.equal((service.match(/contains: title, mode: "insensitive"/g) ?? []).length, 3);
  assert.match(service, /userId, endedAt: null, harumadi: \{ ownerId: \{ not: userId \}/);
  const hook = readFileSync("src/features/tuti/hooks/useHarumadiSearch.ts", "utf8");
  assert.match(hook, /\["harumadi-search", ownerId, settled\]/);
  assert.match(hook, /getNextPageParam/); assert.match(hook, /250/);
  const picker = readFileSync("src/features/tuti/screens/journal/MadiHarumadiSelection.tsx", "utf8");
  assert.match(picker, /setSelected\(null\); search.setSearch\(value\)/);
});
