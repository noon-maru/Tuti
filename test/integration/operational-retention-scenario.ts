import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { TestContext } from "node:test";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { EvidenceHold } from "../../src/server/legal/retentionPolicy";

// 반드시 legal-postgres.test의 새 임시 클러스터/복원 DB에서만 호출한다.
// 실행 중인 운영 접속정보나 기존 데이터는 입력받지 않는다.
export async function verifyOperationalRetention(t: TestContext, client: PrismaClient, query: (sql: string) => string, socket: string) {
  assert.ok(socket.includes("tuti-legal-postgres-") && socket.endsWith("/socket"));
  const { purgeOperationalRetention, updateEvidenceHold } = await import("../../src/server/legal/retention");
  const { RETENTION_HOLDS_KEY } = await import("../../src/server/legal/retentionPolicy");
  const now = new Date("2026-10-22T00:00:00.000Z");
  const previous = process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
  const hold = (id: string, resource: EvidenceHold["resource"], targetId: string): Omit<EvidenceHold, "reviewedAt"> => ({
    id, resource, targetId, caseReference: "SYNTHETIC-CASE", purpose: "격리 시험", legalBasis: "합성 자료 시험",
    owner: "합성 운영자", terminationCondition: "시험 종료",
  });
  query(`
    CREATE TYPE "InquiryStatus" AS ENUM ('pending','reviewing','answered','closed');
    CREATE TYPE "InquiryCategory" AS ENUM ('account','service','place','privacy','other');
    CREATE TABLE customer_inquiries (
      id text PRIMARY KEY, requester_user_id text, requester_email text, category "InquiryCategory" NOT NULL,
      subject text NOT NULL, message text NOT NULL, status "InquiryStatus" NOT NULL DEFAULT 'pending',
      admin_response text, handled_by_user_id text, handled_at timestamp(3),
      created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp(3) NOT NULL
    );
    CREATE TABLE journal_share_traces (
      trace_id text PRIMARY KEY, short_code text NOT NULL UNIQUE, origin_user_id text NOT NULL,
      resolved_user_id text NOT NULL, entry_id text NOT NULL, image_sha256 text, signature text,
      issued_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, finalized_at timestamp(3)
    );
    CREATE TABLE app_settings (
      key text PRIMARY KEY, value text NOT NULL, updated_by_user_id text,
      created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp(3) NOT NULL
    );
  `);
  const seed = async () => {
    // 타 시험의 감사/법률 자료는 건드리지 않고 이 세 개 신규 시험 테이블만 비운다.
    await client.customerInquiry.deleteMany();
    await client.journalShareTrace.deleteMany();
    await client.appSetting.deleteMany({ where: { key: RETENTION_HOLDS_KEY } });
    await client.systemLog.deleteMany({ where: { id: { startsWith: "retention-synthetic-" } } });
    const old = new Date("2020-01-01T00:00:00Z");
    await client.customerInquiry.createMany({ data: ([
      { id: "expired-inquiry", status: "answered", handledAt: old, updatedAt: old },
      { id: "boundary-inquiry", status: "closed", handledAt: new Date("2023-10-22T00:00:00Z"), updatedAt: new Date("2023-10-22T00:00:00Z") },
      { id: "held-inquiry", status: "closed", handledAt: old, updatedAt: old },
      { id: "recent-inquiry", status: "answered", handledAt: new Date("2023-10-22T00:00:00.001Z"), updatedAt: new Date("2023-10-22T00:00:00.001Z") },
      { id: "pending-inquiry", status: "pending", handledAt: old, updatedAt: old },
      { id: "reviewing-inquiry", status: "reviewing", handledAt: old, updatedAt: old },
      { id: "undated-inquiry", status: "closed", handledAt: null, updatedAt: old },
      { id: "modified-inquiry", status: "closed", handledAt: old, updatedAt: now },
    ] as const).map(row => ({ ...row, category: "service" as const, subject: "합성 문의", message: "합성 본문", createdAt: old })) });
    await client.journalShareTrace.createMany({ data: [
      { traceId: "expired-trace", issuedAt: old, finalizedAt: null },
      { traceId: "boundary-trace", issuedAt: new Date("2026-09-22T00:00:00Z"), finalizedAt: null },
      { traceId: "held-trace", issuedAt: old, finalizedAt: null },
      { traceId: "finalized-trace", issuedAt: old, finalizedAt: old },
      { traceId: "recent-trace", issuedAt: new Date("2026-09-22T00:00:00.001Z"), finalizedAt: null },
    ].map(row => ({ ...row, shortCode: row.traceId, originUserId: "synthetic", resolvedUserId: "synthetic", entryId: "synthetic" })) });
    await client.systemLog.createMany({ data: ([
      { id: "expired", category: "diagnostic", action: "diagnostic.error", level: "error", createdAt: old },
      { id: "boundary", category: "diagnostic", action: "diagnostic.error", level: "error", createdAt: new Date("2025-10-22T00:00:00Z") },
      { id: "held", category: "diagnostic", action: "diagnostic.error", level: "error", createdAt: old },
      { id: "recent", category: "diagnostic", action: "diagnostic.error", level: "error", createdAt: new Date("2025-10-22T00:00:00.001Z") },
      { id: "security", category: "security", action: "diagnostic.error", level: "error", createdAt: old },
      { id: "moderation", category: "moderation", action: "diagnostic.error", level: "error", createdAt: old },
      { id: "wrong-action", category: "diagnostic", action: "another.action", level: "error", createdAt: old },
      { id: "wrong-level", category: "diagnostic", action: "diagnostic.error", level: "warning", createdAt: old },
    ] as const).map(row => ({ ...row, id: `retention-synthetic-${row.id}`, message: "합성 진단" })) });
    for (const input of [hold("hold-inquiry", "inquiry", "held-inquiry"), hold("hold-trace", "shareTrace", "held-trace"), hold("hold-error", "errorLog", "retention-synthetic-held")]) {
      await updateEvidenceHold({ operation: "register", hold: input }, now, true);
    }
  };
  const counts = async () => ({ inquiries: await client.customerInquiry.count(), traces: await client.journalShareTrace.count(),
    errors: await client.systemLog.count({ where: { id: { startsWith: "retention-synthetic-" } } }) });
  const expected = { inquiries: 8, traces: 5, errors: 8 };
  try {
    await seed();
    await t.test("실제 ORM의 조회·비활성 apply는 무변경이며 세 범주의 보전 항목을 제외한다", async () => {
      delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
      const dry = await purgeOperationalRetention(now);
      assert.equal(dry.mode, "dry-run");
      assert.equal(dry.inquiries, 2);
      assert.equal(dry.unfinishedShares, 2);
      assert.equal(dry.generalErrors, 2);
      assert.equal(dry.evidenceHolds, 3);
      assert.equal((await purgeOperationalRetention(now, true)).mode, "disabled");
      assert.deepEqual(await counts(), expected);
    });
    await t.test("한 범주 삭제 실패 시 먼저 실행한 삭제도 같은 DB 트랜잭션에서 롤백한다", async () => {
      process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = "true";
      query(`CREATE FUNCTION retention_synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deletion failure'; END $$;
        CREATE TRIGGER retention_synthetic_fail BEFORE DELETE ON system_logs FOR EACH ROW WHEN (OLD.category = 'diagnostic') EXECUTE FUNCTION retention_synthetic_fail();`);
      try {
        await assert.rejects(purgeOperationalRetention(now, true));
        assert.deepEqual(await counts(), expected);
      } finally { query("DROP TRIGGER retention_synthetic_fail ON system_logs; DROP FUNCTION retention_synthetic_fail()"); }
    });
    await t.test("실제 기한 삭제는 경계를 포함하고 진행 중·완료 PNG·감사/보안 범주를 보존하며 재실행 가능하다", async () => {
      const applied = await purgeOperationalRetention(now, true);
      assert.equal(applied.mode, "applied");
      assert.deepEqual([applied.inquiries, applied.unfinishedShares, applied.generalErrors], [2, 2, 2]);
      assert.deepEqual(await counts(), { inquiries: 6, traces: 3, errors: 6 });
      assert.deepEqual((await client.customerInquiry.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map(row => row.id), ["held-inquiry", "modified-inquiry", "pending-inquiry", "recent-inquiry", "reviewing-inquiry", "undated-inquiry"]);
      assert.ok(await client.journalShareTrace.findUnique({ where: { traceId: "finalized-trace" } }));
      assert.equal(await client.systemLog.count({ where: { id: { in: ["retention-synthetic-security", "retention-synthetic-moderation", "retention-synthetic-wrong-action", "retention-synthetic-wrong-level"] } } }), 4);
      const repeated = await purgeOperationalRetention(now, true);
      assert.deepEqual([repeated.inquiries, repeated.unfinishedShares, repeated.generalErrors], [0, 0, 0]);
    });
    await t.test("90일 재검토 도래는 보전을 해제하지 않으며 검토·해제 명령은 실제 DB에서 반영된다", async () => {
      const due = new Date(now.getTime() + 90 * 86_400_000);
      assert.equal((await purgeOperationalRetention(due)).reviewRequired, true);
      const before = await counts();
      await updateEvidenceHold({ operation: "review", id: "hold-inquiry" }, due);
      assert.equal((await purgeOperationalRetention(due)).dueEvidenceReviews, 3, "기본 조회 검토는 갱신하지 않는다.");
      await updateEvidenceHold({ operation: "review", id: "hold-inquiry" }, due, true);
      assert.equal((await purgeOperationalRetention(due)).dueEvidenceReviews, 2);
      await updateEvidenceHold({ operation: "release", id: "hold-inquiry" }, due, true);
      assert.deepEqual(await counts(), before, "보전 해제만으로 원본을 즉시 지우지 않는다.");
      await purgeOperationalRetention(due, true);
      assert.equal(await client.customerInquiry.count({ where: { id: "held-inquiry" } }), 0);
      assert.ok(await client.journalShareTrace.findUnique({ where: { traceId: "held-trace" } }));
      assert.ok(await client.systemLog.findUnique({ where: { id: "retention-synthetic-held" } }));
    });
    await t.test("손상된 보전 목록은 신규 정리 전체를 중단한다", async () => {
      const before = await counts();
      const setting = await client.appSetting.findUniqueOrThrow({ where: { key: RETENTION_HOLDS_KEY } });
      await client.appSetting.update({ where: { key: RETENTION_HOLDS_KEY }, data: { value: "broken" } });
      try {
        await assert.rejects(purgeOperationalRetention(now, true));
        assert.deepEqual(await counts(), before);
      } finally { await client.appSetting.update({ where: { key: RETENTION_HOLDS_KEY }, data: { value: setting.value } }); }
    });
    await t.test("서로 다른 실제 DB 연결의 보전 등록과 정리는 같은 잠금으로 직렬화한다", async () => {
      await seed();
      let unlock!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>(resolve => { unlock = resolve; });
      const acquired = new Promise<void>(resolve => { ready = resolve; });
      const blocker = client.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(84621, 1)::text`;
        ready();
        await gate;
      }, { timeout: 15_000 });
      const pending: Array<Promise<unknown>> = [blocker];
      const waitFor = async (count: number) => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          if (Number(query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event='advisory'")) >= count) return;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error("합성 보전/정리의 실제 잠금 대기를 확인하지 못했습니다.");
      };
      try {
        await acquired;
        const registration = updateEvidenceHold({ operation: "register", hold: hold("racing-hold", "inquiry", "expired-inquiry") }, now, true);
        pending.push(registration);
        await waitFor(1);
        const purging = purgeOperationalRetention(now, true);
        pending.push(purging);
        await waitFor(2);
        unlock();
        await Promise.all(pending);
        assert.equal((await purging).inquiries, 1, "잠금 대기 중 등록된 보전을 정리가 읽어야 한다.");
        assert.ok(await client.customerInquiry.findUnique({ where: { id: "expired-inquiry" } }));
      } finally {
        unlock();
        await Promise.allSettled(pending);
      }
    });
    await t.test("기한 도래의 실제 CLI 종료 코드와 실패 알림의 비식별 전송 경로를 검증한다", async () => {
      await seed();
      const setting = await client.appSetting.findUniqueOrThrow({ where: { key: RETENTION_HOLDS_KEY } });
      const registry = JSON.parse(setting.value) as { version: number; holds: EvidenceHold[] };
      registry.holds.forEach(item => { item.reviewedAt = new Date(Date.now() - 91 * 86_400_000).toISOString(); });
      await client.appSetting.update({ where: { key: RETENTION_HOLDS_KEY }, data: { value: JSON.stringify(registry) } });
      const before = await counts();
      // fallback TCP 주소도 운영 포트가 아닌 시험 전용 15479다. 실제 pg 연결은 아래 임시 Unix 소켓을 사용한다.
      const databaseUrl = `postgresql://tuti_legal_test@localhost:15479/legal_restore_test?host=${encodeURIComponent(socket)}`;
      assert.equal(new URL(databaseUrl).searchParams.get("host"), socket);
      const env = { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, NODE_ENV: "test" as const, NODE_OPTIONS: "--max-old-space-size=256",
        DATABASE_URL: databaseUrl, PRIVACY_EXTENDED_RETENTION_ENABLED: "true" };
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/maintain-operational-retention.ts"], { env, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.status, 2, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.mode, "dry-run");
      assert.equal(report.dueEvidenceReviews, 3);
      assert.equal(report.reviewRequired, true);
      assert.deepEqual(await counts(), before, "CLI 조회·검토 도래만으로 원본을 지우지 않는다.");
      assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC-CASE|합성 본문|held-trace|retention-synthetic/);

      const job = readFileSync("scripts/ops/systemd/tuti-privacy-maintenance.service", "utf8");
      assert.match(job, /OnFailure=tuti-legal-job-failure@%n.service/);
      assert.match(readFileSync("scripts/maintain-privacy-data.ts", "utf8"), /reviewRequired/);
      // 실제 Slack·로컬 HTTP 서버에도 연결하지 않는다. 실제 발송 스크립트의 fetch만 모의한다.
      const notification = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
        import assert from 'node:assert/strict';
        let called = false;
        globalThis.fetch = async (url, init) => {
          assert.equal(url.toString(), 'https://alerts.invalid/retention-test');
          assert.equal(init.method, 'POST');
          assert.equal(init.redirect, 'error');
          const payload = JSON.parse(init.body);
          assert.deepEqual(Object.keys(payload), ['text']);
          assert.match(payload.text, /예약 작업에 실패/);
          assert.doesNotMatch(init.body, /SYNTHETIC-CASE|합성 본문|held-trace|retention-synthetic/);
          called = true;
          return new Response('', {status: 200});
        };
        await import('./scripts/notify-legal-job-failure.ts');
        assert.equal(called, true);
        console.log('MOCK_NOTIFICATION_ACCEPTED');
      `], { env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, NODE_ENV: "test", NODE_OPTIONS: "--max-old-space-size=256", LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "https://alerts.invalid/retention-test" }, encoding: "utf8", timeout: 10_000 });
      assert.equal(notification.status, 0, notification.stderr);
      assert.match(notification.stdout, /MOCK_NOTIFICATION_ACCEPTED/);
      t.diagnostic("재검토 알림은 실제 CLI exit=2 및 모의 전송 검증. 운영 systemd 실패·Slack 수신 시험은 수행하지 않음");
    });
  } finally {
    if (previous === undefined) delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
    else process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = previous;
  }
}
