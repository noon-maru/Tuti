import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as geometry from "../src/shared/harumadi/dragOrder";
import * as ordering from "../src/shared/harumadi/order";

// Real hook, deterministic hooks/layout/WAAPI adapters. In particular, layout
// effects rerun only when dependencies change, just like React in the browser.
function harness(reduced = false, scale = 1) {
  const refs: { current: unknown }[] = [];
  let cursor = 0, stateCursor = 0, callbackCursor = 0, layoutCursor = 0, ids = ["a", "b"], listTop = 100;
  const states: unknown[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const callbacks: { deps: unknown[]; fn: unknown }[] = [], layoutDeps: unknown[][] = [];
  const layouts: (() => void)[] = [], updates: string[][] = [];
  const motions: { id: string; from: string; duration: number; easing: string }[] = [];
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  type Hook = { listRef: { current: unknown }; registerRow: (id: string) => (node: unknown) => void;
    pointerDown: (event: unknown, id: string) => void; pointerMove: (event: unknown) => void;
    finish: (cancel?: boolean, pointerId?: number) => void; move: (id: string, target: number) => void; renderIds: string[]; positionIds: string[] };
  const compiledModule = { exports: {} as { useHarumadiOrderDrag: (props: unknown) => Hook } };
  const source = ts.transpileModule(readFileSync("src/features/tuti/hooks/useHarumadiOrderDrag.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, queueMicrotask,
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    window: { matchMedia: () => ({ matches: reduced }) }, require: (name: string) => {
      if (name === "react") return {
        useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
        useState: (value: unknown) => {
          const index = stateCursor++;
          if (!(index in states)) states[index] = value;
          return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
        },
        useCallback: (fn: unknown, deps: unknown[]) => {
          const index = callbackCursor++;
          if (!same(callbacks[index]?.deps, deps)) callbacks[index] = { fn, deps };
          return callbacks[index].fn;
        },
        useEffect: () => {}, useLayoutEffect: (fn: () => void, deps: unknown[]) => {
          const index = layoutCursor++;
          if (!same(layoutDeps[index], deps)) { layoutDeps[index] = deps; layouts.push(fn); }
        },
      };
      if (name.endsWith("/dragOrder")) return geometry;
      if (name.endsWith("/order")) return ordering;
      throw new Error(`Unexpected import: ${name}`);
    } });
  const nodes = new Map(["a", "b"].map(id => [id, {
    offsetTop: id === "a" ? 0 : 120, offsetHeight: 108, visualShift: null as number | null,
    style: { transform: "", transition: "" },
    getBoundingClientRect() {
      const shift = this.visualShift ?? Number(/translate3d\(0,([^p]+)px/.exec(this.style.transform)?.[1] ?? 0);
      return { top: listTop + (this.offsetTop + shift) * scale, height: 108 * scale };
    },
    animate(frames: { transform: string }[], timing: { duration: number; easing: string }) {
      motions.push({ id, from: frames[0].transform, ...timing }); return { cancel() {}, onfinish: null };
    },
  }]));
  const list = { offsetHeight: 228, getBoundingClientRect: () => ({ top: listTop, height: 228 * scale }),
    setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
  const scrollRef = { current: { getBoundingClientRect: () => ({ top: 0, bottom: 600 }) } };
  const onChange = (next: string[]) => { updates.push([...next]); ids = next; };
  const render = () => {
    cursor = stateCursor = callbackCursor = layoutCursor = 0;
    const hook = compiledModule.exports.useHarumadiOrderDrag({ ids, onChange, disabled: false, scrollRef });
    hook.listRef.current = list;
    hook.renderIds.forEach((id, index) => { nodes.get(id)!.offsetTop = index * 120; });
    for (const [id, node] of nodes) hook.registerRow(id)(node);
    while (layouts.length) layouts.shift()!();
    return hook;
  };
  let current: Hook;
  const drag = (id: string, target: number) => {
    current = render(); const node = nodes.get(id)!;
    current.pointerDown({ isPrimary: true, button: 0, pointerId: 1, clientY: listTop + node.offsetTop * scale + 20 }, id);
    current.pointerMove({ pointerId: 1, clientY: listTop + target * 120 * scale + 20 + (target === 0 ? -1 : 1) });
    current = render(); // A drag-state render must not clear the neighbour transform.
  };
  const finish = (cancel = false, pointerId = 1) => {
    current.finish(cancel, pointerId);
    for (const node of nodes.values()) node.visualShift = null;
    listTop -= 120;
    current = render();
  };
  const point = (top: number) => {
    current.pointerMove({ pointerId: 1, clientY: listTop + top * scale + 20 + 1 }); current = render();
  };
  const arrow = (id: string, target: number) => {
    current = render(); current.move(id, target);
    current = render();
  };
  const finishButton = () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
    current = render();
  };
  return { drag, finish, point, arrow, finishButton, motions, nodes, updates, render,
    get positionIds() { return current.positionIds; },
    get domIds() { return current.renderIds; }, get ids() { return ids; }, get pendingTimers() { return timers.size; } };
}
test("손을 놓기 전 표시 번호는 양쪽 마디의 예상 위치를 따르고 DOM과 저장 순서는 유지한다", () => {
  for (const [id, target] of [["a", 1], ["b", 0]] as const) {
    const h = harness(); h.drag(id, target);
    assert.equal(h.positionIds.indexOf(id), target);
    assert.equal(h.positionIds.join(","), "b,a");
    assert.equal(h.domIds.join(","), "a,b");
    assert.equal(h.updates.length, 0);
    h.finish();
    assert.equal(h.positionIds.join(","), "b,a");
  }
});
test("드래그 취소와 방향 되돌리기는 표시 번호도 원래 순서로 돌린다", () => {
  const cancelled = harness(); cancelled.drag("b", 0); cancelled.finish(true);
  assert.equal(cancelled.positionIds.join(","), "a,b");
  const reversed = harness(); reversed.drag("b", 0); reversed.point(120);
  assert.equal(reversed.positionIds.join(","), "a,b");
  assert.equal(reversed.updates.length, 0);
});
test("위로 끄는 동안 위 마디를 CSS로 아래에 이동시키고 DOM 순서는 건드리지 않는다", () => {
  const h = harness(); h.drag("b", 0);
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,120px,0)");
  assert.match(h.nodes.get("a")!.style.transition, /420ms cubic-bezier/);
  assert.equal(h.nodes.get("a")!.offsetTop, 0);
  assert.equal(h.updates.length, 0);
  assert.equal(h.ids.join(","), "a,b");
  h.finish(); assert.equal(h.ids.join(","), "b,a"); assert.equal(h.updates.length, 1);
});
test("아래로 끌 때도 DOM 재배치 없이 반대 부호·같은 시간으로 이동한다", () => {
  const h = harness(); h.drag("a", 1);
  assert.equal(h.nodes.get("b")!.style.transform, "translate3d(0,-120px,0)");
  assert.match(h.nodes.get("b")!.style.transition, /420ms cubic-bezier/);
  assert.equal(h.updates.length, 0);
  h.finish(); assert.equal(h.ids.join(","), "b,a");
});
test("손을 놓는 순간에도 진행 중인 이웃 애니메이션의 현재 위치에서 이어간다", () => {
  const h = harness(); h.drag("b", 0);
  h.nodes.get("a")!.visualShift = 40;
  h.finish();
  const neighbour = h.motions.find(m => m.id === "a")!;
  assert.deepEqual(neighbour, { id: "a", from: "translate3d(0,-80px,0)", ...geometry.ORDER_MOVE_TIMING });
});
test("드래그 취소는 부모 순서를 변경하지 않고 이웃 마디를 원래 위치로 되돌린다", () => {
  const h = harness(); h.drag("b", 0); h.finish(true);
  assert.equal(h.updates.length, 0); assert.equal(h.ids.join(","), "a,b");
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,0px,0)");
  assert.match(h.nodes.get("a")!.style.transition, /420ms/);
});
test("동작 줄이기는 포인터 추적을 유지하되 이웃 이동·정착 효과를 생략한다", () => {
  for (const [id, target, neighbour] of [["a", 1, "b"], ["b", 0, "a"]] as const) {
    const h = harness(true); h.drag(id, target);
    assert.equal(h.nodes.get(neighbour)!.style.transition, "none");
    h.finish(); assert.equal(h.motions.length, 0);
  }
});

