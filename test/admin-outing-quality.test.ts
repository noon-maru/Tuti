import assert from "node:assert/strict";
import test from "node:test";
const now = new Date("2026-11-18T10:00:00Z");
let page = 0, readonly = false;
const row = (id: string) => ({ id, name: "동네 공원", image: "", source: "tourapi", sourceContentType: "12", sourceSidoName: "서울", sourceSigunguName: "종로구", visibilityOverride: "auto", candidateOverride: "auto", dogCatalog: { status: "ready" }, dogAccess: null, petSources: [{ fetchedAt: now }], tourismSourceRecord: { rawPayload: {}, detailRecord: { overview: "산책하는 공원" } } });
(globalThis as { prisma?: unknown }).prisma = { $transaction: async (work: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
  assert.equal(options.isolationLevel, "RepeatableRead"); page = 0;
  return work({ $executeRaw: async (sql: TemplateStringsArray) => { assert.equal(sql.join(""), "SET TRANSACTION READ ONLY"); readonly = true; }, place: { findMany: async (args: { take: number; select: Record<string, unknown> }) => {
    assert.equal(args.take, 500); assert.equal("journalEntries" in args.select, false);
    if (page++) return [];
    return [...Array.from({ length: 12 }, (_, i) => row(`p-${i}`)), { ...row("hidden"), visibilityOverride: "hide" }, { ...row("shop"), sourceContentType: "38", name: "테스트약국" }];
  } } });
} };
const { readOutingQuality } = await import("../src/server/admin/outingQuality");
const { GET } = await import("../src/app/api/admin/outing-quality/route");
test("품질 API는 다른 출처와 미인증 사용자의 접근을 차단한다", async () => {
  assert.equal((await GET(new Request("https://tuti.today/api/admin/outing-quality", { headers: { Origin: "https://other.test" } }))).status, 403);
  assert.equal((await GET(new Request("https://tuti.today/api/admin/outing-quality", { headers: { Origin: "https://tuti.today" } }))).status, 401);
});
test("나들이 품질은 등록·기본 후보·표준 목적지를 분리하고 전체 건수와 제한된 예시를 반환한다", async () => {
  const data = await readOutingQuality(now);
  assert.equal(readonly, true); assert.equal(data.registered, 14); assert.equal(data.ready, 13); assert.equal(data.destinations, 12);
  assert.equal(data.regions[0].destinations, 12);
  const missingPhoto = data.issues.find(i => i.kind === "대표 사진 없음")!;
  assert.equal(missingPhoto.count, 13); assert.equal(missingPhoto.samples.length, 10);
  assert.equal(data.issues.find(i => i.kind === "공식 등록 · 방문 전 조건 확인")?.count, 13);
  assert.ok(!JSON.stringify(data).includes("rawPayload"));
});
