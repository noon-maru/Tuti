import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { animateHarumadiOpen } from "@/lib/harumadiOpen";
import { harumadiLocalRect } from "@/shared/harumadi/transitionGeometry";
import { HarumadiOpenTransition } from "@/features/tuti/components/HarumadiOpenTransition";
import { HarumadiCloseTransition } from "@/features/tuti/components/HarumadiCloseTransition";
import { HarumadiPageSheet } from "@/features/tuti/components/HarumadiSheet";
import { buildHarumadiCoverPage } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_COVER_STYLES } from "@/shared/api/harumadiPdf";
import { harumadiContent } from "./fixtures/harumadiContent";

function node() {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions; resolve: () => void; reject: () => void; cancelled: boolean }[] = [];
  const element = { animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void, reject!: () => void;
    const finished = new Promise<void>((yes, no) => { resolve = yes; reject = () => no(new Error("cancelled")); });
    const call = { frames, options, resolve, reject, cancelled: false }; calls.push(call);
    return { finished, cancel() { call.cancelled = true; } };
  } } as unknown as HTMLElement;
  return { element, calls };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const origin = { x: 20, y: 120, width: 140, height: 200 };
const target = { x: 40, y: 80, width: 280, height: 400 };

test("실제 표지는 책장 위치에서 확대된 뒤 기존 방향으로 펼쳐지고 한 번만 완료한다", async () => {
  const book = node(), cover = node(), contents = node(); let completed = 0;
  const cancel = animateHarumadiOpen(book.element, cover.element, contents.element, origin, target, () => { completed++; });
  assert.match(String(book.calls[0].frames[0].transform), /translate\(-20px, 40px\) scale\(0\.5, 0\.5\)/);
  assert.equal(book.calls[0].options.duration, 520);
  assert.match(String(cover.calls[0].frames[0].transform), /rotateY\(0deg\)/);
  assert.match(String(cover.calls[0].frames.at(-1)?.transform), /rotateY\(-105deg\)/);
  assert.equal(cover.calls[0].options.duration, 680);
  assert.equal(cover.calls[0].options.delay, 160);
  assert.equal(contents.calls[0].options.delay, 340);
  assert.equal(completed, 0);
  cover.calls[0].resolve(); await flush(); assert.equal(completed, 1);
  cancel(); assert.ok([...book.calls, ...cover.calls, ...contents.calls].every(call => call.cancelled));
});

test("펼치기 취소·애니메이션 실패·동작 줄이기는 읽기 화면 진입을 막지 않는다", async () => {
  const book = node(), cover = node(); let completed = 0;
  const cancel = animateHarumadiOpen(book.element, cover.element, null, origin, target, () => { completed++; });
  cancel(); cover.calls[0].resolve(); await flush(); assert.equal(completed, 0);
  const reduced = node();
  animateHarumadiOpen(reduced.element, reduced.element, null, origin, target, () => { completed++; }, true);
  assert.equal(reduced.calls.length, 0); assert.equal(completed, 1);
  animateHarumadiOpen({} as HTMLElement, {} as HTMLElement, null, origin, target, () => { completed++; });
  assert.equal(completed, 2);
  const failed = node();
  animateHarumadiOpen(book.element, failed.element, null, origin, target, () => { completed++; });
  failed.calls[0].reject(); await flush(); assert.equal(completed, 3);
});

test("책장·펼치기·덮기의 좌표는 PC 목업 배율을 두 번 적용하지 않는다", () => {
  const expected = { x: 40, y: 80, width: 280, height: 400 };
  for (const scale of [1, .8, .65]) {
    const actual = harumadiLocalRect({ left: 100, top: 50, width: 400 * scale, height: 800 * scale },
      { left: 100 + 40 * scale, top: 50 + 80 * scale, width: 280 * scale, height: 400 * scale }, 400, 800);
    for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(actual[key] - expected[key]) < .001);
  }
});

test("펼칠 때와 덮을 때는 실제 앞표지와 같은 날짜·제목·색상·지면을 사용한다", () => {
  const { harumadi, entries } = harumadiContent();
  for (const coverStyle of HARUMADI_PDF_COVER_STYLES) {
    const book = { ...harumadi, coverStyle, title: "내가 남긴 하루" };
    const props = { book, entries, containerRef: { current: null }, contentsRef: { current: null }, onComplete() {} };
    const actual = renderToStaticMarkup(createElement(HarumadiPageSheet, { page: buildHarumadiCoverPage(book, entries), coverStyle, number: 0 }));
    for (const html of [renderToStaticMarkup(createElement(HarumadiOpenTransition, { ...props, origin })),
      renderToStaticMarkup(createElement(HarumadiCloseTransition, props))]) {
      assert.ok(html.includes(actual));
      assert.match(html, /2026\.10\.26/);
      assert.doesNotMatch(html, /Tuti \/ 하루마디|data-cover-preview/);
    }
  }
});

test("읽기 권한을 확인한 본문으로 펼치며 표지 전용 조회나 로딩 중 추정 표지는 사용하지 않는다", () => {
  const transition = readFileSync("src/features/tuti/components/HarumadiOpenTransition.tsx", "utf8");
  assert.match(transition, /buildHarumadiCoverPage\(book, entries\)/);
  assert.match(transition, /<HarumadiPageSheet/);
  assert.doesNotMatch(transition, /\bHarumadiCover\b|fetchLibraryCover|useQuery/);
  const reader = readFileSync("src/features/tuti/components/HarumadiBookReader.tsx", "utf8");
  assert.doesNotMatch(reader, /HarumadiCover|fetchLibraryCover/);
  assert.match(reader, /openingOrigin=\{opening.mode === "pages" \? opening.origin : undefined\}/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /if \(id && !readable\)/);
  assert.match(flow, /!openingDone && mode === "pages" && !closing && harumadi && <HarumadiOpenTransition book=\{harumadi\} entries=\{chosen\}/);
});