test("축소된 PC 목업에서도 양방향 같은 CSS 이동량을 사용한다", () => {
  const up = harness(false, .8); up.drag("b", 0);
  assert.equal(up.nodes.get("a")!.style.transform, "translate3d(0,120px,0)");
  const down = harness(false, .8); down.drag("a", 1);
  assert.equal(down.nodes.get("b")!.style.transform, "translate3d(0,-120px,0)");
});

test("다른 포인터의 손 떼기는 현재 드래그를 저장하지 않는다", () => {
  const h = harness(); h.drag("b", 0); h.finish(false, 2);
  assert.equal(h.updates.length, 0);
  h.finish(false, 1); assert.equal(h.updates.length, 1);
});

test("끌다가 방향을 되돌려도 부모 DOM 순서를 바꾸지 않고 CSS 목표만 갱신한다", () => {
  const h = harness(); h.drag("b", 0); h.point(120);
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,0px,0)");
  assert.match(h.nodes.get("a")!.style.transition, /420ms/);
  assert.equal(h.updates.length, 0);
  h.finish(); assert.equal(h.updates.length, 0);
});

test("위 버튼은 저장할 순서만 즉시 갱신하고 선택한 마디와 이웃을 고정 DOM에서 함께 움직인다", () => {
  const h = harness(); h.arrow("b", 0);
  assert.equal(h.ids.join(","), "b,a"); assert.equal(h.updates.length, 1);
  assert.equal(h.domIds.join(","), "a,b", "애니메이션 도중 선택한 행도 재삽입하지 않는다");
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,120px,0)");
  assert.equal(h.nodes.get("b")!.style.transform, "translate3d(0,-120px,0)");
  for (const node of h.nodes.values()) assert.match(node.style.transition, /420ms cubic-bezier/);
  h.finishButton(); assert.equal(h.domIds.join(","), "b,a");
  assert.equal(h.updates.length, 1, "모션 종료 때 저장 순서를 다시 갱신하지 않는다");
});

