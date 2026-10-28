import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { animateHarumadiClose } from "@/lib/harumadiClose";

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

test("책을 덮고 정리하는 두 단계가 모두 끝난 뒤 한 번만 홈으로 복귀한다", async () => {
  const cover = node(), contents = node(); let completed = 0;
  const cancel = animateHarumadiClose(cover.element, contents.element, () => { completed++; });
  assert.equal(completed, 0);
  assert.match(String(cover.calls[0].frames[0].transform), /rotateY\(-100deg\)/);
  assert.match(String(cover.calls[0].frames.at(-1)?.transform), /rotateY\(0deg\)/);
  assert.equal(contents.calls.length, 1);
  cover.calls[0].resolve(); await flush();
  assert.equal(cover.calls.length, 2); assert.equal(completed, 0);
  assert.match(String(cover.calls[1].frames.at(-1)?.transform), /scale\(\.94\)/);
  cover.calls[1].resolve(); await flush();
  assert.equal(completed, 1);
  cancel(); assert.ok(cover.calls.every(call => call.cancelled));
});

test("이탈 중에는 예약된 화면 전환을 취소하고 동작 줄이기·지원하지 않는 환경도 닫을 수 있다", async () => {
  const cover = node(); let completed = 0;
  const cancel = animateHarumadiClose(cover.element, null, () => { completed++; });
  cancel(); cover.calls[0].resolve(); await flush();
  assert.equal(completed, 0); assert.equal(cover.calls.length, 1);
  const reduced = node();
  animateHarumadiClose(reduced.element, null, () => { completed++; }, true);
  assert.equal(completed, 1); assert.equal(reduced.calls.length, 0);
  animateHarumadiClose({} as HTMLElement, null, () => { completed++; });
  assert.equal(completed, 2);
  const failed = node();
  animateHarumadiClose(failed.element, null, () => { completed++; });
  failed.calls[0].reject(); await flush();
  assert.equal(completed, 3, "애니메이션 실패가 책장 복귀를 막지 않는다");
});

test("마지막 쪽의 덮기·내 책장은 동일한 닫기 동작과 홈 복귀를 사용한다", () => {
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(viewer, /lastPage \? "덮기" : "다음 쪽"/);
  assert.match(viewer, /if \(next >= pages.length\) \{ onClose\(\); return; \}/);
  assert.match(viewer, /disabled=\{closing \|\| Boolean\(retained\)\} onClick=\{\(\) => turn\(current \+ 1\)\}/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /onClose=\{closeToLibrary\} closing=\{closing\}/);
  assert.match(flow, /else closeToLibrary\(\)/);
  assert.match(flow, /if \(busy \|\| closingRef.current\) return/);
  assert.match(flow, /inert=\{closing\}/);
  assert.match(flow, /if \(onClose\) onClose\(\); else router.replace\("\/"\)/);
  assert.match(flow, /onComplete=\{finishClose\}/);
});
