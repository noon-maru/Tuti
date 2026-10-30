import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HarumadiDeleteSection } from "@/features/tuti/components/HarumadiDeleteSection";

test("삭제는 일반 설정과 분리된 주의 영역에서 범위와 복구 불가를 안내한다", () => {
  let called = false;
  const html = renderToStaticMarkup(createElement(HarumadiDeleteSection, { disabled: false, onDelete: () => { called = true; } }));
  assert.match(html, /<section[^>]*aria-labelledby=/);
  assert.match(html, /삭제 전 확인해주세요/);
  assert.match(html, /하루마디 틀은 삭제하면 되돌릴 수 없어요/);
  assert.match(html, /담았던 원본 마디와 저장한 PDF는 남아요/);
  assert.match(html, /하루마디 틀 삭제/);
  assert.match(html, /border:1px solid #f0cec9/);
  assert.match(html, /background:#fff8f6/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /<button[^>]*type="button"/);
  assert.equal(called, false, "표시만으로 삭제를 실행하지 않는다");
});

test("저장·읽기 전용 상태에는 삭제를 막고 기존 삭제 확인 절차를 유지한다", () => {
  const html = renderToStaticMarkup(createElement(HarumadiDeleteSection, { disabled: true, onDelete() {} }));
  assert.match(html, /<button[^>]*disabled/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /harumadi && <HarumadiDeleteSection disabled=\{busy \|\| readOnly\} onDelete=\{\(\) => void remove\(\)\}/);
  assert.match(flow, /if \(!harumadi \|\| readOnly \|\| busy \|\| !\(await confirmAction/);
  assert.match(flow, /이 작업은 되돌릴 수 없어요/);
  assert.match(flow, /await deleteHarumadi\(owner, harumadi.id\)/);
  assert.doesNotMatch(flow, /<Quiet[^>]*onClick=\{\(\) => void remove\(\)\}/);
});
