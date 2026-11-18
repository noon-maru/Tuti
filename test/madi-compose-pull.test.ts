import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { madiComposePullOffset, settleMadiComposePull } from "@/lib/madiComposePull";
import { MadiComposePullPreview } from "@/features/tuti/components/MadiComposePullPreview";
import type { useMadiComposePull } from "@/features/tuti/hooks/useMadiComposePull";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { harumadiContent } from "./fixtures/harumadiContent";

test("작성 화면은 당긴 거리만큼 따라오며 PC 목업 배율도 보정한다", () => {
  assert.equal(madiComposePullOffset(80, 800, 800), 80);
  assert.equal(madiComposePullOffset(80, 400, 800), 160);
  assert.equal(madiComposePullOffset(-20, 800, 800), 0);
  assert.equal(madiComposePullOffset(1200, 800, 800), 800);
});

test("현재 드래그 위치에서 확정·취소로 이어가며 취소된 애니메이션은 이동하지 않는다", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => ({ transform: "matrix(1, 0, 0, 1, 0, -700)" }) });
  let complete = 0, cancelled = 0;
  const animations: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions; resolve: () => void }> = [];
  const node = { animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void;
    const finished = new Promise<void>(done => { resolve = done; });
    animations.push({ frames, options, resolve });
    return { finished, cancel() { cancelled++; resolve(); } };
  } } as unknown as HTMLElement;
  try {
    const cancel = settleMadiComposePull(node, true, () => { complete++; });
    assert.equal(animations[0].frames[0].transform, "matrix(1, 0, 0, 1, 0, -700)");
    assert.equal(animations[0].frames[1].transform, "translateY(0)");
    assert.equal(animations[0].options.duration, 320);
    cancel(); await Promise.resolve();
    assert.equal(cancelled, 1); assert.equal(complete, 0);
    settleMadiComposePull(node, false, () => { complete++; });
    assert.equal(animations[1].frames[1].transform, "translateY(-100%)");
    assert.equal(animations[1].options.duration, 220);
    animations[1].resolve(); await Promise.resolve();
    assert.equal(complete, 1);
    settleMadiComposePull(node, true, () => { complete++; }, true);
    assert.equal(animations.length, 2, "동작 줄이기는 마무리 애니메이션을 생략한다");
    assert.equal(complete, 2);
    settleMadiComposePull(null, true, () => { complete++; });
    assert.equal(complete, 3);
  } finally {
    if (previous) Object.defineProperty(globalThis, "getComputedStyle", previous);
    else Reflect.deleteProperty(globalThis, "getComputedStyle");
  }
});

function harness() {
  const commits: string[] = [];
  const frames = new Map<number, () => void>();
  let frameId = 0;
  const animations: Array<{ opening: boolean; done: () => void; cancelled: boolean }> = [];
  const page = clientFlowHarness("src/features/tuti/hooks/useMadiComposePull.ts", "useMadiComposePull", {
    "@/lib/madiComposePull": { madiComposePullOffset, settleMadiComposePull(_node: unknown, opening: boolean, done: () => void) {
      const animation = { opening, done: () => { if (!animation.cancelled) done(); }, cancelled: false };
      animations.push(animation); return () => { animation.cancelled = true; };
    } },
  }, { window: {
    requestAnimationFrame(callback: () => void) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    matchMedia: () => ({ matches: false }),
  } });
  const props = { containerRef: { current: { clientHeight: 800, getBoundingClientRect: () => ({ height: 400 }) } }, onCommit: (id: string) => commits.push(id) };
  const render = () => page.render(props) as unknown as ReturnType<typeof useMadiComposePull>;
  render(); page.effects();
  return { ...page, render, commits, animations, frames, flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(run => run()); } };
}

test("손을 놓기 전에는 이동하지 않고 짧게 당긴 뒤 취소하면 책장에 남는다", () => {
  const page = harness(), book = harumadiContent().harumadi;
  try {
    page.render().drag(book, 50);
    assert.equal(page.render().preview?.offset, 100);
    page.render().drag(book, 25);
    assert.equal(page.render().preview?.offset, 50, "되돌리는 손가락도 따라간다");
    assert.deepEqual(page.commits, []);
    page.render().cancel();
    assert.equal(page.render().preview?.settling, true);
    page.flush(); assert.equal(page.animations[0].opening, false);
    page.animations[0].done();
    assert.equal(page.render().preview, null);
    assert.deepEqual(page.commits, []);
  } finally { page.dispose(); }
});

test("진입 확정은 남은 화면 이동이 끝난 뒤 한 번만 실제 작성 경로를 연다", () => {
  const page = harness(), book = harumadiContent().harumadi;
  try {
    page.render().drag(book, 100); page.render().open(book);
    page.render().open(book);
    assert.deepEqual(page.commits, []);
    assert.equal(page.frames.size, 1);
    page.flush(); assert.equal(page.animations[0].opening, true);
    page.animations[0].done();
    assert.deepEqual(page.commits, [book.id]);
    assert.ok(page.render().preview, "경로가 준비되는 동안 내려온 화면을 유지한다");
  } finally { page.dispose(); }
});

test("버튼 진입도 DOM 연결을 기다리고 도중 이탈·취소는 늦은 화면 이동을 막는다", () => {
  const page = harness(), book = harumadiContent().harumadi;
  page.render().open(book);
  assert.equal(page.render().preview?.offset, 0);
  page.flush(); page.render().cancel(); page.flush();
  page.animations[0].done(); assert.deepEqual(page.commits, []);
  page.dispose(); page.animations[1].done();
  assert.deepEqual(page.commits, []);
  const queued = harness();
  queued.render().open(book); queued.dispose();
  assert.equal(queued.frames.size, 0);
  queued.flush(); assert.deepEqual(queued.commits, []);
});

test("드래그 중에는 실제 작성 UI를 읽기 전용으로 보여주며 별도 진입 효과는 없다", () => {
  const book = { ...harumadiContent().harumadi, title: "우리의 작은 하루" };
  const html = renderToStaticMarkup(createElement(MadiComposePullPreview, {
    preview: { book, offset: 80, settling: false }, layerRef: { current: null },
  }));
  assert.match(html, /inert=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /translateY\(calc\(-100% \+ 80px\)\)/);
  assert.match(html, /pointer-events:none/);
  assert.match(html, /우리의 작은 하루/);
  assert.doesNotMatch(html, /420ms|enterFromTop/);
});
