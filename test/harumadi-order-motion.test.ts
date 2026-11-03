import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as geometry from "../src/shared/harumadi/dragOrder";
import * as ordering from "../src/shared/harumadi/order";

// Execute the real hook with deterministic layout/WAAPI adapters. No browser or
// native frame-rate claim: this verifies the transforms handed to the browser.
function harness(reduced = false) {
  const refs: { current: unknown }[] = [];
  let cursor = 0, ids = ["a", "b"], listTop = 100;
  const layouts: (() => void)[] = [];
  const motions: { id: string; from: string; duration: number; easing: string }[] = [];
  const compiledModule = { exports: {} as { useHarumadiOrderDrag: (props: unknown) => ReturnTypeHook } };
  type ReturnTypeHook = {
    listRef: { current: unknown }; registerRow: (id: string) => (node: unknown) => void;
    pointerDown: (event: unknown, id: string) => void; move: (id: string, target: number) => void;
  };
  const source = ts.transpileModule(readFileSync("src/features/tuti/hooks/useHarumadiOrderDrag.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, window: { matchMedia: () => ({ matches: reduced }) }, require: (name: string) => {
    if (name === "react") return {
      useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
      useState: (value: unknown) => [value, () => {}], useCallback: (fn: unknown) => fn,
      useEffect: () => {}, useLayoutEffect: (fn: () => void) => layouts.push(fn),
    };
    if (name.endsWith("/dragOrder")) return geometry;
    if (name.endsWith("/order")) return ordering;
    throw new Error(`Unexpected import: ${name}`);
  } });
  const nodes = new Map(["a", "b"].map(id => [id, {
    offsetTop: id === "a" ? 0 : 120, offsetHeight: 108, style: { transform: "" },
    getBoundingClientRect() {
      const shift = Number(/translate3d\(0,([^p]+)px/.exec(this.style.transform)?.[1] ?? 0);
      return { top: listTop + this.offsetTop + shift, height: 108 };
    },
    animate(frames: { transform: string }[], timing: { duration: number; easing: string }) {
      motions.push({ id, from: frames[0].transform, ...timing });
      return { cancel() {}, onfinish: null };
    },
  }]));
  const list = { offsetHeight: 228, getBoundingClientRect: () => ({ top: listTop, height: 228 }), setPointerCapture() {} };
  const render = () => {
    cursor = 0;
    const hook = compiledModule.exports.useHarumadiOrderDrag({ ids, onChange: (next: string[]) => { ids = next; }, disabled: false,
      scrollRef: { current: { getBoundingClientRect: () => ({ top: 0, bottom: 600 }) } } });
    hook.listRef.current = list;
    for (const [id, node] of nodes) hook.registerRow(id)(node);
    while (layouts.length) layouts.shift()!();
    return hook;
  };
  const swap = (id: string, target: number) => {
    const hook = render();
    const node = nodes.get(id)!;
    hook.pointerDown({ isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: listTop + node.offsetTop + 20 }, id);
    hook.move(id, target);
    ids.forEach((id, index) => { nodes.get(id)!.offsetTop = index * 120; });
    listTop -= 120; // An anchored row can keep exactly the same viewport top.
    render();
  };
  return { swap, motions };
}
test("위로 잡아끌 때 밀려 내려가는 이웃 마디에도 420ms 이징을 적용한다", () => {
  const h = harness(); h.swap("b", 0);
  assert.equal(h.motions.length, 1);
  assert.deepEqual(h.motions[0], { id: "a", from: "translate3d(0,-120px,0)", ...geometry.ORDER_MOVE_TIMING });
});
test("아래로 잡아끌 때 올라오는 마디도 같은 시간·이징을 사용한다", () => {
  const h = harness(); h.swap("a", 1);
  assert.equal(h.motions.length, 1);
  assert.deepEqual(h.motions[0], { id: "b", from: "translate3d(0,120px,0)", ...geometry.ORDER_MOVE_TIMING });
});
test("동작 줄이기에서는 양방향 자리 이동 애니메이션을 생략한다", () => {
  for (const [id, target] of [["a", 1], ["b", 0]] as const) {
    const h = harness(true); h.swap(id, target); assert.equal(h.motions.length, 0);
  }
});
