import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { groupHarumadiChoices } from "../src/shared/harumadi/recentChoices";
import { MadiHarumadiSelection } from "../src/features/tuti/screens/journal/MadiHarumadiSelection";
import { harumadiContent } from "./fixtures/harumadiContent";

test("최근 책은 중복 없이 앞에 두되 선택하지 않고 더 최신인 표시 정보를 유지한다", () => {
  const base = harumadiContent().harumadi;
  const recent = { ...base, id: "recent", title: "자주 담는 책", shared: true, revision: 1 };
  const other = { ...base, id: "other", title: "다른 책" };
  const newer = { ...recent, title: "바뀐 이름", shared: false, revision: 2 };
  const grouped = groupHarumadiChoices([recent, recent], [other, newer]);
  assert.deepEqual(grouped.recent, [newer]); assert.deepEqual(grouped.other, [other]);
  const client = new QueryClient();
  // 전체 캐시의 최근 책은 순서를 앞당기되 자동 선택하지 않는다.
  client.setQueryData(["library-harumadis", "owner", "all"], { pages: [{ harumadis: [other, recent], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(["recent-harumadis", "owner"], { harumadis: [recent] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MadiHarumadiSelection, { ownerId: "owner", entryId: "entry", onDone() {}, onNext() {} })));
  assert.ok(html.indexOf("자주 담는 책") < html.indexOf("다른 책"));
  assert.match(html, /최근 담은 하루마디/); assert.match(html, /함께 채우는 사람들에게 보여요/);
  assert.doesNotMatch(html, /type="radio"[^>]*checked/);
  assert.equal((html.match(/value="recent"/g) ?? []).length, 1);
  client.clear();
});

test("최근 추천이 없어도 일반 책을 고를 수 있고 실패는 계속 쓰기를 실행하지 않는다", () => {
  const base = harumadiContent().harumadi;
  const client = new QueryClient();
  client.setQueryData(["library-harumadis", "owner", "all"], { pages: [{ harumadis: [base], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(["recent-harumadis", "owner"], { harumadis: [] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MadiHarumadiSelection, { ownerId: "owner", entryId: "entry", onDone() {}, onNext() {} })));
  assert.match(html, new RegExp(base.title)); assert.doesNotMatch(html, /최근 담은 하루마디/);
  assert.doesNotMatch(html, /type="radio"[^>]*checked/); client.clear();
  const source = readFileSync("src/features/tuti/screens/journal/MadiHarumadiSelection.tsx", "utf8");
  assert.match(source, /await addMadiToHarumadi\(ownerId, selected, entryId, Boolean\(selectedBook\?\.shared\)\)/);
  assert.ok(source.indexOf("await addMadiToHarumadi") < source.indexOf("if (next) onNext(selected)"));
  assert.match(source, /gcTime: 0, retry: false/);
  const route = readFileSync("src/app/api/harumadis/recent/route.ts", "utf8");
  assert.match(route, /harumadiRequest\(request, userId => listRecentHarumadis\(userId\)\)/);
  assert.doesNotMatch(route, /searchParams/);
});
