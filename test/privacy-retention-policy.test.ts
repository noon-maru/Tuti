import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sensitiveJournalData, assertSensitiveJournalReadable, assertJournalBookFreeform, publicSensitiveJournalFilter } from "../src/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "../src/shared/legal/sensitiveJournalPolicy";
import { parseJournalEntryInput } from "../src/server/journal/input";
import { emptyJournalBookDraft, parseJournalBookInput } from "../src/shared/api/journalBook";

const input = { title: "작은 하루", content: "기록", image: null, crowd: "미정", difficulty: "미정", placeName: "남긴 공간", theme: "미정" };
const now = new Date("2026-10-20T00:00:00Z");
let writes = 0;
let lastDelivery: unknown;
const db = {
  pushDevice: { count: async () => 2, deleteMany: async (args: unknown) => {
    assert.deepEqual(args, { where: { OR: [{ enabled: false }, { invalidatedAt: { not: null } }] } });
    writes++; return { count: 2 };
  } },
  pushDelivery: { count: async () => 3, deleteMany: async ({ where }: { where: { createdAt: { lte: Date } } }) => {
    assert.equal(where.createdAt.lte.toISOString(), "2026-09-20T00:00:00.000Z");
    writes++; return { count: 3 };
  }, updateMany: async ({ data }: { data: unknown }) => { assert.deepEqual(data, { entityId: null, errorMessage: null }); writes++; return { count: 4 }; },
  create: async ({ data }: { data: unknown }) => { lastDelivery = data; return data; } },
};
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
(globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (operation: (tx: typeof db) => Promise<unknown>) => operation(db) };
const { purgePushRetention, pushRetentionCutoff } = await import("../src/server/notifications/retention");
const { normalizePushError, recordPushDeliverySafely } = await import("../src/server/notifications/deliveryLog");

test("민감정보는 일반 저장이나 구버전 동의로 승인하지 않는다", () => {
  assert.throws(() => sensitiveJournalData(input, true), /확인/);
  assert.throws(() => sensitiveJournalData({ ...input, sensitiveContent: true }, true), /별도로 동의/);
  assert.throws(() => sensitiveJournalData({ ...input, sensitiveContent: true, sensitiveConsentVersion: "old" }, true), /별도로 동의/);
  assert.throws(() => sensitiveJournalData({ ...input, sensitiveContent: true }, false), /준비 중/);
});

test("별도 선택 동의에는 버전·서버 시각을 남기고 원장 없이 허용하지 않는다", () => {
  const before = process.env.PRIVACY_REPLAY_LEDGER_ENABLED;
  try {
    process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
    const sensitive = { ...input, sensitiveContent: true, sensitiveConsentVersion: SENSITIVE_JOURNAL_CONSENT_VERSION };
    assert.throws(() => sensitiveJournalData(sensitive, true, now), /기록 보호/);
    process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
    assert.deepEqual(sensitiveJournalData(sensitive, true, now), { sensitiveContent: true, sensitiveConsentVersion: SENSITIVE_JOURNAL_CONSENT_VERSION, sensitiveConsentedAt: now });
    assert.deepEqual(sensitiveJournalData({ ...input, sensitiveContent: false }, true, now), { sensitiveContent: false, sensitiveConsentVersion: null, sensitiveConsentedAt: null });
  } finally { if (before === undefined) delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; else process.env.PRIVACY_REPLAY_LEDGER_ENABLED = before; }
});

test("철회된 기록과 미확인 기록은 기록집 재생성에 사용할 수 없다", () => {
  assert.throws(() => assertSensitiveJournalReadable({ sensitiveContent: false, sensitiveConsentVersion: null, sensitiveWithdrawnAt: now }, false));
  assert.throws(() => assertSensitiveJournalReadable({ sensitiveContent: null, sensitiveConsentVersion: null, sensitiveWithdrawnAt: null }, true));
  assert.doesNotThrow(() => assertSensitiveJournalReadable({ sensitiveContent: false, sensitiveConsentVersion: null, sensitiveWithdrawnAt: null }, true));
});

test("입력 파서는 민감정보 여부를 강제 형변환하지 않고 동의 버전을 보존한다", () => {
  assert.equal(parseJournalEntryInput({ ...input, sensitiveContent: "false" }), null);
  assert.equal(parseJournalEntryInput({ ...input, sensitiveConsentVersion: true }), null);
  assert.equal(parseJournalEntryInput({ ...input, sensitiveContent: true, sensitiveConsentVersion: SENSITIVE_JOURNAL_CONSENT_VERSION })?.sensitiveConsentVersion, SENSITIVE_JOURNAL_CONSENT_VERSION);
  assert.equal(parseJournalEntryInput(input)?.sensitiveContent, undefined);
});

test("웹 공개 조건은 민감정보와 미확인 기록을 승인하지 않는다", () => {
  const before = process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED;
  try {
    process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = "true";
    assert.deepEqual(publicSensitiveJournalFilter(), { sensitiveWithdrawnAt: null, sensitiveContent: false });
    const book = { ...emptyJournalBookDraft(), entryIds: ["entry-1"] };
    assert.throws(() => assertJournalBookFreeform(book), /표지 제목/);
    assert.doesNotThrow(() => assertJournalBookFreeform({ ...book, freeformNonSensitiveConfirmed: true }));
    assert.equal(parseJournalBookInput({ ...book, freeformNonSensitiveConfirmed: "true" }), null);
  } finally { if (before === undefined) delete process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED; else process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = before; }
});

test("푸시 정리는 조회 전용으로 시작하고 30일 경계를 포함해 파기한다", async () => {
  assert.equal(pushRetentionCutoff(now).toISOString(), "2026-09-20T00:00:00.000Z");
  assert.throws(() => pushRetentionCutoff(new Date("invalid")));
  writes = 0;
  await purgePushRetention(now);
  assert.equal(writes, 0);
  const result = await purgePushRetention(now, true);
  assert.equal(result.mode, "applied");
  assert.equal(writes, 3);
});

test("발송 로그는 문의 식별값과 토큰이 섞인 제공자 오류를 저장하지 않는다", async () => {
  assert.deepEqual(normalizePushError(new Error("HTTP 403 (SECRET_DEVICE_TOKEN) raw-secret")), { code: "HTTP_403", message: null });
  assert.deepEqual(normalizePushError(new Error("(SECRET_DEVICE_TOKEN)")), { code: "PROVIDER_ERROR", message: null });
  await recordPushDeliverySafely({ userId: "user", deviceId: null, platform: "android", provider: "fcm", message: { title: "알림", body: "알림", type: "inquiry_answered", path: "/inquiries", entityId: "private-inquiry" }, status: "invalidated", error: new Error("raw-secret") });
  assert.doesNotMatch(JSON.stringify(lastDelivery), /private-inquiry|raw-secret|SECRET_DEVICE_TOKEN/);
});

test("권리·파기 예약 작업의 실행과 설치는 분리하고 복구 검토 잠금을 존중한다", () => {
  const wrapper = readFileSync("scripts/ops/tuti-privacy-data-maintain", "utf8");
  assert.match(wrapper, /restore-privacy\/pending.env/);
  assert.match(wrapper, /flock --shared/);
  assert.doesNotMatch(wrapper, /--build/);
  const installer = readFileSync("scripts/ops/install-legal-compliance-timers", "utf8");
  assert.doesNotMatch(installer, /systemctl enable|systemctl start/);
  assert.match(readFileSync("scripts/ops/systemd/tuti-privacy-maintenance.service", "utf8"), /OnFailure=/);
});
