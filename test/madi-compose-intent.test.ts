import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { MainNavigation } from "../src/features/tuti/components/MainNavigation";
import { MadiCreateScreen } from "../src/features/tuti/screens/journal/MadiCreateScreen";
import { MADI_COMPOSE_COPY } from "../src/shared/tuti/madiFields";

test("전역 작성과 선택 책 작성을 공통 문구로 구분하고 기존 대상·제스처를 유지한다", () => {
  const client = new QueryClient();
  const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, async prefetch() {} };
  for (const active of ["harumadi", "explore"] as const) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
      createElement(QueryClientProvider, { client }, createElement(MainNavigation, { active }))));
    assert.match(html, new RegExp(MADI_COMPOSE_COPY.globalAction));
    assert.match(html, new RegExp(`aria-description="${MADI_COMPOSE_COPY.chooseAfterSave}"`));
  }
  client.clear();
  const carousel = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(carousel, /<ChevronUp[^>]*\/>\{MADI_COMPOSE_COPY.bookAction\}/);
  assert.match(carousel, /aria-description=\{MADI_COMPOSE_COPY.swipeBookHint\}/);
  assert.match(carousel, /onCreateMadi\(active.id\)/);
  const navigation = readFileSync("src/features/tuti/components/MainNavigation.tsx", "utf8");
  assert.match(navigation, /router.push\(`\/madi\/new\?from=/);
  assert.doesNotMatch(navigation, /harumadiId=/, "선택 책을 하단 전역 작성에 암묵적으로 붙이지 않는다");
});

test("일반 작성에만 저장 후 담기를 안내하고 첫 마디·지정 책 안내는 보존한다", () => {
  const base = { onBack() {}, onCollection() {} };
  const general = renderToStaticMarkup(createElement(MadiCreateScreen, base));
  assert.match(general, new RegExp(MADI_COMPOSE_COPY.chooseAfterSave));
  const first = renderToStaticMarkup(createElement(MadiCreateScreen, { ...base, firstMadi: true }));
  assert.match(first, /사진 한 장, 짧은 이야기면 충분해요/);
  assert.doesNotMatch(first, new RegExp(MADI_COMPOSE_COPY.chooseAfterSave));
  const shared = renderToStaticMarkup(createElement(MadiCreateScreen, { ...base, inHarumadi: true, destination: { id: "book", title: "함께 쓰는 책", shared: true } }));
  assert.match(shared, /함께 쓰는 책/); assert.match(shared, /함께 채우는 사람들에게 보여요/);
  assert.doesNotMatch(shared, new RegExp(MADI_COMPOSE_COPY.chooseAfterSave));
});
