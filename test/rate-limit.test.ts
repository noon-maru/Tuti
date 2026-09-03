import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeRateLimit,
  getJournalPublicationIpRateLimitPolicy,
  resetRateLimitsForTest,
  selectApiRateLimitPolicy,
} from "../src/server/http/rateLimit";

test("health와 preflight 요청은 요청 제한에서 제외한다", () => {
  assert.equal(selectApiRateLimitPolicy("/api/health", "GET"), null);
  assert.equal(selectApiRateLimitPolicy("/api/recommendations", "OPTIONS"), null);
});

test("비용이 큰 API에 별도 정책을 적용한다", () => {
  assert.equal(
    selectApiRateLimitPolicy("/api/recommendations", "POST")?.id,
    "recommendation",
  );
  assert.equal(
    selectApiRateLimitPolicy("/api/places/example/departure-plan", "POST")?.id,
    "route-planning",
  );
  assert.equal(
    selectApiRateLimitPolicy("/api/journal-entry-images/example", "PATCH")?.id,
    "image-mutation",
  );
  assert.equal(
    selectApiRateLimitPolicy(
      "/api/journal-entries/example/publication",
      "PATCH",
    )?.id,
    "journal-publication",
  );
  assert.deepEqual(getJournalPublicationIpRateLimitPolicy(), {
    id: "journal-publication-ip",
    limit: 24,
    windowMs: 60 * 60_000,
  });
  assert.equal(
    selectApiRateLimitPolicy("/api/journal-author-blocks", "POST")?.id,
    "user-submission",
  );
});

test("고정 시간창의 허용량과 재시도 시간을 계산한다", () => {
  resetRateLimitsForTest();
  const policy = { id: "test", limit: 2, windowMs: 1_000 };

  assert.equal(consumeRateLimit("subject", policy, 1_000).allowed, true);
  assert.equal(consumeRateLimit("subject", policy, 1_100).allowed, true);
  const blocked = consumeRateLimit("subject", policy, 1_200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(consumeRateLimit("subject", policy, 2_001).allowed, true);
});
