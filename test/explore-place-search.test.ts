import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const queries: Array<Record<string, unknown>> = [];
(globalThis as { prisma?: unknown }).prisma = { place: { findMany: async (query: Record<string, unknown>) => {
  queries.push(query);
  return [{ id: "place-1", name: "테스트 공원", sourceSidoName: "서울특별시", sourceSigunguName: "성동구", image: "https://example.test/park.jpg", latitude: 37.5, longitude: 127, sourceContentType: "12" }];
} } };
const { GET } = await import("../src/app/api/places/search/route");
test("작은 여행 검색은 동반 카탈로그의 준비 완료 장소만 검색하고 일반 후보로 확장하지 않는다", async () => {
  const response = await GET(new Request("https://tuti.today/api/places/search?scope=explore&q=공원"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.places[0].image, "https://example.test/park.jpg");
  assert.equal(body.places[0].latitude, 37.5);
  assert.equal(queries.at(-1)?.take, 8);
  const where = JSON.stringify(queries.at(-1)?.where);
  assert.match(where, /공원/); assert.match(where, /dogCatalog/);
  assert.doesNotMatch(where, /"OR":\[\{"isActive":true,"reviewStatus":"approved"\}/);
  const filter = queries.at(-1)?.where as Record<string, unknown>;
  assert.equal(filter.source, "tourapi");
  assert.deepEqual(filter.dogCatalog, { is: { status: "ready" } });
  assert.deepEqual(filter.visibilityOverride, { not: "hide" });
  assert.deepEqual(filter.candidateOverride, { not: "exclude" });
  assert.equal("AND" in filter, false, "일반 추천 풀과 OR로 결합하지 않는다");
});
test("기존 마디 자동완성의 응답과 후보 범위는 유지한다", async () => {
  const response = await GET(new Request("https://tuti.today/api/places/search?q=공원"));
  const body = await response.json();
  assert.deepEqual(Object.keys(body.places[0]).sort(), ["id", "name", "region"]);
  assert.match(JSON.stringify(queries.at(-1)?.where), /"isActive":true,"reviewStatus":"approved"/);
});
test("작은 여행의 빈 검색어는 목록을 조회하지 않는다", async () => {
  const before = queries.length;
  const response = await GET(new Request("https://tuti.today/api/places/search?scope=explore&q=%20"));
  assert.deepEqual(await response.json(), { places: [] });
  assert.equal(queries.length, before);
});
function searchHarness(name: string, fetchWithSession: (...args: unknown[]) => Promise<Response>) {
  return clientFlowHarness("src/features/tuti/components/ExplorePlaceSearch.tsx", name, {
    "@tanstack/react-query": { useQuery() { throw Error("닫힌 검색에서 질의하면 안 됩니다"); } },
    "@emotion/react": { keyframes }, "@emotion/styled": styled,
    "lucide-react": { Search: "svg", X: "svg" },
    "@/shared/ui/AppDialogFrame": { AppDialogFrame: "section" },
    "@/lib/auth/session": { fetchWithSession },
    "./buttons": { IconButton: "button", BaseButton: "button" },
    "./MadiSearchField": { MadiSearchField: "input" },
  });
}
test("닫힌 검색은 아이콘만 표시하고 새 요청을 하지 않는다", () => {
  const harness = searchHarness("ExplorePlaceSearch", async () => { throw Error("unexpected fetch"); });
  const markup = renderToStaticMarkup(harness.render({ onSelect() {} }));
  assert.match(markup, /aria-label="장소 검색"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /type="search"/);
});
test("상세 뒤의 검색 아이콘은 유지하되 비활성 상태에서는 클릭으로 검색을 열지 않는다", () => {
  const harness = searchHarness("ExplorePlaceSearch", async () => { throw Error("unexpected fetch"); });
  const tree = harness.render({ disabled: true, onSelect() {} });
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /aria-label="장소 검색"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-expanded="false"/);
  const button = (tree.props.children as Array<{ props: { onClick: () => void } }>)[0];
  button.props.onClick();
  assert.match(renderToStaticMarkup(harness.render({ disabled: true, onSelect() {} })), /aria-expanded="false"/);
  const screen = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  assert.match(screen, /interactive && !departurePresentation && <SearchMenu/);
  assert.match(screen, /inert=\{searchInactive\} aria-hidden=\{searchInactive\}/);
  assert.match(screen, /<ExplorePlaceSearch disabled=\{searchInactive\}/);
  assert.doesNotMatch(screen, /detailPhase === "closed"[^\n]*<SearchMenu/);
});
test("검색은 공용 세션 전송·쿼리 인코딩·AbortSignal을 사용하고 실패를 구분한다", async () => {
  let captured: unknown[] = [];
  const harness = searchHarness("fetchExplorePlaces", async (...args) => { captured = args; return Response.json({ places: [] }); });
  // The harness executes the actual exported async function with substituted transport.
  const result = await harness.render("양평 공원");
  assert.deepEqual(result, { places: [] });
  assert.equal(captured[0], "places/search?scope=explore&q=" + encodeURIComponent("양평 공원"));
  assert.ok(captured[1] && "signal" in (captured[1] as object));
  const failed = searchHarness("fetchExplorePlaces", async () => new Response(null, { status: 503 }));
  await assert.rejects(async () => failed.render("공원"), /장소를 검색하지 못했어요/);
});
test("검색은 지연·취소·감속 모션과 앱 내부 공용 포커스 경계를 사용한다", () => {
  const source = readFileSync("src/features/tuti/components/ExplorePlaceSearch.tsx", "utf8");
  assert.match(source, /clearTimeout\(timer\)/); assert.match(source, /250/);
  assert.match(source, /queryFn: \(\{ signal \}\) => fetchExplorePlaces\(query, signal\)/);
  assert.match(source, /prefers-reduced-motion/); assert.match(source, /initialFocus=\{input\}/);
  assert.match(source, /onCancel=\{onClose\}/);
  assert.match(source, /"explore-place-search", "dog-catalog", query/);
  assert.match(source, /반려견 동반 등록 장소에서 찾아요/);
  assert.doesNotMatch(source, /저장된 장소 전체에서 찾아요/);
});
