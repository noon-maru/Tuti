import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import styled from "@emotion/styled";
import * as jsx from "react/jsx-runtime";
import { groupHarumadiChoices } from "../src/shared/harumadi/recentChoices";
import { findMadiControl } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";

function fixture(add: (...args: unknown[]) => Promise<unknown>, recentError = false) {
  const book = { ...harumadiContent().harumadi, shared: true };
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  let index = 0, refIndex = 0, done = 0;
  const next: Array<string | undefined> = [];
  const deps: Record<string, unknown> = {
    react: { ...React, useState: (initial: unknown) => {
      const i = index++; if (!(i in states)) states[i] = initial;
      return [states[i], (value: unknown) => { states[i] = value; }];
    }, useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }), useEffect() {} },
    "react/jsx-runtime": jsx, "@emotion/styled": { __esModule: true, default: styled }, "lucide-react": { BookOpen: "svg", Check: "svg" },
    "next/link": { __esModule: true, default: "a" },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries() {}, removeQueries() {} }),
      useQuery: () => ({ data: recentError ? undefined : { harumadis: [book] }, isPending: false, isError: recentError, refetch() {} }) },
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: "div" },
    "@/features/tuti/components/buttons": { BackButton: "button", PrimaryButton: styled.button({}), TextButton: "button" },
    "@/features/tuti/navigation/androidBack": { ANDROID_BACK_EVENT: "back" },
    "@/lib/harumadis": { fetchHarumadis() {}, fetchRecentHarumadis() {} },
    "@/lib/addMadiToHarumadi": { addMadiToHarumadi: add },
    "@/features/tuti/components/HarumadiTitleHint": { HarumadiTitleHint: "span" },
    "@/shared/harumadi/recentChoices": { groupHarumadiChoices },
    "@/features/tuti/hooks/useHarumadiLibrary": { useHarumadiLibrary: () => ({ data: { pages: [{ harumadis: [book] }] }, isPending: false, isError: false, refetch() {} }) },
    "@/features/tuti/hooks/useHarumadiSearch": { useHarumadiSearch: (books: unknown[]) => ({ search: "", books, searching: false, setSearch() {} }) },
    "@/features/tuti/components/MadiSearchField": { MadiSearchField: "input" },
  };
  const exports: { MadiHarumadiSelection?: (props: unknown) => unknown } = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/screens/journal/MadiHarumadiSelection.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  const render = () => { index = 0; refIndex = 0; return exports.MadiHarumadiSelection!({ ownerId: "owner", entryId: "entry", onDone: () => { done++; }, onNext: (id?: string) => next.push(id) }); };
  const control = (label: string) => findMadiControl(render(), p => p.children === label)!;
  return { book, next, done: () => done, render, control,
    choose: () => (findMadiControl(render(), p => p.type === "radio" && p.value === book.id)!.onChange as () => void)() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test("최근 제안도 자동 선택하지 않고 명시적으로 고른 책을 연결 성공 후에만 다음 작성으로 전달한다", async () => {
  let resolve!: () => void, calls = 0;
  const screen = fixture(async (...args) => {
    calls++; assert.deepEqual(args, ["owner", screen.book.id, "entry", true]);
    await new Promise<void>(done => { resolve = done; });
  });
  assert.equal(findMadiControl(screen.render(), p => p.type === "radio")!.checked, false);
  screen.choose();
  const click = screen.control("담고 같은 하루마디에 계속 쓰기").onClick as () => void;
  click(); click(); assert.equal(calls, 1); assert.deepEqual(screen.next, []);
  resolve(); await flush(); assert.deepEqual(screen.next, [screen.book.id]); assert.equal(screen.done(), 0);
});
test("추천 조회 실패·담기 실패에도 원본 저장 상태와 직접 선택 경로를 유지한다", async () => {
  const screen = fixture(async () => { throw Error("담기에 실패했어요."); }, true);
  screen.choose(); (screen.control("담고 같은 하루마디에 계속 쓰기").onClick as () => void)(); await flush();
  assert.deepEqual(screen.next, []); assert.equal(screen.done(), 0);
  const alert = findMadiControl(screen.render(), p => p.role === "alert")!;
  assert.match(String((alert.children as unknown[])[0]), /마디는 저장되어 있어요/);
  const noSelection = fixture(async () => { throw Error("호출되면 안 됨"); });
  (noSelection.control("담지 않고 다음 마디 남기기").onClick as () => void)();
  assert.deepEqual(noSelection.next, [undefined]);
});