test("아래 버튼도 선택한 마디와 밀려나는 마디가 같은 이징으로 서로 교차한다", () => {
  const h = harness(); h.arrow("a", 1);
  assert.equal(h.domIds.join(","), "a,b");
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,120px,0)");
  assert.equal(h.nodes.get("b")!.style.transform, "translate3d(0,-120px,0)");
  h.finishButton(); assert.equal(h.domIds.join(","), "b,a");
});

test("버튼을 연속으로 누르거나 방향을 반전해도 같은 DOM을 유지하며 마지막 순서로 끝난다", () => {
  const h = harness(); h.arrow("b", 0); h.arrow("b", 1);
  assert.equal(h.pendingTimers, 1);
  assert.equal(h.domIds.join(","), "a,b");
  assert.equal(h.nodes.get("a")!.style.transform, "translate3d(0,0px,0)");
  assert.equal(h.nodes.get("b")!.style.transform, "translate3d(0,0px,0)");
  h.finishButton(); assert.equal(h.domIds.join(","), "a,b"); assert.equal(h.updates.length, 2);
});

test("동작 줄이기에서 버튼 이동은 대기 타이머 없이 즉시 반영한다", () => {
  const h = harness(true); h.arrow("b", 0);
  assert.equal(h.domIds.join(","), "b,a"); assert.equal(h.pendingTimers, 0);
  assert.equal(h.motions.length, 0);
});
