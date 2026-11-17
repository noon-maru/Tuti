import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecommendationErrorKind,
  RecommendationRequestError,
  requestRecommendationResponse,
  shouldRetryRecommendation,
} from "@/lib/api/recommendationError";
import { getEmptyRecommendation, getRecommendationFailure } from "@/features/tuti/lib/recommendationFailure";
import type { RecommendationErrorCode } from "@/shared/api/recommendations";
import { readFileSync } from "node:fs";

test("전송 실패는 네트워크 오류로 구분하고 원인을 모르는 예외는 보존한다", async () => {
  await assert.rejects(
    requestRecommendationResponse(async () => { throw new TypeError("Failed to fetch"); }),
    (error: unknown) => getRecommendationErrorKind(error) === "network",
  );
  const unknown = new Error("session preparation failed");
  await assert.rejects(
    requestRecommendationResponse(async () => { throw unknown; }),
    (error: unknown) => error === unknown,
  );
  assert.equal(getRecommendationErrorKind(unknown), "unknown");
  assert.equal(getRecommendationErrorKind(new TypeError("UI bug")), "unknown");
});

test("HTTP 응답은 전송 오류와 구분하고 HTML 502도 서버 오류로 안내한다", async () => {
  const response = new Response("Bad gateway", { status: 502 });
  assert.equal(await requestRecommendationResponse(async () => response), response);
  for (const status of [500, 502, 503, 504]) {
    assert.equal(getRecommendationErrorKind(new RecommendationRequestError("오류", status)), "server");
  }
});

test("위치·지역·동의 오류는 상태 코드가 달라도 위치 확인으로 연결한다", () => {
  const codes: RecommendationErrorCode[] = [
    "recommendation_location_required", "recommendation_location_invalid",
    "recommendation_region_invalid", "location_consent_required",
    "location_consent_outdated", "long_distance_location_required",
  ];
  for (const code of codes) {
    const kind = getRecommendationErrorKind(new RecommendationRequestError("오류", 409, code));
    assert.equal(kind, "location");
    assert.equal(getRecommendationFailure(kind, code).primary.action, "location");
  }
  assert.equal(getRecommendationErrorKind(
    new RecommendationRequestError("기록 실패", 503, "location_consent_record_failed"),
  ), "server");
});

test("네트워크·서버 오류에서 불필요한 위치 변경을 유도하지 않는다", () => {
  for (const kind of ["network", "server"] as const) {
    const failure = getRecommendationFailure(kind);
    assert.equal(failure.primary.action, "retry");
    assert.equal(failure.secondary, undefined);
  }
  assert.match(getRecommendationFailure("network").message, /인터넷 연결/);
  assert.match(getRecommendationFailure("server").message, /잠시 후/);
});

test("먼 거리 추천 후보 부족은 503이어도 장애가 아닌 조건 변경으로 안내한다", () => {
  const error = new RecommendationRequestError("후보 없음", 503, "long_distance_unavailable");
  assert.equal(getRecommendationErrorKind(error), "unknown");
  const failure = getRecommendationFailure(getRecommendationErrorKind(error), error.code);
  assert.equal(failure.primary.action, "restart");
  assert.equal(failure.secondary?.action, "retry");
  assert.match(failure.message, /여유|가까운/);
});

test("알 수 없는 코드·400·401·403·429는 임의로 위치나 네트워크 오류로 단정하지 않는다", () => {
  for (const status of [400, 401, 403, 409, 429]) {
    assert.equal(getRecommendationErrorKind(new RecommendationRequestError("오류", status)), "unknown");
  }
  const failure = getRecommendationFailure();
  assert.equal(failure.primary.action, "retry");
  assert.equal(failure.secondary?.action, "restart");
});

test("동반 카탈로그 미준비는 조건 변경 대신 수동 재확인으로 안내하고 자동 재시도하지 않는다", () => {
  const error = new RecommendationRequestError("준비 중", 503, "dog_catalog_not_ready");
  const failure = getRecommendationFailure(getRecommendationErrorKind(error), error.code);
  assert.match(failure.title, /동반 장소 안내/);
  assert.match(failure.message, /조건의 문제가 아니/);
  assert.equal(failure.primary.action, "retry");
  assert.equal(failure.secondary, undefined);
  assert.equal(shouldRetryRecommendation(0, error), false);
});

test("빈 후보는 실제 장소 부재로 단정하지 않으며 사라진 분위기 질문으로 안내하지 않는다", () => {
  assert.match(getEmptyRecommendation({ petCompanion: "dog" }).message, /단정할 수는 없/);
  for (const answers of [{ petCompanion: "dog" as const }, { budget: "free" as const }, { movement: "near" as const }, {}]) {
    assert.doesNotMatch(getEmptyRecommendation(answers).message, /분위기|공기/);
  }
  const screen = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  assert.match(screen, /!recommendationError && onRefreshFromCurrentLocation &&[\s\S]*?disabled=\{refreshingRecommendations\} onClick=\{onRefreshFromCurrentLocation\}/);
  assert.match(screen, /이 조건으로 다시 찾기/);
});
