import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { carouselBookCenter, carouselDragProgress, carouselGestureAxis, carouselIndex, carouselPose, carouselShouldWrite, carouselStageHeight, carouselSwipeDirection, carouselTapDirection, carouselWriteProgress } from "@/shared/harumadi/libraryCarousel";
import { createLibraryViewPreferences } from "@/lib/libraryViewPreferences";
import { harumadiContent } from "./fixtures/harumadiContent";

test("책 전시 높이는 종이 비율과 실제 설명·추가 UI 높이를 반영한다", () => {
  const normal = carouselStageHeight(350, 561, 170);
  assert.equal(normal, 359);
  assert.equal(carouselStageHeight(350, 649, 170), 447, "긴 화면에서는 전시 영역을 채우고 설명은 하단에 둔다");
  assert.equal(carouselStageHeight(350, 384, 170), 182);
  assert.equal(carouselStageHeight(350, 384, 200), 152, "긴 제목·작성자에 필요한 높이를 회수한다");
  assert.equal(carouselStageHeight(280, 280, 200), 140, "좁은 화면은 최소 전시 공간을 유지하고 스크롤한다");
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /description.offsetHeight/);
  assert.match(source, /child.offsetHeight/);
  assert.doesNotMatch(source, /min-height: 76px|padding-left: 44px/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.doesNotMatch(home, /div:only-child/);
});

test("책은 전시·설명 전체 영역의 중앙을 지향하고 작은 화면에서는 설명과 겹치지 않는다", () => {
  assert.equal(carouselBookCenter(500, 170, 220), 335);
  assert.equal(carouselBookCenter(359, 170, 220), 237);
  for (const [stage, details, book] of [[500, 170, 220], [359, 170, 220], [182, 170, 150], [140, 220, 124]]) {
    const center = carouselBookCenter(stage, details, book);
    assert.ok(center - book / 2 >= 0);
    assert.ok(center + book / 2 <= stage);
  }
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /top: var\(--carousel-book-center\)/);
  assert.match(source, /detailsHeight: description.offsetHeight/);
  assert.doesNotMatch(source, /top: 48%/);
});

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
  assert.match(home, /<Header><LibraryViewSwitch/);
});

