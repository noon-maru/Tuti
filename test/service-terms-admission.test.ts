import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, type NextFetchEvent } from "next/server";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "true";
process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "true";
process.env.TRAFFIC_SECURITY_ENABLED = "false";
process.env.LOCATION_AUDIT_HMAC_SECRET = "admission-test-only-audit-secret-at-least-32-characters";
const document = { title: "이용약관", summary: "새 이용계약 안내", importantTerms: ["기록의 권리는 작성자에게 있습니다."], sections: [{ title: "이용", paragraphs: ["기록과 기록집 이용"] }] };
let current = true;
let failLookup = false;
let accepted = false;
let receiptHash = "";
let currentHash = "";
const database = {
  trafficObservation: { upsert: async () => ({}) },
  user: { findUnique: async () => ({ id: "subject", role: "user", lastAccessedAt: new Date(), authIdentities: [] }) },
  serviceTermsRelease: { findFirst: async ({ where }: { where: { effectiveAt: { lte?: Date } } }) => {
    if (failLookup) throw new Error("simulated lookup failure");
    return current && where.effectiveAt.lte ? { version: "2026-10-22", document, documentHash: currentHash, publishedAt: new Date("2026-10-22"), effectiveAt: new Date("2026-10-22") } : null;
  } },
  serviceTermsAcceptance: { findMany: async () => accepted ? [{ termsVersion: "2026-10-22", documentHash: receiptHash, ageConfirmed: true, importantTermsConfirmed: true }] : [] },
};
(globalThis as { prisma?: unknown }).prisma = database;
const { hashServiceTerms } = await import("@/server/legal/serviceTerms");
const { proxy } = await import("@/proxy");
currentHash = hashServiceTerms(document);
receiptHash = currentHash;
const modern = { "X-Tuti-Client-Protocol": CLIENT_PROTOCOL, "X-Tuti-Client-Platform": "web" };
const session = { ...modern, Authorization: `Bearer ${"a".repeat(40)}` };

test("실제 프록시에서 일반 이용은 서버 영수증을 요구하고 복구·권리 경로는 분리한다", async t => {
  const invoke = async (path: string, headers: HeadersInit, method = "GET", body?: unknown) => {
    const pending: Promise<unknown>[] = [];
    const response = await proxy(new NextRequest(`https://tuti.today${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as NextFetchEvent);
    await Promise.all(pending);
    return response;
  };
  await t.test("구버전은 426, 새 헤더만 있는 무인증 호출은 401, 준비 세션만 있으면 428", async () => {
    assert.equal((await invoke("/api/places/search", {})).status, 426);
    assert.equal((await invoke("/api/places/search", modern)).status, 401);
    for (const path of ["/api/recommendations", "/api/recommendation-regions", "/api/places/id/detail", "/api/places/id/accommodations"]) {
      const response = await invoke(path, session);
      assert.equal(response.status, 428, path);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  });
  await t.test("세션 준비·동의 저장·기존 자료·철회·문의·계정 복구는 각 API의 기존 통제로 넘긴다", async () => {
    for (const [path, method, headers, body] of [
      ["/api/anonymous-session", "POST", modern, undefined],
      ["/api/service-terms", "POST", {}, {}],
      ["/api/auth/email/verify-code", "POST", modern, {}],
      ["/api/journal-entries", "GET", {}, undefined],
      ["/api/account", "DELETE", {}, {}],
      ["/api/location-consent", "POST", {}, { status: "withdrawn" }],
      ["/api/inquiries", "POST", {}, {}],
      ["/api/journal-entries/id/publication", "PATCH", {}, { published: false }],
    ] as const) assert.equal((await invoke(path, headers, method, body)).headers.get("x-middleware-next"), "1", path);
  });
  await t.test("유효한 영수증만 통과하고 문서 변경·시행 문서 누락·조회 장애는 자동 통과하지 않는다", async () => {
    accepted = true;
    assert.equal((await invoke("/api/places/search", session)).headers.get("x-middleware-next"), "1");
    receiptHash = "old-hash";
    assert.equal((await invoke("/api/places/search", session)).status, 428);
    receiptHash = currentHash;
    current = false;
    assert.equal((await invoke("/api/places/search", session)).status, 503);
    current = true;
    failLookup = true;
    assert.equal((await invoke("/api/places/search", session)).status, 503);
  });
});
