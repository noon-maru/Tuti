import assert from "node:assert/strict";
import test from "node:test";
import documents from "../src/shared/legal/finalizedDocuments.json";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "true";
process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "true";
delete process.env.TUTI_LEGAL_POLICY_RELEASE;
const finalized = documents["service-terms"];
let accepted = true, validSession = true, corruptDocument = false;
const lookups: string[] = [];
const release = () => ({ version: finalized.version, documentHash: finalized.documentHash,
  document: corruptDocument ? { ...finalized.document, summary: "다른 원문" } : finalized.document,
  publishedAt: new Date("2026-10-22T00:00:00Z"), effectiveAt: new Date("2026-10-22T00:00:00Z") });
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => validSession ? { id: "reviewer", role: "user", displayName: null, authIdentities: [], lastAccessedAt: new Date() } : null },
  userSession: { findUnique: async () => null },
  serviceTermsRelease: { findFirst: async ({ where }: { where: { effectiveAt: { gt?: Date } } }) => {
    lookups.push(where.effectiveAt.gt ? "upcoming" : "current");
    return where.effectiveAt.gt ? null : release();
  } },
  serviceTermsAcceptance: { findMany: async () => accepted ? [{ termsVersion: finalized.version, documentHash: finalized.documentHash, ageConfirmed: true, importantTermsConfirmed: true }] : [] },
};
const { GET } = await import("../src/app/api/service-terms/route");
const headers = { Authorization: `Bearer ${"t".repeat(40)}` };

test("진입 조회는 시행 예정 약관을 조회하지 않고 동의 완료 계정에 전문을 전송하지 않는다", async () => {
  const full = await GET(new Request("https://tuti.today/api/service-terms", { headers }));
  const fullText = await full.text();
  assert.deepEqual(lookups, ["current", "upcoming"]);
  lookups.length = 0;
  const compact = await GET(new Request("https://tuti.today/api/service-terms?scope=entry", { headers }));
  const compactText = await compact.text();
  const body = JSON.parse(compactText);
  assert.equal(compact.status, 200);
  assert.equal(body.current.accepted, true);
  assert.equal(body.current.documentHash, finalized.documentHash);
  assert.equal(body.current.document, undefined);
  assert.equal(body.upcoming, null);
  assert.deepEqual(lookups, ["current"]);
  assert.match(compact.headers.get("cache-control")!, /private, no-store/);
  assert.match(compact.headers.get("server-timing")!, /auth;dur=[\d.]+, terms;dur=[\d.]+/);
  assert.ok(Buffer.byteLength(compactText) < Buffer.byteLength(fullText) / 20);
  console.log(JSON.stringify({ fixture: "finalized-terms-response-bytes", full: Buffer.byteLength(fullText), entry: Buffer.byteLength(compactText) }));
});

test("미동의·익명·만료 계정은 동의할 서버 원문을 받고 무조건 통과하지 않는다", async () => {
  const request = () => new Request("https://tuti.today/api/service-terms?scope=entry", { headers });
  accepted = false;
  let body = await (await GET(request())).json();
  assert.equal(body.current.accepted, false);
  assert.deepEqual(body.current.document, finalized.document);
  assert.equal(body.required, true);
  accepted = true;
  validSession = false;
  body = await (await GET(request())).json();
  assert.equal(body.current.accepted, false);
  assert.ok(body.current.document);
  validSession = true;
  body = await (await GET(new Request(request().url))).json();
  assert.equal(body.current.accepted, false);
  assert.ok(body.current.document);
});

test("경량 확인에서도 원문 해시가 다르면 실패하고 외부 출처를 거절한다", async () => {
  corruptDocument = true;
  assert.equal((await GET(new Request("https://tuti.today/api/service-terms?scope=entry", { headers }))).status, 503);
  corruptDocument = false;
  assert.equal((await GET(new Request("https://tuti.today/api/service-terms?scope=entry", { headers: { Origin: "https://untrusted.invalid" } }))).status, 403);
});
