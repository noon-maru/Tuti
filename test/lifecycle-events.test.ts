import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleData, recordLifecycle } from "../src/server/analytics/lifecycle";
import { parseLifecycleInput } from "../src/shared/api/lifecycle";
import type { Prisma } from "../src/generated/prisma/client";
import { readObservation } from "../src/server/analytics/readObservation";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";

const id = "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a";
test("새 화면 계측 API도 일반 이용약관 보호 범위에 포함한다", () => {
  assert.equal(requiresServiceTerms("/api/lifecycle", "POST"), true);
  assert.equal(requiresServiceTerms("/api/lifecycle", "OPTIONS"), false);
});
test("관측 요청은 문자열 변환 전에 바이트 제한을 적용하고 비정상 JSON을 거부한다", async () => {
  const request = (body: string) => new Request("https://example.test/lifecycle", { method: "POST", body });
  assert.deepEqual(await readObservation(request('{"name":"home_viewed"}')), { name: "home_viewed" });
  await assert.rejects(readObservation(request("가".repeat(1000))), /OBSERVATION_TOO_LARGE/);
  await assert.rejects(readObservation(request("not-json")));
});
test("클라이언트의 저장 성공 위조·임의 메타데이터·원문은 수집하지 않는다", () => {
  assert.equal(parseLifecycleInput({ id, name: "madi_created" }), null);
  assert.equal(parseLifecycleInput({ id: "bad", name: "home_viewed" }), null);
  assert.deepEqual(parseLifecycleInput({ id, name: "home_viewed", source: "home", platform: "ios", content: "private", token: "secret" }), { id, name: "home_viewed", source: "home", platform: "ios" });
});
test("성공 사건은 180일 보관하며 같은 발생 키의 재전송은 한 건으로 유지한다", async () => {
  const events = new Map();
  const tx = { lifecycleEvent: { createMany: async ({ data }: { data: Array<{ occurrenceKey: string }> }) => { for (const event of data) if (!events.has(event.occurrenceKey)) events.set(event.occurrenceKey, event); } } } as unknown as Prisma.TransactionClient;
  const fact = { name: "madi_created" as const, key: "madi:one", entityId: "one" };
  await recordLifecycle(tx, "owner", fact); await recordLifecycle(tx, "owner", fact);
  assert.equal(events.size, 1);
  const now = new Date("2026-10-30T00:00:00Z"), data = lifecycleData("owner", fact, {}, now);
  assert.equal(data.retentionUntil.getTime() - now.getTime(), 180 * 86_400_000);
  assert.equal(data.source, "unknown");
  assert.equal(data.version, 1);
});
