import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { carouselDragProgress, carouselDraggedPose, carouselGestureAxis, carouselIndex, carouselPose, carouselPreviewSize, carouselShouldWrite, carouselSwipeDirection, carouselTapDirection, carouselVisibleTapBounds, carouselWriteProgress } from "@/shared/harumadi/libraryCarousel";
import { createLibraryViewPreferences } from "@/lib/libraryViewPreferences";
import { harumadiContent } from "./fixtures/harumadiContent";

test("책 전시 영역은 CSS로 남는 공간을 채우고 실제 측정은 책 비율에만 사용한다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /flex: 1 0 140px; min-height: 140px/);
  assert.match(source, /const next = \{ width: node.clientWidth, height: node.clientHeight \}/);
  assert.match(source, /observer.observe\(node\)/);
  assert.doesNotMatch(source, /description.offsetHeight|child.offsetHeight|carouselStageHeight|style=\{\{ height/);
  assert.doesNotMatch(source, /min-height: 76px|padding-left: 44px/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.doesNotMatch(home, /div:only-child/);
});

test("책만 전시 영역 중앙에 놓고 설명·쪽번호의 하단 배치를 유지한다", () => {
  for (const [width, stage] of [[350, 500], [350, 359], [280, 182], [280, 140]]) {
    const { bookHeight, spreadWidth } = carouselPreviewSize(width, stage);
    assert.ok((stage - bookHeight) / 2 >= 0, "중앙 배치한 책이 전시 영역을 벗어나지 않는다");
    assert.ok(Math.abs(spreadWidth / bookHeight - 296 / 210) < .001);
  }
  assert.ok(Math.abs(carouselPreviewSize(350, 500).spreadWidth - 472.5) < .001);
  assert.ok(carouselPreviewSize(350, 500).spreadWidth > 350, "가로는 잘려도 미리보기를 크게 보여준다");
  assert.equal(carouselPreviewSize(1000, 1000).spreadWidth, 640);
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /const Slide = styled.div[^`]*`position: absolute; top: 50%; left: 50%/);
  assert.match(source, /translate\(-50%, -50%\)/);
  assert.match(source, /top: calc\(50% \+ var\(--carousel-book-half-height\) - 6px\)/);
  assert.doesNotMatch(source, /carouselBookCenter|--carousel-book-center/);
  assert.match(source, /<\/Stage>\s*<Details>/);
  assert.match(source, /const Controls = styled.nav`[^`]*margin-top: 24px/);
});

test("잘린 미리보기는 실제 보이는 양끝에서 이동하고 중앙에서는 책을 연다", () => {
  for (const scale of [1, .5]) {
    const visible = carouselVisibleTapBounds({ left: -60 * scale, width: 470 * scale }, { left: 0, width: 350 * scale });
    assert.deepEqual(visible, { left: 0, width: 350 * scale });
    assert.equal(carouselTapDirection(35 * scale, visible), -1);
    assert.equal(carouselTapDirection(315 * scale, visible), 1);
    assert.equal(carouselTapDirection(175 * scale, visible), 0);
    assert.equal(carouselTapDirection(0, visible, true), 0);
  }
  assert.deepEqual(carouselVisibleTapBounds({ left: 100, width: 200 }, { left: 0, width: 250 }), { left: 100, width: 150 });
  assert.equal(carouselVisibleTapBounds({ left: 400, width: 100 }, { left: 0, width: 350 }).width, 0);
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

test("옮겨진 미리보기의 투명한 바깥 영역은 옆 책 클릭을 가로채지 않는다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const slide = source.match(/<Slide key=\{book.id\}([\s\S]*?)<CoverButton/)![1];
  assert.match(slide, /pointerEvents: "none"/);
  const button = source.match(/<CoverButton[^\n]+/)![0];
  assert.match(button, /pointerEvents: pose.opacity > \.1 \? "auto" : "none"/);
  assert.match(source, /if \(!selected\) \{ choose\(bookIndex\); return; \}/);
});

test("좌우 잘림만 배경색으로 페이드하고 책 클릭과 키보드 포커스는 가리지 않는다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const stage = source.match(/const Stage = styled.div[^`]*`([\s\S]*?)`;/)![1];
  const fade = stage.match(/&::before \{([\s\S]*?)\n  \}/)![1];
  assert.match(stage, /--carousel-edge-fade: clamp\(12px, 4%, 20px\)/);
  assert.match(fade, /position: absolute; inset: 0; z-index: 200; pointer-events: none/);
  assert.match(fade, /linear-gradient\(to right, var\(--library-background, var\(--color-surface\)\)/);
  assert.match(fade, /transparent var\(--carousel-edge-fade\), transparent calc\(100% - var\(--carousel-edge-fade\)\)/);
  assert.doesNotMatch(fade, /blur|opacity/);
  assert.match(stage, /&:focus-visible::before \{ background: none; \}/);
  assert.match(source, /<\/Stage>\s*<Details>/, "설명과 쪽 이동은 페이드 영역 바깥에 남는다");
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
  assert.equal(carouselSwipeDirection(-27, 350, 500), 1);
  assert.equal(carouselSwipeDirection(27, 350, 500), -1);
  assert.equal(carouselSwipeDirection(-19, 350, 500), 0);
  assert.equal(carouselDragProgress(-40, 350, 2, 5), carouselDragProgress(-20, 175, 2, 5));
  assert.ok(Math.abs(carouselDragProgress(60, 350, 0, 5)) < .4);
  assert.ok(Math.abs(carouselDragProgress(-60, 350, 4, 5)) < .4);
  assert.equal(carouselIndex(["new", "a", "b"], { id: "b", index: 1 }), 2);
  assert.equal(carouselIndex(["a", "b"], { id: "next-page", index: 2 }), 1);
  assert.equal(carouselIndex(["a", "b", "next-page"], { id: "next-page", index: 2 }), 2);
  assert.equal(carouselIndex([], { id: null, index: 8 }), 0);
});

test("양끝에서 계속 당기면 이동은 늘어나고 저항은 점점 커지며 단단한 정지점이 없다", () => {
  for (const count of [1, 5]) {
    let previous = 0, previousIncrement = Infinity;
    for (const dx of [0, 40, 80, 120, 160, 200, 240, 280, 320]) {
      const left = carouselDragProgress(dx, 350, 0, count);
      const right = carouselDragProgress(-dx, 350, count - 1, count);
      assert.equal(Math.abs(left), Math.abs(right));
      const distance = Math.abs(left);
      if (dx) {
        assert.ok(distance > previous, "더 끌면 계속 늘어난다");
        assert.ok(distance - previous < previousIncrement, "같은 거리의 추가 당김에는 저항이 증가한다");
        previousIncrement = distance - previous;
      }
      assert.ok(distance < .75, "과도하게 화면 밖으로 끌려가지 않는다");
      previous = distance;
      assert.equal(left, carouselDragProgress(dx / 2, 175, 0, count));
    }
  }
  assert.equal(carouselDragProgress(0, 350, 0, 5), 0, "놓고 드래그를 초기화하면 원점으로 복귀한다");
  const before = carouselDragProgress(-62.999, 350, 2, 5);
  const after = carouselDragProgress(-63.001, 350, 2, 5);
  assert.ok(Math.abs(after - before) < .001, "한 권 간격 경계에서도 위치가 연속적이다");
  assert.ok(carouselDragProgress(-120, 350, 2, 5) > carouselDragProgress(-80, 350, 2, 5));
});

test("아무리 당겨도 다다음 책이 앞서지 않고 초과 당김은 책 묶음의 위치만 바꾼다", () => {
  for (const direction of [-1, 1]) {
    for (const distance of [64, 120, 350, 3500]) {
      const drag = carouselDragProgress(-distance * direction, 350, 3, 7);
      const neighbor = carouselDraggedPose(direction, drag, 3, 7);
      const nextNeighbor = carouselDraggedPose(direction * 2, drag, 3, 7);
      assert.ok(neighbor.zIndex > nextNeighbor.zIndex);
      assert.ok(neighbor.scale > nextNeighbor.scale);
      assert.equal(neighbor.zIndex, 100);
      assert.equal(neighbor.scale, 1);
      const atLimit = carouselDraggedPose(direction, direction, 3, 7);
      assert.equal(neighbor.rotation, atLimit.rotation);
      assert.ok(direction * (neighbor.x - atLimit.x) < 0, "초과 당김은 순서 변경 대신 평행 이동한다");
    }
  }
  for (const [index, count, drag] of [[0, 7, -.7], [6, 7, .7], [0, 1, -.7], [0, 1, .7]]) {
    const pose = carouselDraggedPose(0, drag, index, count);
    assert.equal(pose.scale, 1);
    assert.equal(pose.zIndex, 100);
    assert.ok(Math.abs(pose.rotation) === 0, "양끝에서는 없는 책을 향해 순서를 바꾸지 않는다");
    assert.notEqual(pose.x, 0, "끝에서도 탄성 이동은 유지한다");
  }
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /carouselDraggedPose\(bookIndex - index, drag, index, books.length\)/);
});

test("드래그 중 현재 책은 앞에서 서서히 사라지고 옆 책이 선명해진다", () => {
  for (const direction of [-1, 1]) {
    let outgoing = 1, incoming = carouselPose(1).opacity;
    for (const progress of [.01, .2, .49, .5, .51, .8, .99, 1]) {
      const current = carouselDraggedPose(0, direction * progress, 3, 7);
      const next = carouselDraggedPose(direction, direction * progress, 3, 7);
      assert.ok(current.opacity < outgoing);
      assert.ok(next.opacity > incoming);
      if (progress < 1) assert.ok(current.zIndex > next.zIndex, "반쯤 끌어도 앞뒤가 갑자기 뒤집히지 않는다");
      else assert.equal(current.opacity, 0, "앞뒤 순서를 바꿀 때는 현재 책이 완전히 옅어진다");
      outgoing = current.opacity; incoming = next.opacity;
    }
  }
  for (const offset of [-1, 0, 1]) {
    assert.deepEqual(carouselDraggedPose(offset, 0, 3, 7), carouselPose(offset), "놓은 뒤의 정적 배치는 유지한다");
  }
  assert.equal(carouselDraggedPose(0, -.5, 0, 7).opacity, 1, "양끝의 탄성 당김에서는 책이 사라지지 않는다");
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.match(source, /opacity 560ms cubic-bezier/);
  assert.match(source, /z-index 560ms linear/);
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
  assert.match(home, /view === "carousel" && !search.searching \? <HarumadiCarousel/);
  assert.match(home, /useHarumadiSearch\(query.data\?\.pages\.flatMap/);
  assert.doesNotMatch(home, /onLoadMore=|fetchNextPage/);
  assert.match(home, /<Header><HeaderActions/);
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
  let cancels = 0;
  const pulls: number[] = [];
  const finish = new Function("gesture", "setDrag", "setDragging", "blockedClickUntil", "active", "carouselSwipeDirection", "move", "setWriteProgress", "pending", "loading", "carouselShouldWrite", "onCreateMadi", "onWriteCancel", `return (event, cancelled = false) => {${finishBody}}`)(gesture, () => {}, () => {}, blockedClickUntil, active, carouselSwipeDirection, (direction: number) => directions.push(direction), () => {}, false, false, carouselShouldWrite, (id: string) => writes.push(id), () => { cancels++; });
  const followBody = source.match(/const follow = .*?=> \{([\s\S]*?)\n  \};/)![1];
  const follow = new Function("gesture", "setDragging", "setDrag", "carouselDragProgress", "index", "books", "carouselGestureAxis", "onCreateMadi", "blockedClickUntil", "setWriteProgress", "carouselWriteProgress", "active", "onWriteDrag", `return event => {${followBody}}`)(gesture, () => {}, () => {}, carouselDragProgress, 0, [{}, {}], carouselGestureAxis, () => {}, blockedClickUntil, () => {}, carouselWriteProgress, active, (_book: unknown, distance: number) => pulls.push(distance));
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
  follow({ ...event, clientX: 200, clientY: 130 });
  assert.deepEqual(pulls, [30], "손을 놓기 전부터 이동 거리를 작성 화면에 전달한다");
  assert.deepEqual(writes, []);
  lost({ ...event, target: {} });
  finish({ ...event, clientX: 200, clientY: 180, timeStamp: 300 });
  assert.deepEqual(writes, ["book"]);
  reset();
  follow({ ...event, clientX: 200, clientY: 130 });
  finish({ ...event, clientX: 200, clientY: 180 }, true);
  reset();
  follow({ ...event, clientX: 200, clientY: 130 });
  finish({ ...event, clientX: 200, clientY: 105, timeStamp: 600 });
  reset();
  follow({ ...event, clientX: 200, clientY: 130 });
  active.id = "changed";
  finish({ ...event, clientX: 200, clientY: 180 });
  active.id = "book";
  assert.deepEqual(writes, ["book"], "취소나 선택 변경은 작성 화면을 열지 않는다");
  assert.equal(cancels, 3, "캡처 취소·짧은 이동·선택 변경은 미리보기를 되돌린다");
  reset();
  follow(event); // 좌우 축을 먼저 선택한 뒤 크게 내려도 작성하지 않는다.
  finish({ ...event, clientY: 220, timeStamp: 300 });
  assert.deepEqual(writes, ["book"]);
  reset();
  follow({ ...event, clientX: 200, clientY: 70 });
  finish({ ...event, clientX: 200, clientY: 20, timeStamp: 300 });
  assert.deepEqual(writes, ["book"], "위로 올리기는 작성 동작이 아니다");
  assert.equal(gesture.current, null);
});

test("아래로 쓰기는 충분한 거리·빠른 의도에만 반응하고 반대 방향과 미세 이동은 무시한다", () => {
  assert.equal(carouselGestureAxis(3, -4, true), null);
  assert.equal(carouselGestureAxis(30, -10, true), "horizontal");
  assert.equal(carouselGestureAxis(5, 30, true), "down");
  assert.equal(carouselGestureAxis(5, -30, true), "scroll");
  assert.equal(carouselGestureAxis(5, 30, false), "scroll");
  assert.equal(carouselShouldWrite(10, 320, 5), false);
  assert.equal(carouselShouldWrite(30, 320, 400), false);
  assert.equal(carouselShouldWrite(30, 320, 40), true);
  assert.equal(carouselShouldWrite(70, 320, 600), true);
  assert.equal(carouselShouldWrite(-70, 320, 40), false);
  assert.equal(carouselWriteProgress(40, 320), carouselWriteProgress(20, 160));
  assert.equal(carouselWriteProgress(-40, 320), 0);
  assert.equal(carouselWriteProgress(200, 320), 1);
  assert.equal(carouselGestureAxis(25, 25, true), null, "애매한 대각선에서는 아직 의도를 확정하지 않는다");
});

test("아래로 쓰기 안내는 버튼으로도 실행할 수 있고 현재 책의 기존 작성 경로를 사용한다", () => {
  const client = new QueryClient();
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiCarousel, {
      books: [harumadiContent().harumadi], ownerId: "owner", onOpen() {}, onCreateMadi() {},
    })));
    assert.match(html, /이 하루마디에 남기기/);
    assert.match(html, /aria-description="아래로 내려도 이 하루마디에 남길 수 있어요\."/);
    assert.match(html, /lucide-chevron-down/);
    assert.doesNotMatch(html, /lucide-chevron-up/);
    assert.match(html, /touch-action:pinch-zoom/);
    assert.match(html, /aria-label="[^"]+, 이 하루마디에 남기기"/);
    const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
    assert.match(home, /router.push\(`\/madi\/new\?from=library&harumadiId=\$\{encodeURIComponent\(bookId\)\}&cancelTo=library/);
    assert.match(home, /onWriteDrag=\{composePull.drag\} onWriteCancel=\{composePull.cancel\}/);
    assert.match(home, /composePull.open\(book\)/);
    const source = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
    assert.match(source, /harumadiId/);
  } finally { client.clear(); }
});
