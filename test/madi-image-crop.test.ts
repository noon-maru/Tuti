import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import styled from "@emotion/styled";
import * as imageGeometry from "../src/shared/harumadi/imageGeometry";
import { findMadiControl } from "./fixtures/madiCreateHarness";

test("비율 변경은 확대를 초기화하고 새 작업 영역 측정 전에는 저장하지 않는다", () => {
  let cursor = 0, refCursor = 0;
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  let output = { width: 0, height: 0 }, confirmed = 0;
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }), toDataURL: () => { output = { width: canvas.width, height: canvas.height }; return "data:image/jpeg;base64,synthetic"; } };
  const dependencies: Record<string, unknown> = {
    react: { ...React, useId: () => "crop", useEffect() {}, useMemo: (fn: () => unknown) => fn(),
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = index === 0 ? { width: 300, height: 225 } : index === 1 ? { width: 900, height: 1600 } : initial;
        return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef: () => refs[refCursor++] ?? (refs[refCursor - 1] = { current: {} }),
    },
    "react/jsx-runtime": jsx, "@emotion/styled": { __esModule: true, default: styled },
    "@/shared/ui/AppDialogFrame": { AppDialogFrame: "section" },
    "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button" },
    "@/shared/harumadi/imageGeometry": imageGeometry,
  };
  const exports: { ImageCropDialog?: (props: unknown) => unknown } = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/components/ImageCropDialog.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, document: { createElement: () => canvas } });
  const render = () => { cursor = 0; refCursor = 0; return exports.ImageCropDialog!({ source: "synthetic", onCancel() {}, onConfirm() { confirmed++; } }); };
  const choose = (label: string) => {
    const option = findMadiControl(render(), props => Boolean(props.onClick && Array.isArray(props.children) && (props.children[0] as React.ReactElement<{ children: string }>)?.props?.children === label))!;
    (option.onClick as () => void)();
  };
  const save = () => findMadiControl(render(), props => props.children === "이대로 사용하기")!;
  render(); states[3] = 2;
  choose("세로"); assert.equal(states[3], 1); assert.equal(save().disabled, true);
  (save().onClick as () => void)(); assert.equal(confirmed, 0);
  states[0] = { width: 225, height: 300 };
  assert.equal(save().disabled, false); (save().onClick as () => void)();
  assert.deepEqual(output, { width: 900, height: 1200 }); assert.equal(confirmed, 1);
  states[5] = false; choose("원본"); states[0] = { width: 168.75, height: 300 };
  (save().onClick as () => void)();
  assert.deepEqual(output, { width: 675, height: 1200 }); assert.equal(confirmed, 2);
});
