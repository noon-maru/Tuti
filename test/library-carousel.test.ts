import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { carouselDragProgress, carouselIndex, carouselPose, carouselSwipeDirection, carouselTapDirection } from "@/shared/harumadi/libraryCarousel";
import { createLibraryViewPreferences } from "@/lib/libraryViewPreferences";
import { harumadiContent } from "./fixtures/harumadiContent";

test("선택한 책의 양끝은 옆 책 이동, 가운데·키보드는 열기이며 목업 배율에 독립적이다", () => {
  for (const width of [280, 140]) {
    const bounds = { left: 50, width };
    assert.equal(carouselTapDirection(50 + width * .1, bounds), -1);
    assert.equal(carouselTapDirection(50 + width * .9, bounds), 1);
    assert.equal(carouselTapDirection(50 + width * .5, bounds), 0);
    assert.equal(carouselTapDirection(0, bounds, true), 0);
  }
  assert.equal(carouselTapDirection(10, { left: 0, width: 0 }), 0);
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /event\.detail === 0/);
  assert.match(source, /if \(direction\) void move\(direction\); else onOpen/);
});

test("한 권씩 선택도 계정별로 저장하고 기존 표지·책등 값은 그대로 읽는다", async () => {
  const values = new Map<string, string>(), storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  const preferences = createLibraryViewPreferences(storage);
  await preferences.save("owner", "carousel");
  assert.equal(await createLibraryViewPreferences(storage).load("owner"), "carousel");
  assert.equal(await preferences.load("another"), "carousel");
  for (const view of ["covers", "spines"] as const) { await preferences.save("owner", view); assert.equal(await preferences.load("owner"), view); }
});

test("중앙 책의 크기·각도와 양옆 책의 깊이는 대칭이며 드래그 중에도 연속적이다", () => {
  assert.deepEqual(carouselPose(0), { x: 0, scale: 1, rotation: -0, opacity: 1, zIndex: 100 });
  for (const distance of [.1, .5, 1, 1.5, 2]) {
    const left = carouselPose(-distance), right = carouselPose(distance);
    assert.equal(left.x, -right.x); assert.equal(left.rotation, -right.rotation);
    assert.equal(left.scale, right.scale); assert.equal(left.opacity, right.opacity);
    assert.equal(left.zIndex, right.zIndex);
  }
  assert.ok(carouselPose(.8).scale < carouselPose(.2).scale);
  assert.ok(Math.abs(carouselPose(1.00001).x - carouselPose(.99999).x) < .0001);
  assert.ok(Math.abs(carouselPose(2.00001).opacity - carouselPose(1.99999).opacity) < .0001);
  assert.equal(carouselPose(3).opacity, 0);
});

test("스와이프는 거리·속도를 구분하고 양 끝은 탄성 이동만 하며 목업 배율에 독립적이다", () => {
  assert.equal(carouselSwipeDirection(-5, 350, 10), 0);
  assert.equal(carouselSwipeDirection(-60, 350, 400), 1);
  assert.equal(carouselSwipeDirection(60, 350, 400), -1);
  assert.equal(carouselSwipeDirection(-15, 350, 20), 1);
  assert.equal(carouselSwipeDirection(-15, 350, 500), 0);
  assert.equal(carouselDragProgress(-40, 350, 2, 5), carouselDragProgress(-20, 175, 2, 5));
  assert.ok(Math.abs(carouselDragProgress(60, 350, 0, 5)) < .2);
  assert.ok(Math.abs(carouselDragProgress(-60, 350, 4, 5)) < .2);
  assert.equal(carouselIndex(["new", "a", "b"], { id: "b", index: 1 }), 2);
  assert.equal(carouselIndex(["a", "b"], { id: "next-page", index: 2 }), 1);
  assert.equal(carouselIndex(["a", "b", "next-page"], { id: "next-page", index: 2 }), 2);
  assert.equal(carouselIndex([], { id: null, index: 8 }), 0);
});

test("많은 책도 주변 표지만 렌더하고 현재 책 열기·공동작성 메뉴·단일 책 경계를 지킨다", () => {
  const base = harumadiContent().harumadi;
  const render = (count: number, hasNextPage = false) => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(HarumadiCarousel, { books: Array.from({ length: count }, (_, index) => ({ ...base, id: `book-${index}`, title: `하루 ${index}`, shared: index === 0 })), ownerId: "owner", hasNextPage, onOpen() {} })));
  const html = render(30, true);
  assert.match(html, /data-library-view="carousel"/);
  assert.match(html, /touch-action:pan-y/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.equal((html.match(/data-carousel-active="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-harumadi-card="true"/g) ?? []).length, 4);
  assert.match(html, /하루 0 메뉴/); assert.match(html, /함께 채우는 중/); assert.match(html, /1 \/ 30\+/);
  assert.match(html, /aria-label="이전 하루마디" disabled/);
  assert.doesNotMatch(html, /aria-label="다음 하루마디" disabled/);
  assert.match(render(1), /aria-label="다음 하루마디" disabled/);
  assert.equal(render(0), "");
});

test("포인터 취소·드래그 후 클릭·키보드·페이지 추가를 공통 책 열기와 연결한다", () => {
  const component = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(component, /onPointerCancel=.*finish\(event, true\)/);
  assert.match(component, /onLostPointerCapture=.*finish\(event, true\)/);
  assert.match(component, /event\.timeStamp < blockedClickUntil\.current/);
  assert.match(component, /current\.bookId/);
  assert.match(component, /ArrowLeft/); assert.match(component, /ArrowRight/);
  assert.match(component, /onLoadMore\(\)/); assert.match(component, /requesting\.current = true/);
  assert.match(component, /harumadiActions\(active\)/); assert.match(component, /onOpen\(active, button, mode\)/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /view === "carousel" \? <HarumadiCarousel/);
  assert.match(home, /result\.data\?\.pages\.flatMap/);
  assert.match(home, /flex-wrap: wrap/);
});
