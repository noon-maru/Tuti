import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import styled from "@emotion/styled";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalPlaceSuggestions } from "../src/features/tuti/components/JournalPlaceSuggestions";
import * as suggestionTypes from "../src/shared/api/placeSuggestions";

const history = { key: "history:park", id: null, name: "양평 유수지 생태공원", region: null, source: "history" as const };
const place = { key: "place:other", id: "other", name: "양평의 다른 공원", region: "경기도 양평군", source: "place" as const };
const data = { history: [history], places: [place] };

test("제안은 개인 장소부터 표시하며 로딩·실패·직접 입력 안내를 제공한다", () => {
  const base = { id: "list", data, activeKey: history.key, status: "ready" as const, hasQuery: true, onSelect() {}, onHighlight() {}, onRetry() {} };
  const html = renderToStaticMarkup(React.createElement(JournalPlaceSuggestions, base));
  assert.ok(html.indexOf("전에 남긴 장소") < html.indexOf("양평 유수지 생태공원"));
  assert.ok(html.indexOf("양평 유수지 생태공원") < html.indexOf("장소 검색 결과"));
  assert.match(html, /role="listbox"/); assert.match(html, /role="option"/); assert.match(html, /aria-selected="true"/);
  assert.match(html, /min-height:48px/);
  assert.match(renderToStaticMarkup(React.createElement(JournalPlaceSuggestions, { ...base, status: "loading" })), /찾고 있어요/);
  assert.match(renderToStaticMarkup(React.createElement(JournalPlaceSuggestions, { ...base, status: "error" })), /직접 입력해도 괜찮아요/);
  assert.match(renderToStaticMarkup(React.createElement(JournalPlaceSuggestions, { ...base, data: { history: [], places: [] } })), /입력한 이름 그대로/);
  assert.equal(renderToStaticMarkup(React.createElement(JournalPlaceSuggestions, { ...base, hasQuery: false, data: { history: [], places: [] } })), "");
});

type Element = { props?: Record<string, unknown> };
function find(root: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (!root || typeof root !== "object") return;
  const props = (root as Element).props;
  return props && (predicate(props) ? props : find(props.children, predicate));
}

test("한글 조합은 선택하지 않고 방향키·Enter·Escape·직접 입력을 같은 필드에서 처리한다", () => {
  const states: unknown[] = []; let cursor = 0, value = "양평", selection: unknown, enabled = false;
  const ref = { current: { focus() {} } };
  const exports: { JournalPlacePicker?: (props: unknown) => unknown } = {};
  const deps: Record<string, unknown> = {
    react: { ...React, useId: () => "place", useRef: () => ref, useState: (initial: unknown) => {
      const index = cursor++; if (!(index in states)) states[index] = initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    } },
    "../hooks/useJournalPlaceSuggestions": { useJournalPlaceSuggestions: (_q: string, open: boolean) => { enabled = open; return { ...data, status: open ? "ready" : "idle", retry() {} }; } },
    "@/shared/api/placeSuggestions": suggestionTypes,
    "./JournalPlaceSuggestions": { JournalPlaceSuggestions: "suggestions" },
  };
  // 실제 필드의 JSX와 이벤트 처리에 훅·DOM 대역을 주입한다.
  const requireReal = (id: string) => {
    if (id === "@emotion/styled") return { __esModule: true, default: styled };
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "lucide-react") return { Search: "svg", X: "svg" };
    if (id === "./buttons") return { BaseButton: "button" };
    if (id === "@/shared/ui/typography") return { captionStyles: "", inputControlStyles: "" };
    if (id === "@/shared/tuti/madiFields") return { MADI_FIELD_COPY: { placePlaceholder: "장소" } };
    if (id === "@/shared/api/firstJournal") return { FIRST_JOURNAL_PLACE_LIMIT: 120 };
    throw new Error(`Unexpected module ${id}`);
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/components/JournalPlacePicker.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { exports, require: (id: string) => deps[id] ?? requireReal(id), window: { requestAnimationFrame: (run: () => void) => run() }, document: { getElementById: () => ({ scrollIntoView() {} }) } });
  const render = () => { cursor = 0; return exports.JournalPlacePicker!({ placeId: null, value, onChange: (item: unknown) => { selection = item; }, onTextChange: (next: string) => { value = next; } }); };
  const input = () => find(render(), props => props.role === "combobox")!;
  const call = (props: Record<string, unknown>, key: string, event = {}) => (props[key] as (event: unknown) => void)(event);
  const key = (name: string, composing = false) => ({ key: name, keyCode: 0, nativeEvent: { isComposing: composing }, preventDefault() {}, stopPropagation() {} });
  assert.equal(input()["aria-expanded"], false); assert.equal(enabled, false);
  call(input(), "onFocus"); assert.equal(input()["aria-expanded"], true);
  call(input(), "onKeyDown", key("ArrowDown")); assert.equal(input()["aria-activedescendant"], "place-suggestions-option-0");
  call(input(), "onKeyDown", key("Enter", true)); assert.equal(selection, undefined);
  call(input(), "onCompositionStart"); assert.equal(input()["aria-expanded"], false);
  call(input(), "onCompositionEnd");
  call(input(), "onKeyDown", key("ArrowDown")); call(input(), "onKeyDown", key("Enter"));
  assert.equal((selection as unknown as { id: null }).id, null);
  assert.equal((selection as unknown as { name: string }).name, history.name);
  assert.equal(input()["aria-expanded"], false);
  call(input(), "onFocus"); call(input(), "onKeyDown", key("ArrowUp"));
  assert.equal(input()["aria-activedescendant"], "place-suggestions-option-1");
  call(input(), "onKeyDown", key("Escape")); assert.equal(input()["aria-expanded"], false);
  call(input(), "onKeyDown", key("ArrowDown")); assert.equal(input()["aria-expanded"], true);
  call(input(), "onChange", { target: { value: "내가 정한 장소" } }); assert.equal(value, "내가 정한 장소");
});
