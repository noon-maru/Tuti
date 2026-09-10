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

test("기록집 단계 도달과 이탈·완성·저장 활동을 허용한다", () => {
  for (const action of [
    "journal_book_entered",
    "journal_book_selection_viewed",
    "journal_book_details_viewed",
    "journal_book_preview_viewed",
    "journal_book_selection_exited",
    "journal_book_details_exited",
    "journal_book_preview_exited",
    "journal_book_completed",
    "journal_book_saved",
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
