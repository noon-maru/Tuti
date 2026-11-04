import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { animateHarumadiSpreadOpen, scheduleHarumadiOpen } from "@/lib/harumadiOpen";
import { HarumadiOpenTransition } from "@/features/tuti/components/HarumadiOpenTransition";
import { harumadiContent } from "./fixtures/harumadiContent";

function animatedNode() {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions; resolve: () => void; cancelled: boolean }[] = [];
  const element = { animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void;
    const finished = new Promise<void>(done => { resolve = done; });
    const call = { frames, options, resolve, cancelled: false }; calls.push(call);
    return { finished, cancel() { call.cancelled = true; } };
  } } as unknown as HTMLElement;
  return { element, calls };
}
const origin = { x: 40, y: 160, width: 280, height: 200, appearance: "spread" as const };
const target = { x: 20, y: 80, width: 560, height: 400 };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("부모 DOM ref가 연결된 다음 프레임에 확대를 시작하고 언마운트 시 예약과 동작을 취소한다", () => {
  let frame: FrameRequestCallback | undefined, cancelledFrame = 0, started = 0, stopped = 0;
  const parent = { current: null as HTMLElement | null };
  const host = { requestAnimationFrame(callback: FrameRequestCallback) { frame = callback; return 7; }, cancelAnimationFrame(id: number) { cancelledFrame = id; frame = undefined; } };
  const start = () => { assert.ok(parent.current); started++; return () => { stopped++; }; };
  const cancel = scheduleHarumadiOpen(host, start);
  assert.equal(started, 0);
  parent.current = {} as HTMLElement;
  frame!(0); assert.equal(started, 1);
  cancel(); assert.equal(cancelledFrame, 7); assert.equal(stopped, 1);
  const cancelBeforeLayout = scheduleHarumadiOpen(host, start);
  cancelBeforeLayout(); frame?.(0);
  assert.equal(started, 1); assert.equal(stopped, 1);
  const source = readFileSync("src/features/tuti/components/HarumadiOpenTransition.tsx", "utf8");
  assert.match(source, /useLayoutEffect\(\(\) => scheduleHarumadiOpen\(window/);
});

test("펼친 미리보기는 같은 비율로 확대하고 회전 없이 읽기로 연결한다", async () => {
  const book = animatedNode(), contents = animatedNode(); let completed = 0;
  const cancel = animateHarumadiSpreadOpen(book.element, contents.element, origin, target, () => { completed++; });
  assert.match(String(book.calls[0].frames[0].transform), /translate\(20px, 80px\) scale\(0\.5, 0\.5\)/);
  assert.equal(book.calls[0].frames[0].opacity, 1);
  assert.equal(book.calls[0].options.duration, 820);
  assert.doesNotMatch(JSON.stringify(book.calls), /rotateY/);
  assert.equal(contents.calls[0].options.delay, 580);
  book.calls[0].resolve(); await flush(); assert.equal(completed, 1);
  cancel(); assert.ok([...book.calls, ...contents.calls].every(call => call.cancelled));
});

test("확대 취소와 동작 줄이기를 처리하고 완료는 한 번만 호출한다", async () => {
  const book = animatedNode(); let completed = 0;
  const cancel = animateHarumadiSpreadOpen(book.element, null, origin, target, () => { completed++; });
  cancel(); book.calls[0].resolve(); await flush(); assert.equal(completed, 0);
  const reduced = animatedNode();
  animateHarumadiSpreadOpen(reduced.element, null, origin, target, () => { completed++; }, true);
  assert.equal(completed, 1); assert.equal(reduced.calls.length, 0);
  animateHarumadiSpreadOpen({} as HTMLElement, null, origin, target, () => { completed++; });
  assert.equal(completed, 2);
});

test("확대에는 같은 두 속지만 사용하며 표지나 펼침을 다시 재생하지 않는다", () => {
  const { harumadi: book, entries } = harumadiContent();
  const html = renderToStaticMarkup(createElement(HarumadiOpenTransition, { book, entries, origin,
    containerRef: { current: null }, contentsRef: { current: null }, onComplete() {} }));
  assert.match(html, /data-spread-still="true"/);
  assert.match(html, /data-harumadi-page="text"/);
  assert.doesNotMatch(html, /data-spread-turning-cover|data-harumadi-page="cover"/);
  const source = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(source, /data-harumadi-spread-preview.*data-spread-ready/);
  assert.match(source, /appearance: "spread"/);
});
