import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
type Consent = { id: string; userId: string; subjectKey: string; status: string; termsVersion: string; ageConfirmed: boolean; createdAt: Date };
let consents: Consent[] = [];
let logs: Array<Record<string, unknown>> = [];
let runs = [{ id: "located", locationUsed: true }, { id: "region", locationUsed: false }];
let routeMetadata: unknown = { distanceMeters: 1234, durationSeconds: 300 };
let failPurge = false;
const calls: string[] = [];
const database = {
  $queryRaw: async () => { calls.push("lock"); return [{ id: "subject" }]; },
  locationConsentEvent: {
    findFirst: async () => consents.at(-1) ?? null,
    create: async ({ data }: { data: Consent }) => {
      const consent = { ...data };
      consents.push(consent);
      return consent;
    },
    deleteMany: async ({ where }: { where: { id?: { not: string } } }) => {
      consents = consents.filter((consent) => consent.id === where.id?.not);
    },
    count: async ({ where }: { where: { id?: { not: string } } }) => consents.filter((consent) => consent.id !== where.id?.not).length,
  },
  locationUsageLog: {
    count: async () => logs.length,
    create: async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); },
    deleteMany: async () => {
      if (failPurge) throw new Error("purge failed");
      logs = [];
    },
  },
  recommendationRun: {
    count: async () => runs.filter((run) => run.locationUsed).length,
    deleteMany: async ({ where }: { where: { userId: string; locationUsed: boolean } }) => {
      assert.deepEqual(where, { userId: user.id, locationUsed: true });
      runs = runs.filter((run) => !run.locationUsed);
    },
  },
  recommendationAction: {
    count: async () => routeMetadata === null ? 0 : 1,
    updateMany: async () => { routeMetadata = null; },
  },
};
const fakePrisma = {
  ...database,
  $transaction: async (operation: (transaction: typeof database) => Promise<unknown>) => {
    const before = { consents: [...consents], logs: [...logs], runs: [...runs], routeMetadata };
    try { return await operation(database); }
    catch (error) { consents = before.consents; logs = before.logs; runs = before.runs; routeMetadata = before.routeMetadata; throw error; }
  },
};
(globalThis as { prisma?: unknown }).prisma = fakePrisma;
const { recordLocationConsent, runWithLocationUsage, recordExternalLocationTransfer, purgeWithdrawnLocationSubject } = await import("@/server/location/compliance");
const { LOCATION_TERMS_VERSION } = await import("@/shared/location/terms");
const user = { id: "subject", role: "user" as const };
function consent(status: "accepted" | "withdrawn" | "paused", version = LOCATION_TERMS_VERSION) {
  return recordLocationConsent({ user, status, termsVersion: version, ageConfirmed: status === "accepted", clientPlatform: "web" });
}

test("위치 동의 철회와 경쟁 요청을 안전하게 처리한다", async (t) => {
  await t.test("동의 저장과 이용 로그는 사용자 잠금을 먼저 잡는다", async () => {
    const accepted = await consent("accepted");
    await runWithLocationUsage({ user, consent: accepted, acquisitionSource: "device", service: "recommendation", method: "test", operation: async () => "ok" });
    assert.equal(logs.length, 1);
    assert.equal(calls.filter((call) => call === "lock").length, 2);
  });
  await t.test("구버전 앱의 철회도 허용하고 확인자료·과거 동의를 파기한다", async () => {
    const withdrawn = await consent("withdrawn", "old-version");
    assert.equal(withdrawn.status, "withdrawn");
    assert.equal(logs.length, 0);
    assert.deepEqual(consents.map((entry) => entry.status), ["withdrawn"]);
    assert.deepEqual(runs.map((run) => run.id), ["region"]);
    assert.equal(routeMetadata, null);
    await consent("withdrawn", "old-version");
    assert.equal(consents.length, 1);
  });
  await t.test("철회 이전에 획득한 동의로는 기록을 다시 만들지 않는다", async () => {
    const accepted = await consent("accepted");
    await consent("withdrawn");
    let ran = false;
    await assert.rejects(runWithLocationUsage({ user, consent: accepted, acquisitionSource: "device", service: "recommendation", method: "test", operation: async () => { ran = true; } }), { code: "location_consent_required" });
    assert.equal(ran, false);
    assert.equal(logs.length, 0);
  });
  await t.test("작업 중 철회되면 후속 외부 전송 승인을 거절한다", async () => {
    const accepted = await consent("accepted");
    await assert.rejects(runWithLocationUsage({ user, consent: accepted, acquisitionSource: "device", service: "travel_time", method: "test", operation: async () => {
      await consent("withdrawn");
      await assert.rejects(recordExternalLocationTransfer({ recipient: "Kakao", purpose: "test", method: "test", mode: "processor" }), { code: "location_consent_required" });
    } }), { code: "location_consent_required" });
    assert.equal(logs.length, 0);
  });
  await t.test("일시 중지는 자료를 파기하지 않고 연령 확인을 유지한다", async () => {
    const accepted = await consent("accepted");
    await runWithLocationUsage({ user, consent: accepted, acquisitionSource: "device", service: "recommendation", method: "test", operation: async () => null });
    const paused = await consent("paused");
    assert.equal(paused.ageConfirmed, true);
    assert.equal(logs.length, 1);
  });
  await t.test("파기 실패를 성공으로 응답하지 않으며 구버전 동의는 거부한다", async (t) => {
    t.mock.method(console, "error", () => {});
    failPurge = true;
    await assert.rejects(consent("withdrawn"), { code: "location_consent_record_failed" });
    assert.equal(consents.at(-1)?.status, "paused");
    assert.equal(logs.length, 1);
    failPurge = false;
    await assert.rejects(consent("accepted", "old-version"), { code: "location_consent_outdated" });
  });
  await t.test("기존 철회 잔존자료는 dry-run 확인 후 정리하고 재동의자는 건너뛴다", async () => {
    const accepted = await consent("accepted");
    assert.equal((await purgeWithdrawnLocationSubject(user.id, true)).skipped, true);
    await consent("withdrawn");
    // 수정 전 남아 있던 자료를 재현한다.
    consents.unshift({ ...accepted, userId: user.id, subjectKey: "legacy-key" });
    logs.push({ userId: user.id });
    const inspection = await purgeWithdrawnLocationSubject(user.id);
    assert.deepEqual(inspection, { skipped: false, usageLogs: 1, consentEvents: 1, recommendationRuns: 0, routeMetadata: 0 });
    assert.equal(logs.length, 1);
    await purgeWithdrawnLocationSubject(user.id, true);
    assert.equal(logs.length, 0);
    assert.deepEqual(consents.map((entry) => entry.status), ["withdrawn"]);
  });
});
