import assert from "node:assert/strict";
import test from "node:test";
import {
  getPersonalizationMode,
  isUserAiProfilingEnabled,
} from "../src/server/personalization/config";
import { isJournalPublicationEnabled } from "../src/shared/features/release";

test("출시 기본값은 사용자 AI 프로파일링과 공개 링크를 차단한다", () => {
  assert.equal(isUserAiProfilingEnabled(undefined), false);
  assert.equal(isJournalPublicationEnabled(undefined), false);
  assert.equal(getPersonalizationMode(undefined), "off");
});

test("개인화 shadow와 공개 링크는 명시적으로 켠 경우에만 활성화한다", () => {
  assert.equal(isUserAiProfilingEnabled("true"), true);
  assert.equal(isUserAiProfilingEnabled("TRUE "), true);
  assert.equal(isJournalPublicationEnabled("true"), true);
  assert.equal(getPersonalizationMode("shadow"), "shadow");
  assert.equal(getPersonalizationMode("active"), "active");
  assert.equal(getPersonalizationMode("unexpected"), "off");
});
