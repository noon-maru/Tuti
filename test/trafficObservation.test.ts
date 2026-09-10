import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTrafficRequest,
  normalizeTrafficPath,
} from "../src/server/security/trafficObservation";
import {
  createTrafficIdentity,
  isTrafficSecurityActive,
  matchesTrafficIdentity,
  summarizeUserAgent,
} from "../src/server/security/trafficSecurity";

test("브라우저 탐색 요청을 사람 가능성이 높은 신호로 분류한다", () => {
  const result = classifyTrafficRequest(
    new Request("https://tuti.today/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
      },
    }),
  );

  assert.equal(result.kind, "likely_human");
  assert.equal(result.signal, "browser_request");
  assert.equal(result.riskLevel, "normal");
});

test("검색봇과 자동화 도구를 사람 추정 요청과 분리한다", () => {
  const crawler = classifyTrafficRequest(
    new Request("https://tuti.today/robots.txt", {
      headers: { "user-agent": "Googlebot/2.1" },
    }),
  );
  const automation = classifyTrafficRequest(
    new Request("https://tuti.today/api/places", {
      headers: { "user-agent": "curl/8.7.1" },
    }),
  );

  assert.equal(crawler.kind, "declared_bot");
  assert.equal(automation.kind, "automation");
  assert.equal(automation.riskLevel, "low");
});

test("취약 경로 탐색과 요청 제한을 보안 신호로 분류한다", () => {
  const scanner = classifyTrafficRequest(
    new Request("https://tuti.today/.env", {
      headers: { "user-agent": "Mozilla/5.0" },
    }),
  );
  const limited = classifyTrafficRequest(
    new Request("https://tuti.today/api/recommendations", {
      method: "POST",
      headers: {
        "user-agent": "Mozilla/5.0 Chrome/140 Safari/537.36",
        "sec-fetch-site": "same-origin",
      },
    }),
    { rateLimited: true },
  );

  assert.equal(scanner.signal, "scanner_path");
  assert.equal(scanner.riskLevel, "high");
  assert.equal(limited.signal, "rate_limited");
  assert.equal(limited.riskLevel, "medium");
});

test("공개 링크와 긴 식별자를 집계 가능한 경로로 치환한다", () => {
  assert.equal(normalizeTrafficPath("/shared/very-long-public-identifier"), "/shared/:publicId");
  assert.equal(
    normalizeTrafficPath("/api/journal-entries/58e17ca6-847d-49d0-a1ef-f0ba183f14d7"),
    "/api/journal-entries/:id",
  );
});

test("가명 트래픽 식별과 차단은 2026년 10월 10일 한국시간부터 시작한다", () => {
  assert.equal(
    isTrafficSecurityActive(new Date("2026-10-09T14:59:59.999Z"), "true"),
    false,
  );
  assert.equal(
    isTrafficSecurityActive(new Date("2026-10-09T15:00:00.000Z"), "true"),
    true,
  );
  assert.equal(
    isTrafficSecurityActive(new Date("2026-10-10T00:00:00.000Z"), "false"),
    false,
  );
});

test("원본 주소와 User-Agent 대신 안정 HMAC과 마스킹 요약을 만든다", () => {
  const previousSecret = process.env.TRAFFIC_SECURITY_HMAC_SECRET;
  process.env.TRAFFIC_SECURITY_HMAC_SECRET = "traffic-security-test-secret-with-32-characters";
  try {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.42",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    });
    const first = createTrafficIdentity({ headers });
    const second = createTrafficIdentity({ headers });

    assert.equal(first.actorKey, second.actorKey);
    assert.equal(first.addressPreview, "203.0.113.*");
    assert.equal(first.agentSummary, "Chrome · macOS");
    assert.equal(first.actorKey.includes("203.0.113.42"), false);
    assert.equal(first.actorKey.length, 64);
    assert.equal(summarizeUserAgent("curl/8.7.1"), "curl 자동화 도구");
    assert.equal(
      matchesTrafficIdentity(
        { scope: "actor", subjectKey: first.actorKey },
        first,
      ),
      true,
    );
    assert.equal(
      matchesTrafficIdentity(
        { scope: "address", subjectKey: first.addressKey! },
        first,
      ),
      true,
    );
    assert.equal(
      matchesTrafficIdentity(
        { scope: "address", subjectKey: "different-address" },
        first,
      ),
      false,
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.TRAFFIC_SECURITY_HMAC_SECRET;
    } else {
      process.env.TRAFFIC_SECURITY_HMAC_SECRET = previousSecret;
    }
  }
});
