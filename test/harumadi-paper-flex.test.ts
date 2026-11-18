import assert from "node:assert/strict";
import test from "node:test";
import { animateHarumadiPaperFlex, paperFlexFrames } from "@/lib/harumadiPaperFlex";

function scene(hinge = "left", failAt = 0) {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean; resolve: () => void }[] = [];
  class Node {
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    children: Node[] = [];
    parent?: Node;
    inert = false;
    ownerDocument = { createElement: () => new Node() };
    matches(selector: string) { return selector === "[data-paper-surface]" ? "paperSurface" in this.dataset : "paperSource" in this.dataset; }
    querySelector(selector: string): Node | undefined {
      for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; }
    }
    setAttribute() {}
    removeAttribute(name: string) { if (name === "data-paper-source") delete this.dataset.paperSource; }
    append(node: Node) { node.parent = this; this.children.push(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    cloneNode(): Node { const copy = new Node(); copy.style = { ...this.style }; copy.dataset = { ...this.dataset }; return copy; }
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
      if (failAt && calls.length + 1 === failAt) throw Error("unsupported");
      let resolve!: () => void, reject!: (error: Error) => void;
      const finished = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      const call = { frames, options, cancelled: false, resolve }; calls.push(call);
      return { finished, cancel() { call.cancelled = true; reject(Error("cancelled")); } };
    }
  }
  const surface = new Node(); surface.dataset = { paperSurface: "true", paperHinge: hinge };
  const source = new Node(); source.dataset.paperSource = "true"; source.style.visibility = "visible"; surface.append(source);
  return { surface, source, calls, target: surface as unknown as HTMLElement };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("책등 구간은 고정하고 바깥쪽 휨은 커지되 펼침·닫힘과 좌우는 대칭이다", () => {
  for (let index = 0; index < 4; index++) {
    const open = paperFlexFrames("open", index);
    const close = paperFlexFrames("close", index);
    const right = paperFlexFrames("open", index, "right");
    assert.equal(open[0].transform, "rotateY(0deg)");
    assert.equal(open.at(-1)!.transform, "rotateY(0deg)");
    const angle = (frames: Keyframe[]) => Number(String(frames[2].transform).match(/rotateY\(([-.\d]+)deg\)/)![1]);
    assert.ok(Math.abs(angle(open)) <= 10.5);
    assert.equal(angle(open) + angle(close), 0);
    assert.equal(angle(open) + angle(right), 0);
    if (!index) assert.equal(angle(open), 0);
  }
});

test("회전 중에만 네 구간을 만들고 원본은 한 번만 유지하며 끝나면 모두 정리한다", async () => {
  const { surface, source, calls, target } = scene();
  const cancel = animateHarumadiPaperFlex(target, "open", 680, 160);
  assert.equal(surface.children.length, 2);
  assert.equal(source.style.visibility, "hidden");
  assert.equal(calls.length, 6, "세 관절과 각 관절의 제한된 음영만 움직인다");
  assert.equal(surface.children[1].inert, true);
  assert.equal(calls[0].options.delay, 176);
  assert.equal(calls[4].options.delay, 208);
  assert.equal(Number(calls[4].options.delay) + Number(calls[4].options.duration), 840);
  calls.forEach(call => call.resolve()); await flush();
  assert.deepEqual(surface.children, [source]);
  assert.equal(source.style.visibility, "visible");
  cancel(); assert.equal(surface.children.length, 1);
});

test("왼쪽 지면은 오른쪽 책등에서 이어지고 중단·재시작·실패 시 원본을 복원한다", async () => {
  const { surface, source, calls, target } = scene("right");
  const stopOpening = animateHarumadiPaperFlex(target, "open", 900);
  const joint = surface.children[1].children[0];
  assert.equal(joint.style.transformOrigin, "right center");
  assert.equal(joint.style.right, "0");
  assert.equal(joint.children[1].style.right, "100%");
  const stopClosing = animateHarumadiPaperFlex(target, "close", 420);
  assert.ok(calls.slice(0, 6).every(call => call.cancelled));
  assert.equal(surface.children.length, 2);
  stopOpening(); assert.equal(source.style.visibility, "hidden", "과거 취소가 새 동작을 제거하지 않는다");
  stopClosing(); await flush();
  assert.equal(source.style.visibility, "visible"); assert.equal(surface.children.length, 1);
  const failed = scene("left", 3);
  assert.doesNotThrow(() => animateHarumadiPaperFlex(failed.target, "open", 680));
  assert.equal(failed.surface.children.length, 1); assert.equal(failed.source.style.visibility, "visible");
  await flush();
  assert.doesNotThrow(() => animateHarumadiPaperFlex({} as HTMLElement, "open", 680));
});
