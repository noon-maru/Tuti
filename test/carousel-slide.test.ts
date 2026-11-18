import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { waitForCarouselSlide } from "@/lib/carouselSlide";

test("펼친 지면을 좌우 전환 560ms 동안 유지하고 동작 줄이기는 즉시 완료한다", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let completed = false;
  const pending = waitForCarouselSlide(new AbortController().signal).then(value => { completed = true; return value; });
  t.mock.timers.tick(559); await Promise.resolve(); assert.equal(completed, false);
  t.mock.timers.tick(1); assert.equal(await pending, true);
  assert.equal(await waitForCarouselSlide(new AbortController().signal, true), true);
});

test("계정 전환·언마운트 시 전환 대기를 취소한다", async () => {
  const controller = new AbortController();
  const pending = waitForCarouselSlide(controller.signal);
  controller.abort();
  assert.equal(await pending, false);
  assert.equal(await waitForCarouselSlide(controller.signal), false);
});

test("옆 책 이동은 접기를 호출하지 않고 펼친 지면·중복 이동 잠금을 유지한다", async () => {
  const source = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.doesNotMatch(source, /foldCarouselBook|carouselBookFold|animateHarumadiPaperFlex/);
  const body = source.match(/const transitionTo = async .*?=> \{([\s\S]*?)\n  \};/)![1];
  let resolve!: (value: boolean) => void;
  const pending = new Promise<boolean>(done => { resolve = done; });
  const turning = { current: null }, lifetime = { current: new AbortController() };
  const changes: unknown[] = [], states: boolean[] = [], outgoing: (string | null)[] = [];
  const handler = ts.transpileModule(`const run = async (next: { id: string; index: number }) => {${body}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const choose = new Function("turning", "lifetime", "active", "setSliding", "window", "waitForCarouselSlide", "setSelection", "setOutgoingId", `${handler}; return run;`)(
    turning, lifetime, { id: "current" }, (value: boolean) => states.push(value), {}, () => pending, (value: unknown) => changes.push(value), (value: string | null) => outgoing.push(value));
  const next = { id: "next", index: 1 };
  const transition = choose(next);
  await choose({ id: "third", index: 2 });
  assert.deepEqual(changes, [next]); assert.deepEqual(states, [true]);
  assert.deepEqual(outgoing, ["current"]);
  resolve(true); await transition;
  assert.deepEqual(states, [true, false]); assert.deepEqual(outgoing, ["current", null]);
  assert.equal(turning.current, null);
  lifetime.current.abort(); await choose({ id: "unmounted", index: 3 });
  assert.deepEqual(changes, [next]);
  assert.match(source, /selected \|\| book.id === outgoingId/);
  assert.match(source, /await transitionTo\(\{ id, index: index \+ 1 \}\)/);
});
