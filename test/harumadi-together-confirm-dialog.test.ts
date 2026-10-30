import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TogetherConfirmationContent, type TogetherConfirmationAction } from "@/features/tuti/components/HarumadiTogetherConfirmDialog";

test("네 가지 공동작성 확인은 작업별 문구와 원본·PDF 보존 안내를 같은 앱 모달에 표시한다", () => {
  const actions: TogetherConfirmationAction[] = ["end-together", "remove-member", "leave", "remove-entry"];
  for (const action of actions) {
    let called = false;
    const html = renderToStaticMarkup(createElement(TogetherConfirmationContent, { action, busy: false, idPrefix: "confirm-test", onCancel() {}, onConfirm() { called = true; } }));
    assert.match(html, /id="confirm-test-title"/);
    assert.match(html, /id="confirm-test-description"/);
    assert.match(html, /원본 마디/);
    assert.match(html, /저장한 PDF/);
    assert.match(html, />취소<\/button>/);
    assert.equal(called, false, "확인 화면을 여는 것만으로 요청하지 않는다");
  }
});

test("요청 중 중복 확인·취소를 비활성화하고 실패는 모달 안에 안내한다", () => {
  const html = renderToStaticMarkup(createElement(TogetherConfirmationContent, { action: "end-together", busy: true, idPrefix: "confirm-test", error: "연결을 확인해주세요.", onCancel() {}, onConfirm() {} }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /처리하고 있어요…/);
  assert.match(html, /role="alert"[^>]*>연결을 확인해주세요\./);
});

test("모달은 목업 영역 안에 놓고 배경·포커스·뒤로가기를 독립적으로 처리한다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiTogetherConfirmDialog.tsx", "utf8");
  const panel = readFileSync("src/features/tuti/components/HarumadiTogetherPanel.tsx", "utf8");
  assert.match(source, /querySelector<HTMLElement>\("\[data-app-viewport\]"\)/);
  assert.match(source, /viewport \?\? document.body/);
  assert.match(source, /role="alertdialog" aria-modal="true"/);
  assert.match(source, /node.inert = true/);
  assert.match(source, /node.inert = inert\[index\]/);
  assert.match(source, /cancel.current\?\.focus/);
  assert.match(source, /previous.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /removeEventListener\(ANDROID_BACK_EVENT, back, true\)/);
  assert.match(source, /event.stopImmediatePropagation\(\)/);
  assert.match(panel, /if \(!inFlight.current\) setConfirmation\(null\)/);
  assert.match(panel, /if \(inFlight.current\) return;\s+inFlight.current = true/);
  assert.match(panel, /onConfirm=\{\(\) => void action\(confirmation.action, confirmation.target\)\}/);
  assert.doesNotMatch(panel, /window.confirm/);
});
