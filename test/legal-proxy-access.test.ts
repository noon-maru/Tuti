import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, type NextFetchEvent } from "next/server";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.TRAFFIC_SECURITY_HMAC_SECRET = "proxy-security-test-secret-with-32-characters";
process.env.LOCATION_AUDIT_HMAC_SECRET = "proxy-observation-test-secret-with-32-characters";
process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "false";
process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "false";
process.env.TRAFFIC_SECURITY_ENABLED = "true";
let blockedAddress = "";
let ruleQueries = 0;
(globalThis as { prisma?: unknown }).prisma = {
  trafficBlockRule: { findMany: async () => { ruleQueries++; return [{ id: "rule", scope: "address", subjectKey: blockedAddress, expiresAt: null }]; } },
  trafficObservation: { upsert: async () => ({}) },
};
const { proxy } = await import("@/proxy");
const { createTrafficIdentity, invalidateTrafficBlockCache } = await import("@/server/security/trafficSecurity");
const { resetRateLimitsForTest } = await import("@/server/http/rateLimit");
const headers = { "cf-connecting-ip": "203.0.113.42", "user-agent": "legal-proxy-test", Origin: "https://tuti.today", "Content-Type": "application/json", "X-Tuti-Client-Protocol": CLIENT_PROTOCOL, "X-Tuti-Client-Platform": "web" };

test("실제 프록시에서 차단된 주소의 권리 요청은 API로 넘기되 새 이용 차단·요청 제한은 유지한다", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T00:00:00Z").getTime() });
  t.after(() => { resetRateLimitsForTest(); invalidateTrafficBlockCache(); });
  blockedAddress = createTrafficIdentity({ headers: new Headers(headers) }).addressKey!;
  const invoke = async (path: string, method = "POST", body?: unknown) => {
    const pending: Promise<unknown>[] = [];
    const request = new NextRequest(`https://tuti.today${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = await proxy(request, { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as NextFetchEvent);
    await Promise.all(pending);
    return response;
  };
  await t.test("구버전 요청은 일반 API 처리와 DB 차단 조회 전에 거절한다", async () => {
    const oldHeaders = new Headers(headers);
    oldHeaders.delete("X-Tuti-Client-Protocol");
    const before = ruleQueries;
    const request = new NextRequest("https://tuti.today/api/anonymous-session", { method: "POST", headers: oldHeaders });
    const response = await proxy(request, { waitUntil: () => { throw new Error("구버전은 백그라운드 처리도 시작하지 않는다"); } } as unknown as NextFetchEvent);
    assert.equal(response.status, 426);
    assert.equal((await response.json()).code, "client_update_required");
    assert.equal(ruleQueries, before);
  });
  await t.test("차단이 실제로 일치하는 새 추천·공개 요청은 거절한다", async () => {
    for (const [path, method, body] of [
      ["/api/recommendations", "POST", {}],
      ["/api/journal-entries/entry/publication", "PATCH", { published: true }],
      ["/api/account", "PATCH", { displayName: "test" }],
    ] as const) {
      const response = await invoke(path, method, body);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "security_blocked");
    }
    assert.ok(ruleQueries > 0);
  });
  await t.test("철회·삭제·신고·공개 중지는 IP 차단으로 막지 않고 실제 처리 API에 넘긴다", async () => {
    const before = ruleQueries;
    for (const [path, method, body] of [
      ["/api/location-consent", "POST", { status: "withdrawn" }],
      ["/api/public/legal-notices", "GET", undefined],
      ["/api/account", "DELETE", { confirmed: true }],
      ["/api/journal-entries/entry", "DELETE", undefined],
      ["/api/harumadi-pdfs/harumadiPdf", "DELETE", undefined],
      ["/api/reports", "POST", {}],
      ["/api/journal-entries/entry/publication", "PATCH", { published: false }],
    ] as const) {
      resetRateLimitsForTest();
      const response = await invoke(path, method, body);
      assert.equal(response.headers.get("x-middleware-next"), "1", `${method} ${path}`);
    }
    assert.equal(ruleQueries, before);
  });
  await t.test("권리 행사 예외에도 신고 접수의 요청 횟수 제한은 작동한다", async () => {
    resetRateLimitsForTest();
    for (let index = 0; index < 10; index++) assert.equal((await invoke("/api/reports")).headers.get("x-middleware-next"), "1");
    const limited = await invoke("/api/reports");
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "rate_limited");
  });
});