test("터치 자식의 암시적 캡처가 무대로 이동해도 스와이프를 취소하지 않는다", () => {
  // 실제 컴포넌트 핸들러로 캡처 이전 순서를 합성한다. 실기기 테스트는 아니다.
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const gesture = { current: { id: 1, x: 200, y: 100, dx: 0, startedAt: 0, width: 320, dragging: false, bookId: "book" } as Record<string, unknown> | null };
  const blockedClickUntil = { current: 0 }, directions: number[] = [];
  let captured = false;
  const target = { setPointerCapture() { captured = true; }, hasPointerCapture() { return captured; }, releasePointerCapture() { captured = false; } };
  const finishBody = source.match(/const finish = .*?=> \{([\s\S]*?)\n  \};/)![1];
  const writes: string[] = [], active = { id: "book" };
  const finish = new Function("gesture", "setDrag", "setDragging", "blockedClickUntil", "active", "carouselSwipeDirection", "move", "setWriteProgress", "pending", "loading", "carouselShouldWrite", "onCreateMadi", `return (event, cancelled = false) => {${finishBody}}`)(gesture, () => {}, () => {}, blockedClickUntil, active, carouselSwipeDirection, (direction: number) => directions.push(direction), () => {}, false, false, carouselShouldWrite, (id: string) => writes.push(id));
  const followBody = source.match(/const follow = .*?=> \{([\s\S]*?)\n  \};/)![1];
  const follow = new Function("gesture", "setDragging", "setDrag", "carouselDragProgress", "index", "books", "carouselGestureAxis", "onCreateMadi", "blockedClickUntil", "setWriteProgress", "carouselWriteProgress", `return event => {${followBody}}`)(gesture, () => {}, () => {}, carouselDragProgress, 0, [{}, {}], carouselGestureAxis, () => {}, blockedClickUntil, () => {}, carouselWriteProgress);
  const lostBody = source.match(/onLostPointerCapture=\{event => \{(.*?)\}\}/)![1];
  const lost = new Function("finish", `return event => {${lostBody}}`)(finish);
  const event = { pointerId: 1, clientX: 150, clientY: 100, timeStamp: 100, currentTarget: target };
  follow(event);
  lost({ ...event, target: {} });
  assert.ok(gesture.current, "자식에서 발생해 버블링한 캡처 해제는 무시한다");
  finish({ ...event, clientX: 120, timeStamp: 200 });
  assert.deepEqual(directions, [1]);
  assert.equal(captured, false);
  assert.equal(gesture.current, null);
  assert.equal(blockedClickUntil.current, 500);
  gesture.current = { id: 1, x: 200, y: 100, dx: 0, startedAt: 0, width: 320, dragging: false, bookId: "book" };
  follow(event);
  lost({ ...event, target });
  assert.equal(gesture.current, null, "무대 자체의 캡처 소실은 취소한다");
  assert.deepEqual(directions, [1]);
  const reset = () => { gesture.current = { id: 1, x: 200, y: 100, dx: 0, startedAt: 0, width: 320, dragging: false, bookId: "book" }; };
  reset();
  follow({ ...event, clientX: 200, clientY: 70 });
  lost({ ...event, target: {} });
  finish({ ...event, clientX: 200, clientY: 20, timeStamp: 300 });
  assert.deepEqual(writes, ["book"]);
  reset();
  follow({ ...event, clientX: 200, clientY: 70 });
  finish({ ...event, clientX: 200, clientY: 20 }, true);
  reset();
  follow({ ...event, clientX: 200, clientY: 70 });
  finish({ ...event, clientX: 200, clientY: 95, timeStamp: 600 });
  reset();
  follow({ ...event, clientX: 200, clientY: 70 });
  active.id = "changed";
  finish({ ...event, clientX: 200, clientY: 20 });
  active.id = "book";
  assert.deepEqual(writes, ["book"], "취소나 선택 변경은 작성 화면을 열지 않는다");
  reset();
  follow(event); // 좌우 축을 먼저 선택한 뒤 크게 위로 움직여도 작성하지 않는다.
  finish({ ...event, clientY: -20, timeStamp: 300 });
  assert.deepEqual(writes, ["book"]);
  reset();
  follow({ ...event, clientX: 200, clientY: 130 });
  finish({ ...event, clientX: 200, clientY: 180, timeStamp: 300 });
  assert.deepEqual(writes, ["book"], "아래로 내리기는 작성 동작이 아니다");
  assert.equal(gesture.current, null);
});

test("위로 쓰기는 충분한 거리·빠른 의도에만 반응하고 반대 방향과 미세 이동은 무시한다", () => {
  assert.equal(carouselGestureAxis(3, -4, true), null);
  assert.equal(carouselGestureAxis(30, -10, true), "horizontal");
  assert.equal(carouselGestureAxis(5, -30, true), "up");
  assert.equal(carouselGestureAxis(5, 30, true), "scroll");
  assert.equal(carouselGestureAxis(5, -30, false), "scroll");
  assert.equal(carouselShouldWrite(-10, 320, 5), false);
  assert.equal(carouselShouldWrite(-30, 320, 400), false);
  assert.equal(carouselShouldWrite(-30, 320, 40), true);
  assert.equal(carouselShouldWrite(-70, 320, 600), true);
  assert.equal(carouselShouldWrite(70, 320, 40), false);
  assert.equal(carouselWriteProgress(-40, 320), carouselWriteProgress(-20, 160));
  assert.equal(carouselWriteProgress(40, 320), 0);
  assert.equal(carouselWriteProgress(-200, 320), 1);
});

test("위로 쓰기 안내는 버튼으로도 실행할 수 있고 현재 책의 기존 작성 경로를 사용한다", () => {
  const client = new QueryClient();
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiCarousel, {
      books: [harumadiContent().harumadi], ownerId: "owner", onOpen() {}, onCreateMadi() {},
    })));
    assert.match(html, /위로 쓸어 마디 남기기/);
    assert.match(html, /touch-action:pinch-zoom/);
    assert.match(html, /이 하루마디에 마디 남기기/);
    const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
    assert.match(home, /onCreateMadi=\{bookId => router.push\(`\/madi\/new\?from=library&harumadiId=\$\{encodeURIComponent\(bookId\)\}/);
    const source = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
    assert.match(source, /harumadiId/);
  } finally { client.clear(); }
});
