import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductActivityInput } from "../src/shared/api/productActivity";

test("허용한 제품 활동과 최소 실행 환경만 정규화한다", () => {
  assert.deepEqual(
    normalizeProductActivityInput({
      clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
      action: "entry_completed",
      platform: "android",
      appVersion: "0.4.0 (7)",
      ipAddress: "192.0.2.1",
      userAgent: "should-not-be-retained",
    }),
    {
      clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
      action: "entry_completed",
      platform: "android",
      appVersion: "0.4.0 (7)",
    },
  );
});

test("임의 활동과 유효하지 않은 세션 식별자를 거부한다", () => {
  assert.equal(
    normalizeProductActivityInput({
      clientSessionId: "not-a-session",
      action: "page_text_copied",
      platform: "web",
    }),
    null,
  );
});

test("하루마디 단계 도달과 이탈·완성·저장 활동을 허용한다", () => {
  for (const action of [
    "harumadi_entered",
    "harumadi_selection_viewed",
    "harumadi_details_viewed",
    "harumadi_preview_viewed",
    "harumadi_selection_exited",
    "harumadi_details_exited",
    "harumadi_preview_exited",
    "harumadi_completed",
    "harumadi_saved",
  ]) {
    assert.equal(
      normalizeProductActivityInput({
        clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
        action,
        platform: "web",
      })?.action,
      action,
    );
  }
});

test("가벼운 로그인 권유의 노출과 선택 활동을 허용한다", () => {
  for (const action of ["login_nudge_shown", "login_nudge_opened"]) {
    assert.equal(
      normalizeProductActivityInput({
        clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
        action,
        platform: "ios",
      })?.action,
      action,
    );
  }
});
