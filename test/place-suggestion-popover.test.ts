import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as layout from "../src/features/tuti/components/placeSuggestionLayout";

test("위쪽 팝오버는 body 포털·뷰포트 추적·외부 닫기·하단 시작을 처리하고 리스너를 정리한다", () => {
  const windowEvents = new Map<string, () => void>(), viewportEvents = new Map<string, () => void>();
  const documentEvents = new Map<string, (event: { target: unknown }) => void>();
  const effects: Array<() => void | (() => void)> = [];
  const frame = { top: 40, bottom: 800, left: 300, right: 690 };
  let anchorTop = 600, position: unknown = null, dismissed = 0, portalTarget: unknown, scrollTop = 0, observed = 0;
  const body = {}, outside = {}, ref = { current: () => {} };
  const panel = { scrollHeight: 800, contains: (target: unknown) => target === panel, scrollTo: ({ top }: { top: number }) => { scrollTop = top; } };
  const input = { getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 54, left: 324, right: 666 }),
    closest: () => ({ getBoundingClientRect: () => frame }), parentElement: { contains: (target: unknown) => target === input } };
  const viewport = { offsetTop: 0, offsetLeft: 0, height: 900, width: 1200,
    addEventListener: (name: string, fn: () => void) => viewportEvents.set(name, fn), removeEventListener: (name: string) => viewportEvents.delete(name) };
  const deps: Record<string, unknown> = {
    react: { useRef: () => ref, useState: () => [position, (next: (previous: unknown) => unknown) => { position = next(position); }], useLayoutEffect: (effect: () => void) => effects.push(effect) },
    "react-dom": { createPortal: (child: unknown, target: unknown) => { portalTarget = target; return child; } },
    "react/jsx-runtime": jsx, "@emotion/styled": { __esModule: true, default: { div: () => "popover" } },
    "./placeSuggestionLayout": layout,
  };
  const exports: { JournalPlaceSuggestionPopover?: (props: unknown) => { props: { style: { bottom: number; maxHeight: number } } } | null } = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/components/JournalPlaceSuggestionPopover.tsx", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; },
    window: { innerHeight: 900, visualViewport: viewport, requestAnimationFrame: (fn: () => void) => { fn(); return 1; }, cancelAnimationFrame() {},
      addEventListener: (name: string, fn: () => void) => windowEvents.set(name, fn), removeEventListener: (name: string) => windowEvents.delete(name) },
    document: { body, addEventListener: (name: string, fn: (event: { target: unknown }) => void) => documentEvents.set(name, fn), removeEventListener: (name: string) => documentEvents.delete(name) },
    ResizeObserver: class { observe() { observed++; } disconnect() { observed = 0; } },
  });
  const render = () => exports.JournalPlaceSuggestionPopover!({ anchor: { current: input }, popup: { current: panel }, contentKey: "results", onDismiss: () => { dismissed++; }, children: "suggestions" });
  assert.equal(render(), null);
  const cleanups = effects.map(effect => effect());
  assert.equal(render()!.props.style.bottom, 306); assert.equal(portalTarget, body);
  assert.equal(scrollTop, 800); assert.equal(observed, 2);
  anchorTop = 300; viewport.offsetTop = 100; viewport.height = 400;
  viewportEvents.get("resize")!();
  assert.equal(render()!.props.style.maxHeight, 186);
  documentEvents.get("pointerdown")!({ target: input }); documentEvents.get("pointerdown")!({ target: panel });
  assert.equal(dismissed, 0);
  documentEvents.get("pointerdown")!({ target: outside }); assert.equal(dismissed, 1);
  cleanups.forEach(cleanup => cleanup?.());
  assert.equal(windowEvents.size + viewportEvents.size + documentEvents.size + observed, 0);
});
