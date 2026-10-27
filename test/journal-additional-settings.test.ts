import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalAdditionalSettings } from "@/features/tuti/components/JournalAdditionalSettings";
import { canSubmitJournalClassification, SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";

test("보관 기능이 제공될 때만 닫힌 추가 설정을 표시하고 동의를 자동 선택하지 않는다", () => {
  const html = renderToStaticMarkup(createElement(JournalAdditionalSettings, { available: true },
    createElement("p", null, "별도 동의 내용")));
  assert.match(html, /민감정보나 주민등록번호 등은 남기지 말아주세요\./);
  assert.match(html, /<details><summary>추가 설정<\/summary>/);
  assert.doesNotMatch(html, /<details open/);
  assert.match(html, /별도 동의 내용/);
});

test("기존 민감정보 마디는 설정을 펼치고 민감정보 포함 상태를 표시한다", () => {
  const html = renderToStaticMarkup(createElement(JournalAdditionalSettings, {
    available: true, initiallyOpen: true, includesSensitive: true,
  }, "별도 동의"));
  assert.match(html, /<details open="">/);
  assert.match(html, /민감정보 포함/);
});

test("보관 기능이 없거나 확인 전이면 안내만 남기고 추가 설정과 동의 질문은 렌더하지 않는다", () => {
  for (const props of [{}, { available: false }, { available: false, initiallyOpen: true, includesSensitive: true }]) {
    const html = renderToStaticMarkup(createElement(JournalAdditionalSettings, props,
      createElement("p", null, "사진이나 글에 본인의 민감정보가 있나요?")));
    assert.match(html, /민감정보나 주민등록번호 등은 남기지 말아주세요\./);
    assert.doesNotMatch(html, /<details|추가 설정|본인의 민감정보가 있나요/);
  }
});

test("일반 마디는 추가 답변 없이 저장 가능하지만 민감정보는 여전히 명시적 동의가 필요하다", () => {
  const policy = { enabled: true, version: SENSITIVE_JOURNAL_CONSENT_VERSION, privateStorageAvailable: true };
  assert.equal(canSubmitJournalClassification(policy, false, false), true);
  assert.equal(canSubmitJournalClassification(policy, true, false), false);
  assert.equal(canSubmitJournalClassification(policy, true, true), true);
  assert.equal(canSubmitJournalClassification({ ...policy, privateStorageAvailable: false }, true, true), false);
  assert.equal(canSubmitJournalClassification(null, false, false), false);
});

test("첫 작성은 고정 안내만 표시하고 정책 조회 없이 일반 마디로 저장한다", () => {
  const first = readFileSync("src/features/tuti/screens/onboarding/FirstMemoryScreen.tsx", "utf8");
  assert.match(first, /<PrivacyHint>민감정보나 주민등록번호 등은 남기지 말아주세요\.<\/PrivacyHint>/);
  assert.match(first, /onSave\(\{ \.\.\.draft, sensitiveContent: false \}\)/);
  assert.doesNotMatch(first, /JournalAdditionalSettings|fetchSensitiveJournalPolicy|sensitiveReady|sensitiveConsentVersion|SensitiveSection|policyAttempt|policyFailed/);
  assert.match(first, /disabled=\{!draft\}/);
  assert.match(first, /disabled=\{!draft \|\| saving\}/);
});

test("일반 편집은 접힌 설정을 사용하고 기존 민감정보 분류와 별도 동의는 유지한다", () => {
  const editor = readFileSync("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "utf8");
  assert.match(editor, /entry\?\.sensitiveContent \?\? false/);
  assert.match(editor, /initiallyOpen=\{entry\?\.sensitiveContent === true\}/);
  assert.match(editor, /available=\{privateStorageAvailable\}/);
  assert.match(editor, /sensitivePolicy && entry\?\.sensitiveContent && !privateStorageAvailable/);
  assert.doesNotMatch(editor, /민감정보를 안전하게 보관하는 기능을 준비 중/);
  assert.match(editor, /setSensitiveContent\(entry\?\.sensitiveContent \?\? false\)/);
  for (const source of [editor]) {
    assert.match(source, /<JournalAdditionalSettings/);
    assert.match(source, /setSensitiveContent\(false\);\s*setSensitiveAgreed\(false\)/);
    assert.match(source, /sensitiveContent && sensitiveAgreed \? \{ sensitiveConsentVersion: sensitivePolicy.version \}/);
    assert.match(source, /\[선택\] 이 기록의 민감정보 처리에 별도로 동의해요\./);
    assert.doesNotMatch(source, /setSensitiveAgreed\(true\)/);
  }
});
