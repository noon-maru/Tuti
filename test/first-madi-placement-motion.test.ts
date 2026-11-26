import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_MADI_HANDOFF_MS, FIRST_MADI_PLACEMENT_MS, animateFirstMadiAssembly, animateFirstMadiGuidance, animateFirstMadiPlacement, firstMadiOrigins, firstMadiPageOrigin } from "../src/features/tuti/lib/firstMadiPlacementMotion";

function bounds(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

test("첫 마디 연출은 보이는 작성 필드의 위치만 기억한다", () => {
  const node = (rect: ReturnType<typeof bounds>) => ({ getBoundingClientRect: () => rect });
  const viewport = { ...node(bounds(20, 80, 320, 390)), querySelectorAll: (selector: string) => {
    if (selector.includes('"title"')) return [node(bounds(20, 0, 0, 0)), node(bounds(46, 110, 290, 44))];
    if (selector.includes('"photo"')) return [node(bounds(20, -60, 300, 220))];
    if (selector.includes('"pets"')) return [node(bounds(30, 510, 290, 40))];
    return [];
  } } as unknown as HTMLElement;
  assert.deepEqual(firstMadiOrigins(viewport), {
    photo: { x: 0, y: 0, width: 300 }, title: { x: 26, y: 30, width: 290 },
  });
});

test("마디 조립과 축소·책 펼치기·삽입은 별개의 연출로 실행된다", () => {
  const calls = new Map<string, { frames: Keyframe[]; timing: KeyframeAnimationOptions }>();
  let cancellations = 0;
  const element = (name: string) => ({ getBoundingClientRect: () => bounds(180, 110, name === "page" ? 160 : 120, 48),
    animate: (frames: Keyframe[], timing: KeyframeAnimationOptions) => {
      assert.equal(calls.has(name), false, `${name} should have only one motion`);
      calls.set(name, { frames, timing });
      return { cancel: () => { cancellations++; } };
    } });
  const fields = ["photo", "title", "content", "date", "place", "pets"];
  const page = { ...element("page"), querySelector: (selector: string) => selector === "article" ? element("paper") :
    element(fields.find(field => selector.includes(`"${field}"`))!) };
  const scene = { querySelector: (selector: string) => selector === "[data-placement-page]" ? page :
    element(selector === "[data-placement-binding]" ? "binding" : "cover") } as unknown as HTMLElement;
  const viewport = { getBoundingClientRect: () => bounds(20, 80, 320, 390), querySelector: () => element("rename") } as unknown as HTMLElement;
  const cancelAssembly = animateFirstMadiAssembly(scene, viewport, { photo: { x: 26, y: 70, width: 144 } });
  assert.ok(fields.every(field => calls.has(field)));
  assert.equal(calls.get("photo")!.frames[0].transform, "translate(-134px, 40px) scale(1.2)");
  assert.equal(calls.has("binding"), false);
  const lastAssemblyFrame = Math.max(...[...fields, "paper"].map(name => {
    const { timing } = calls.get(name)!;
    return Number(timing.delay) + Number(timing.duration);
  }));
  const cancelGuidance = animateFirstMadiGuidance(element("guidance") as unknown as HTMLElement);
  const guidance = calls.get("guidance")!;
  assert.deepEqual(guidance.frames, [{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "none" }]);
  assert.ok(Number(guidance.timing.delay) - lastAssemblyFrame >= 600, "먼저 완성된 마디를 읽을 수 있다");
  assert.ok(FIRST_MADI_HANDOFF_MS - Number(guidance.timing.delay) - Number(guidance.timing.duration) >= 2400, "안내가 완전히 나타난 뒤 읽을 시간을 준다");
  const drift = calls.get("page")!;
  assert.equal(drift.timing.delay, guidance.timing.delay, "안내가 들어올 때부터 마디가 움직인다");
  assert.equal(Number(drift.timing.delay) + Number(drift.timing.duration), FIRST_MADI_HANDOFF_MS);
  assert.deepEqual(drift.frames.map(frame => frame.transform), ["translateY(0)", "translateY(-12px)", "translateY(0)"],
    "한 번만 들렸다가 책 전환 전에 제자리로 돌아온다");
  assert.equal(drift.timing.iterations ?? 1, 1);
  cancelAssembly?.(); cancelGuidance?.(); assert.equal(cancellations, calls.size);
  calls.clear(); cancellations = 0;
  assert.deepEqual(firstMadiPageOrigin(scene, viewport), { x: 160, y: 30, width: 160 });
  const motion = animateFirstMadiPlacement(scene, viewport, { x: 10, y: 45, width: 300 }, element("guidance-exit") as unknown as HTMLElement);
  const start = (key: string) => Number(calls.get(key)!.timing.delay ?? 0);
  const end = (key: string) => start(key) + Number(calls.get(key)!.timing.duration);
  assert.ok(fields.every(field => !calls.has(field)), "책 단계에서 항목을 다시 조립하지 않는다");
  const paper = calls.get("page")!;
  const paperAt = (index: number) => Number(paper.frames[index].offset) * Number(paper.timing.duration);
  assert.equal(start("guidance-exit"), paperAt(0), "안내가 사라지는 동안 마디도 움직이기 시작한다");
  assert.deepEqual(calls.get("guidance-exit")!.frames.map(frame => frame.opacity), [1, 0]);
  assert.ok(paperAt(0) < start("binding") && start("binding") < paperAt(1) && paperAt(1) < end("binding"),
    "the fade overlaps the tail of the first page move, but the full cover is never obscured");
  assert.ok(start("cover") < end("binding"), "표지 페이드와 펼치기가 이어진다");
  assert.ok(paperAt(2) < end("cover") && paperAt(2) > start("cover"), "펼치기가 끝나기 전에 마디가 안쪽으로 향한다");
  assert.notEqual(paper.frames[1].transform, paper.frames[2].transform, "책이 펼쳐지는 동안에도 마디는 움직인다");
  assert.equal(paper.frames[0].transform, "translate(-150px, 15px) rotate(0deg) scale(1.875)");
  assert.equal(calls.get("binding")!.frames[0].opacity, 0);
  assert.equal(calls.get("cover")!.frames[0].transform, "rotateY(180deg)");
  assert.equal(calls.get("cover")!.frames.length, 2, "one ease through the full hinge turn");
  assert.ok(end("cover") - start("cover") >= 700);
  assert.equal(paper.frames.length, 4, "no intermediate stop in the landing segment");
  assert.ok(paperAt(3) - paperAt(2) >= 800);
  assert.equal(end("page"), FIRST_MADI_PLACEMENT_MS);
  assert.equal(paper.frames.at(-1)?.transform, "translate(0px, 0px) rotate(0deg) scale(1)");
  motion?.cancel();
  assert.equal(cancellations, calls.size);
});
