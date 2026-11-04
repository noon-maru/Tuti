import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { foldCarouselBook } from "@/lib/carouselBookFold";

function scene() {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions; resolve: () => void; cancelled: boolean }[] = [];
  const node = (transform: string, opacity = "1") => ({ transform, opacity, animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void;
    const finished = new Promise<void>(done => { resolve = done; });
    const call = { frames, options, resolve, cancelled: false }; calls.push(call);
    return { finished, cancel() { call.cancelled = true; } };
  } });
  const left = node("rotateY(45deg)"), cover = node("rotateY(-135deg)", "0.4");
  const spread = Object.assign(node("translateX(-10%)"), {
    dataset: { spreadReady: "true" }, querySelector: (selector: string) => selector.includes("leaf") ? left : cover,
  });
  return { calls, spread: spread as unknown as HTMLElement };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function styles(t: TestContext) {
  t.mock.method(globalThis, "getComputedStyle", (element: Element) => element as unknown as CSSStyleDeclaration);
}

test("현재 펼침 각도부터 왼쪽 지면과 표지를 접고 모든 동작이 끝날 때 완료한다", async t => {
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, writable: true, value: (node: unknown) => node });
  styles(t);
  const { calls, spread } = scene();
  let done = false;
  const folding = foldCarouselBook(spread, new AbortController().signal).then(value => { done = true; return value; });
  assert.equal(calls.length, 3); assert.equal(done, false);
  assert.equal(calls[0].frames[0].transform, "translateX(-10%)");
  assert.equal(calls[0].frames[1].transform, "translateX(-25%)");
  assert.equal(calls[1].frames[0].transform, "rotateY(45deg)");
  assert.equal(calls[1].frames[1].transform, "rotateY(173deg)");
  assert.equal(calls[2].frames[0].opacity, "0.4");
  assert.equal(calls[2].frames.at(-1)?.transform, "rotateY(0deg)");
  for (const call of calls) { assert.equal(call.options.duration, 420); assert.equal(call.options.fill, "forwards"); }
  calls[0].resolve(); calls[1].resolve(); await flush(); assert.equal(done, false);
  calls[2].resolve(); assert.equal(await folding, true);
});

test("언마운트·계정 전환 시 접기를 취소하고 선택 이동을 완료하지 않는다", async () => {
  const { calls, spread } = scene(), controller = new AbortController();
  const folding = foldCarouselBook(spread, controller.signal);
  controller.abort();
  assert.equal(await folding, false);
  assert.ok(calls.every(call => call.cancelled));
  calls.forEach(call => call.resolve()); await flush();
  assert.equal(await foldCarouselBook(spread, controller.signal), false);
});

test("동작 줄이기·준비 중·미지원 환경에서는 이동을 기다리게 하지 않는다", async () => {
  const { calls, spread } = scene();
  assert.equal(await foldCarouselBook(spread, new AbortController().signal, true), true);
  spread.dataset.spreadReady = "false";
  assert.equal(await foldCarouselBook(spread, new AbortController().signal), true);
  assert.equal(calls.length, 0);
  assert.equal(await foldCarouselBook(null, new AbortController().signal), true);
  spread.dataset.spreadReady = "true";
  spread.animate = () => { throw new Error("unsupported"); };
  assert.equal(await foldCarouselBook(spread, new AbortController().signal), true);
});

test("옆 책 이동과 접기는 함께 시작하고 떠나는 지면은 완료까지 유지한다", async () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  const body = source.match(/const transitionTo = async .*?=> \{([\s\S]*?)\n  \};/)![1];
  let resolve!: (value: boolean) => void;
  const pending = new Promise<boolean>(done => { resolve = done; });
  let result = pending;
  const turning = { current: null }, lifetime = { current: new AbortController() }, changes: unknown[] = [], states: boolean[] = [], outgoing: (string | null)[] = [];
  const handler = ts.transpileModule(`const run = async (next: { id: string; index: number }) => {${body}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const choose = new Function("turning", "lifetime", "active", "setFolding", "stage", "window", "foldCarouselBook", "setSelection", "setOutgoingId", `${handler}; return run;`)(
    turning, lifetime, { id: "current" }, (value: boolean) => states.push(value), { current: { querySelector: () => null } }, {}, () => result, (value: unknown) => changes.push(value), (value: string | null) => outgoing.push(value));
  const next = { id: "next", index: 1 };
  const transition = choose(next);
  await choose({ id: "third", index: 2 });
  assert.deepEqual(changes, [next], "접기를 기다리지 않고 이동한다"); assert.deepEqual(states, [true]);
  assert.deepEqual(outgoing, ["current"], "이동하는 동안 기존 지면을 제거하지 않는다");
  resolve(true); await transition;
  assert.deepEqual(changes, [next]); assert.deepEqual(states, [true, false]);
  assert.deepEqual(outgoing, ["current", null]);
  assert.equal(turning.current, null);
  result = Promise.resolve(false);
  const interrupted = { id: "interrupted", index: 2 };
  await choose(interrupted);
  assert.deepEqual(changes, [next, interrupted], "접기만 중단되어도 이미 시작한 이동은 유지한다");
  await choose({ id: "current", index: 0 });
  lifetime.current.abort();
  await choose({ id: "unmounted", index: 3 });
  assert.deepEqual(changes, [next, interrupted]);
  assert.deepEqual(states, [true, false, true, false]);
  assert.match(source, /await transitionTo\(\{ id, index: index \+ 1 \}\)/);
  assert.match(source, /selected \|\| book.id === outgoingId/);
  assert.match(source, /Math.abs\(bookIndex - index\) <= 3 \|\| book.id === outgoingId/);
});
