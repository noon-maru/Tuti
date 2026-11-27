import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type * as Handoff from "../src/features/tuti/lib/firstMadiHandoff";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
function fixture(reduced = false) {
  const motions: { frames: Keyframe[]; duration: number; finish: () => void; cancel: boolean }[] = [];
  const timers = new Map<number, () => void>(), frames = new Map<number, () => void>();
  const events = new EventTarget();
  const media = { matches: reduced };
  let token = 0, owner = "owner", sessionChange: (() => void) | undefined;
  class ElementStub {
    style: Record<string, string> = {};
    inert = false; isConnected = true; clientTop = 0; clientLeft = 0;
    attrs = new Map<string, string>(); children: ElementStub[] = []; parent: ElementStub | undefined;
    constructor(readonly rect = box(0, 0, 390, 800)) {}
    getBoundingClientRect() { return this.rect; }
    setAttribute(key: string, value: string) { this.attrs.set(key, value); }
    getAttribute(key: string) { return this.attrs.get(key) ?? null; }
    hasAttribute(key: string) { return this.attrs.has(key); }
    append(...children: ElementStub[]) { for (const child of children) { child.remove(); child.parent = this; this.children.push(child); } }
    insertBefore(child: ElementStub, next: ElementStub) { child.parent = this; this.children.splice(this.children.indexOf(next), 0, child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    cloneNode(deep: boolean) { const node = new ElementStub(this.rect); node.attrs = new Map(this.attrs); if (deep) this.children.forEach(child => node.append(child.cloneNode(true))); return node; }
    matches(selector: string) {
      const match = selector.match(/^\[([^=\]]+)(?:='([^']*)')?\]$/);
      return match ? this.hasAttribute(match[1]) && (match[2] === undefined || this.getAttribute(match[1]) === match[2]) : false;
    }
    closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
    querySelectorAll(selector: string): ElementStub[] { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
    animate(keyframes: Keyframe[], { duration }: { duration: number }) {
      let finish!: () => void;
      const finished = new Promise<void>(resolve => { finish = resolve; });
      const motion = { frames: keyframes, duration, finish, cancel: false }; motions.push(motion);
      return { finished, cancel() { motion.cancel = true; } };
    }
  }
  const root = new ElementStub(), screen = new ElementStub(), scene = new ElementStub(box(45, 210, 300, 212));
  const page = new ElementStub(box(195, 210, 150, 212));
  const underPage = new ElementStub(page.rect);
  root.setAttribute("data-app-viewport", "");
  screen.setAttribute("aria-labelledby", "madi-create-heading");
  page.setAttribute("data-placement-page", "");
  underPage.setAttribute("data-placement-under-page", "");
  root.append(screen); screen.append(scene); scene.append(underPage, page);
  const exports = {} as typeof Handoff;
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/lib/firstMadiHandoff.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: () => ({
      getSessionSnapshot: () => ({ userId: owner }),
      subscribeToSession: (change: () => void) => { sessionChange = change; return () => { sessionChange = undefined; }; },
    }),
    document: { createElement: () => new ElementStub() },
    MutationObserver: class { observe() {} disconnect() {} },
    window: {
      matchMedia: () => media, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      requestAnimationFrame: (cb: () => void) => { frames.set(++token, cb); return token; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setTimeout: (cb: () => void) => { timers.set(++token, cb); return token; },
      clearTimeout: (id: number) => timers.delete(id),
    },
  });
  let navigations = 0;
  const start = (kind: Handoff.FirstMadiHandoffKind) => exports.startFirstMadiHandoff({
    kind, ownerId: "owner", bookId: "book", entryId: "entry", scene: scene as unknown as HTMLElement, navigate: () => { navigations++; },
  });
  const destination = (attr: string, id: string) => { const node = new ElementStub(box(30, 100, 320, 450)); node.setAttribute(attr, id); root.append(node); return node; };
  return {
    exports, start, motions, timers, screen, scene, destination,
    get navigations() { return navigations; },
    nextFrame() { for (const [id, cb] of [...frames]) { frames.delete(id); cb(); } },
    layer: () => root.querySelector("[data-first-madi-handoff]"),
    back: () => events.dispatchEvent(new Event("popstate")),
    changeAccount: () => { owner = "another-owner"; sessionChange?.(); },
  };
}

test("쪽 보기는 같은 마디의 지면까지 이동하고 복제본과 원래 컨트롤을 정리한다", async () => {
  const f = fixture();
  f.destination("data-first-madi-read-target", "other-entry");
  f.start("read"); f.start("read"); f.nextFrame();
  assert.equal(f.navigations, 1);
  assert.equal(f.motions.length, 0);
  f.back();
  assert.equal(f.layer(), null);
  const target = f.destination("data-first-madi-read-target", "entry");
  f.start("read"); f.nextFrame();
  assert.equal(f.motions.length, 3);
  assert.equal(f.motions[2].frames[1].transform, f.exports.firstMadiHandoffTransform(box(195, 210, 150, 212), target.rect));
  assert.equal(f.motions[1].frames[1].opacity, 1, "이동 중 지면을 먼저 흐리게 하지 않는다");
  f.motions.forEach(motion => motion.finish()); await flush();
  assert.equal(f.layer(), null);
  assert.equal(f.screen.inert, false);
  assert.equal(f.timers.size, 0);
});

test("이어 쓰기는 쪽 넘김과 빈 지면 확대를 마친 뒤에만 작성으로 이동한다", async () => {
  const f = fixture();
  f.start("continue");
  assert.equal(f.navigations, 0);
  const hinge = f.layer()?.querySelector("[data-first-madi-turning-leaf]");
  assert.equal(hinge?.style.transformStyle, "preserve-3d");
  assert.equal(hinge?.querySelector("[data-placement-page]")?.style.backfaceVisibility, "hidden");
  assert.equal(hinge?.querySelector("[data-first-madi-leaf-reverse]")?.style.transform, "rotateY(180deg)");
  assert.equal(f.layer()?.querySelector("[data-placement-under-page]"), null);
  assert.match(String(f.motions[0].frames[1].transform), /rotateY\(-180deg\)/);
  assert.ok(f.motions[0].frames.every(frame => frame.opacity === undefined), "종이 자체는 왼쪽에 내려앉을 때까지 사라지지 않는다");
  f.motions[0].finish(); await flush();
  assert.equal(f.navigations, 0);
  assert.match(String(f.motions[2].frames[1].transform), /scale\(/);
  f.motions[2].finish(); await flush();
  assert.equal(f.navigations, 1);
  f.destination("data-first-madi-write-target", "book"); f.nextFrame();
  f.motions[3].finish(); await flush();
  assert.equal(f.layer(), null);
});

test("책장 복귀는 같은 계정의 펼쳐진 책으로만 이어지고 계정 변경 시 중단된다", async () => {
  const f = fixture();
  const book = f.destination("data-first-madi-shelf-book", "book");
  book.setAttribute("data-carousel-active", "true");
  const spread = f.destination("data-harumadi-spread-preview", "");
  spread.remove(); book.append(spread);
  f.start("shelf"); f.nextFrame();
  assert.equal(f.exports.firstMadiShelfArrival("owner"), "book");
  assert.equal(f.exports.firstMadiShelfArrival("other"), null);
  assert.equal(f.motions.length, 3);
  f.changeAccount(); await flush();
  assert.equal(f.layer(), null);
  assert.equal(f.exports.firstMadiShelfArrival("owner"), null);
  assert.ok(f.motions.every(motion => motion.cancel));
});

test("동작 줄이기는 대기나 임시 레이어 없이 원래 경로로 이동한다", () => {
  const f = fixture(true);
  f.start("continue");
  assert.equal(f.navigations, 1);
  assert.equal(f.layer(), null);
  assert.equal(f.motions.length, 0);
});
