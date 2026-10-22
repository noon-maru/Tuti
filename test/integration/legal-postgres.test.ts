import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("분리된 PostgreSQL에서 약관·권리 보호 마이그레이션의 실제 제약을 검증한다", { timeout: 60000 }, async (t) => {
  const unavailable = (reason: string) => {
    if (process.env.LEGAL_POSTGRES_REQUIRED === "true") throw new Error(reason);
    t.skip(reason);
  };
  if (process.getuid?.() === 0) { unavailable("initdb는 root로 실행하지 않는다. 전용 일반 사용자로 시험 필요."); return; }
  const binary = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  for (const name of ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore", "createdb"]) {
    if (spawnSync(binary(name), ["--version"]).status !== 0) { unavailable(`PostgreSQL 실행 파일이 필요하다: ${name}`); return; }
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-legal-postgres-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined,
    PGHOSTADDR: undefined, PGHOST: undefined, PGPORT: undefined, PGDATABASE: undefined, PGUSER: undefined,
    PGPASSWORD: undefined, PGPASSFILE: undefined, PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5" };
  let started = false;
  t.after(() => {
    // pg_ctl start가 시간 초과해도 postmaster 자체는 살아 있을 수 있다.
    // 시작 명령 성공 여부만으로 실행 중인 시험 DB의 파일을 지우지 않는다.
    if (started || existsSync(join(data, "postmaster.pid"))) {
      const status = spawnSync(binary("pg_ctl"), ["-D", data, "status"], { env, encoding: "utf8" });
      if (status.status === 0) {
        const stop = spawnSync(binary("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, encoding: "utf8" });
        if (stop.status !== 0) throw new Error(`임시 DB 종료에 실패하여 파일을 보존합니다: ${root}`);
      } else if (status.status !== 3) {
        throw new Error(`임시 DB 종료 상태를 확인하지 못하여 파일을 보존합니다: ${root}`);
      }
    }
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
    t.diagnostic("격리 PostgreSQL 종료·임시 디렉터리 정리 완료. 운영 복원·자료 삭제·Slack 발송 없음");
  });
  execFileSync(binary("initdb"), ["-D", data, "-U", "tuti_legal_test", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  try {
    execFileSync(binary("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15479 -c listen_addresses='' -c max_connections=8 -c max_wal_senders=0 -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "15", "start"], { env, stdio: "pipe" });
  } catch { throw new Error(`임시 PostgreSQL 시작 실패: ${readFileSync(join(root, "server.log"), "utf8")}`); }
  started = true;
  // 접속 경로는 반드시 시험 전용 값으로 지정하며 DATABASE_URL을 사용하지 않는다.
  const psqlArgs = ["--no-psqlrc", "-h", socket, "-p", "15479", "-U", "tuti_legal_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-f", "-"];
  const query = (sql: string) => execFileSync(binary("psql"), psqlArgs, { input: sql, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const serverVersion = Number(query("SHOW server_version_num"));
  assert.equal(query("SHOW listen_addresses"), "", "시험 클러스터는 TCP 리스너를 열지 않는다.");
  const expectedMajor = process.env.LEGAL_POSTGRES_EXPECTED_MAJOR;
  if (expectedMajor) {
    assert.match(expectedMajor, /^[1-9][0-9]+$/);
    assert.equal(Math.floor(serverVersion / 10000), Number(expectedMajor), "요청한 PostgreSQL 주 버전으로 시험해야 한다.");
  }
  t.diagnostic(`isolated PostgreSQL server_version_num=${serverVersion}`);
  await t.test("Prisma 실제 어댑터가 권리 알림·약관 공고 잠금의 반환값을 읽고 트랜잭션 잠금을 유지한다", async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    // 운영 DATABASE_URL을 사용하지 않고 위에서 생성한 임시 Unix 소켓에만 접속한다.
    const client = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15479, user: "tuti_legal_test", database: "postgres", max: 2 }) });
    try {
      await assert.rejects(client.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)`, /void/);
      await client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text AS lock_result`;
        const held = await client.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(20261019, 1) AS acquired`;
        assert.equal(held[0].acquired, false, "반환값 캐스팅이 잠금을 해제하거나 별도 연결로 옮겨서는 안 된다.");
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tuti-journal-rights-deadline-alert'))::text AS lock_result`;
      });
      const released = await client.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(20261019, 1) AS acquired`;
      assert.equal(released[0].acquired, true);
    } finally { await client.$disconnect(); }
  });
  const rejected = (sql: string, message: RegExp) => {
    const result = spawnSync(binary("psql"), psqlArgs, { input: sql, env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  };
  query('CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE content_reports(id text PRIMARY KEY);');
  query("CREATE TABLE system_logs(id text PRIMARY KEY, actor_user_id text, target_type text, target_id text, category text, action text, metadata jsonb, created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP)");
  query(`INSERT INTO system_logs(id,actor_user_id,target_type,target_id,category,action,metadata) VALUES ('legacy-access','legacy-admin','user','legacy-owner','journal','journal.admin.viewed','{"purpose":"support","reference":"CASE-123","entryIds":"entry-1,entry-2","content":"DO-NOT-COPY"}'), ('ordinary','legacy-admin','user','legacy-owner','journal','journal.created','{}')`);
  for (const name of ["20261019120000_add_service_terms_consent", "20261019130000_add_journal_rights_workflow"]) query(readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  query(readFileSync(join(process.cwd(), "prisma/migrations/20261019140000_add_admin_journal_access_audits/migration.sql"), "utf8"));
  // 운영 users.role을 최소 스키마에 추가하고 후속 공고 마이그레이션까지 적용한다.
  query("ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user'");
  query(readFileSync(join(process.cwd(), "prisma/migrations/20261022120000_add_initial_service_terms_release/migration.sql"), "utf8"));
  query(readFileSync(join(process.cwd(), "prisma/migrations/20261022130000_separate_legal_notice_from_activation/migration.sql"), "utf8"));
  await t.test("관리자 접근 증거를 별도 보존하고 계정 삭제·변조·조기 파기를 막는다", () => {
    assert.equal(query("SELECT count(*) FROM admin_journal_access_audits"), "1");
    assert.equal(query("SELECT case_reference || ':' || array_to_string(entry_ids, ',') FROM admin_journal_access_audits"), "CASE-123:entry-1,entry-2");
    assert.doesNotMatch(query("SELECT row_to_json(a)::text FROM admin_journal_access_audits a"), /DO-NOT-COPY/);
    query("INSERT INTO users(id) VALUES ('legacy-admin'),('legacy-owner'); DELETE FROM users WHERE id IN ('legacy-admin','legacy-owner'); DELETE FROM system_logs");
    assert.equal(query("SELECT actor_user_id || ':' || subject_user_id FROM admin_journal_access_audits"), "legacy-admin:legacy-owner");
    rejected("UPDATE admin_journal_access_audits SET actor_user_id=NULL", /immutable/);
    rejected("TRUNCATE admin_journal_access_audits", /immutable/);
    rejected("DELETE FROM admin_journal_access_audits", /retention has not expired/);
    query("INSERT INTO admin_journal_access_audits(id,entry_ids,occurred_at) VALUES ('expired','{}',CURRENT_TIMESTAMP - INTERVAL '2 years 1 second'); DELETE FROM admin_journal_access_audits WHERE id='expired'");
    assert.equal(query("SELECT count(*) FROM admin_journal_access_audits"), "1");
  });
  await t.test("구버전 서버가 일반 로그에만 기록해도 DB가 접근 증거를 별도로 보존한다", () => {
    query("INSERT INTO system_logs(id,actor_user_id,target_type,target_id,category,action,metadata) VALUES ('old-client-access','operator','user','owner','journal','journal.admin.viewed','{}'), ('not-an-access','operator','user','owner','journal','journal.created','{}')");
    query("DELETE FROM system_logs WHERE target_id='owner'");
    assert.equal(query("SELECT actor_user_id || ':' || subject_user_id FROM admin_journal_access_audits WHERE id='old-client-access'"), "operator:owner");
    assert.equal(query("SELECT count(*) FROM admin_journal_access_audits WHERE id='not-an-access'"), "0");
  });
  await t.test("공고는 일반 계정이 남아 있어도 가능하며 시행·동의는 생성하지 않고 원문 변경도 금지한다", () => {
    const insert = "INSERT INTO legal_document_notices VALUES ('service-terms','notice-only','{}','" + "a".repeat(64) + "','2026-10-22','2026-10-22','initial','NOTICE-123','다음 앱·서버 전환 후 명시적 동의');";
    assert.match(query(`BEGIN; INSERT INTO users(id) VALUES ('notice-user'); ${insert} SELECT (SELECT count(*) FROM legal_document_notices)||':'||(SELECT count(*) FROM service_terms_releases)||':'||(SELECT count(*) FROM service_terms_acceptances); ROLLBACK;`), /1:0:0/);
    rejected(`BEGIN; ${insert} UPDATE legal_document_notices SET document='{"changed":true}'; ROLLBACK;`, /immutable/);
    rejected(`BEGIN; ${insert} DELETE FROM legal_document_notices; ROLLBACK;`, /immutable/);
    rejected(`BEGIN; ${insert} TRUNCATE legal_document_notices; ROLLBACK;`, /immutable/);
    rejected(`BEGIN; INSERT INTO users(id) VALUES ('notice-user'); ${insert} INSERT INTO service_terms_acceptances VALUES ('not-accepted','notice-user','notice-only','hash',true,true,now()); ROLLBACK;`, /foreign key constraint/);
    const activate = (hash: string, effective = "2026-10-22") => `INSERT INTO service_terms_releases VALUES ('notice-only','{}','${hash}','2026-10-22','${effective}','APPROVAL-123',0,'initial','CLOSURE-123');`;
    query(`BEGIN; ${insert} ${activate("a".repeat(64))} ROLLBACK;`);
    rejected(`BEGIN; ${insert} ${activate("different-hash")} ROLLBACK;`, /must match the announced/);
    rejected(`BEGIN; ${insert} ${activate("a".repeat(64), "2026-10-21")} ROLLBACK;`, /cannot precede/);
  });
  await t.test("공고일 30일 미만 시행을 DB도 거절한다", () => {
    rejected("INSERT INTO service_terms_releases(version,document,document_hash,published_at,effective_at,approval_reference,notice_days) VALUES ('invalid','{}','hash','2026-10-19','2026-11-17','APPROVAL-1',30)", /check constraint/);
  });
  await t.test("최초 즉시 공고는 승인 근거·일반 계정 종료·빈 공고 이력을 DB에서도 요구한다", () => {
    const insert = (version: string, reference = "'CLOSURE-123'") => `INSERT INTO service_terms_releases VALUES ('${version}','{}','hash','2026-10-22','2026-10-22','APPROVAL-1',0,'initial',${reference});`;
    rejected(insert("missing-proof", "NULL"), /check constraint/);
    rejected(`BEGIN; INSERT INTO users(id) VALUES ('ordinary'); ${insert("existing-user")} ROLLBACK;`, /closure of existing ordinary accounts/);
    // 성공 사례도 롤백하여 이후 원문 불변성 시험의 상태를 오염시키지 않는다.
    query(`BEGIN; INSERT INTO users(id,role) VALUES ('retained-admin','admin'); ${insert("initial")} ROLLBACK;`);
    rejected(`BEGIN; ${insert("first")} ${insert("second")} ROLLBACK;`, /empty release history/);
    query("INSERT INTO service_terms_releases(version,document,document_hash,published_at,effective_at,approval_reference,notice_days) VALUES ('v1','{}','hash','2026-10-19','2026-11-18','APPROVAL-1',30)");
    rejected(insert("not-first"), /empty release history/);
    rejected("UPDATE service_terms_releases SET publication_mode='initial',notice_days=0,initial_contract_reference='CLOSURE-123' WHERE version='v1'", /immutable/);
  });
  await t.test("공고 원문의 UPDATE·DELETE를 실제 트리거가 거절한다", () => {
    rejected("UPDATE service_terms_releases SET document='{}' WHERE version='v1'", /immutable/);
    rejected("DELETE FROM service_terms_releases WHERE version='v1'", /immutable/);
  });
  await t.test("연령·중요 내용 확인 누락과 중복 동의를 거절하고 계정 삭제 시 영수증을 지운다", () => {
    query("INSERT INTO users(id) VALUES ('subject')");
    rejected("INSERT INTO service_terms_acceptances VALUES ('bad','subject','v1','hash',false,true,now())", /check constraint/);
    query("INSERT INTO service_terms_acceptances VALUES ('receipt','subject','v1','hash',true,true,now())");
    rejected("INSERT INTO service_terms_acceptances VALUES ('duplicate','subject','v1','hash',true,true,now())", /unique constraint/);
    query("DELETE FROM users WHERE id='subject'");
    assert.equal(query("SELECT count(*) FROM service_terms_acceptances"), "0");
    assert.equal(query("SELECT count(*) FROM service_terms_releases"), "1");
  });
  query("INSERT INTO content_reports VALUES ('r1'),('r2'),('r3')");
  const insertCase = (id: string, report: string, kind: string, state: string, blocked: string, expires: string, counter = "NULL", resume = "NULL") => `INSERT INTO journal_rights_cases(id,report_id,reference,kind,state,proof_reference,received_at,next_review_at,updated_at,blocked_at,expires_at,counter_requested_at,resume_at) VALUES ('${id}','${report}','REF-${id}','${kind}','${state}','PROOF-1',now(),now(),now(),${blocked},${expires},${counter},${resume})`;
  await t.test("30일 초과 임시조치와 7~14일 밖의 저작권 재개 예정일을 거절한다", () => {
    rejected(insertCase("bad", "r1", "privacy", "temporary_block", "'2026-10-19'", "'2026-11-19'"), /check constraint/);
    query(insertCase("valid", "r1", "privacy", "temporary_block", "'2026-10-19'", "'2026-11-18'"));
    rejected(insertCase("early", "r2", "copyright", "resume_scheduled", "NULL", "NULL", "'2026-10-19'", "'2026-10-25'"), /check constraint/);
    query(insertCase("copyright", "r2", "copyright", "resume_scheduled", "NULL", "NULL", "'2026-10-19'", "'2026-10-26'"));
  });
  await t.test("일반 발송 성공을 법정 통지 완료로 저장하거나 전달 근거 없이 완료 처리할 수 없다", () => {
    const notice = (id: string, status: string) => `INSERT INTO journal_rights_notices(id,case_id,event_sequence,recipient_role,kind,message,requires_formal_notice,status,updated_at) VALUES ('${id}','copyright',1,'applicant','schedule_resume','test',true,'${status}',now())`;
    rejected(notice("smtp-only", "sent"), /check constraint/);
    rejected(notice("no-proof", "manual_confirmed"), /check constraint/);
    query(notice("pending", "manual_required"));
    query("UPDATE journal_rights_notices SET status='manual_confirmed',sent_at=now(),delivery_proof_reference='DELIVERY-123' WHERE id='pending'");
    assert.equal(query("SELECT status FROM journal_rights_notices WHERE id='pending'"), "manual_confirmed");
  });
  query(`
    CREATE TYPE "LocationConsentStatus" AS ENUM ('accepted','paused','declined','withdrawn');
    CREATE TYPE "RecommendationActionType" AS ENUM ('navigation_started','place_selected');
    CREATE TABLE location_consent_events(id text PRIMARY KEY,user_id text,subject_key text NOT NULL,status "LocationConsentStatus" NOT NULL,terms_version text NOT NULL,age_confirmed boolean NOT NULL,client_platform text NOT NULL,created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE location_usage_logs(id text PRIMARY KEY,user_id text,subject_key text,occurred_at timestamp(3) DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE recommendation_runs(id text PRIMARY KEY,user_id text NOT NULL,location_used boolean NOT NULL,created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP,algorithm_version text NOT NULL DEFAULT 'test',answers jsonb NOT NULL DEFAULT '{}',state jsonb NOT NULL DEFAULT '{}',entry_status text,state_text_used boolean NOT NULL DEFAULT false,candidates jsonb NOT NULL DEFAULT '[]',personalization jsonb);
    CREATE TABLE recommendation_actions(id text PRIMARY KEY,user_id text NOT NULL,action "RecommendationActionType" NOT NULL,metadata jsonb,created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id) VALUES ('location-user'),('location-other');
    INSERT INTO location_consent_events VALUES ('location-old','location-user','key','accepted','old',true,'web','2026-01-01');
    INSERT INTO location_usage_logs(id,user_id,subject_key) VALUES ('usage','location-user','key'),('usage-other','location-other','other');
    INSERT INTO recommendation_runs(id,user_id,location_used) VALUES ('located','location-user',true),('region','location-user',false),('other','location-other',true);
    INSERT INTO recommendation_actions(id,user_id,action,metadata) VALUES ('navigation','location-user','navigation_started','{"distanceMeters":1234}'),('selection','location-user','place_selected','{"method":"direct"}');
  `);
  await t.test("백업을 별도 임시 DB로 복원해도 원문 변경 금지·통지 제약과 기존 증빙이 보존된다", async (t) => {
    const connection = ["-h", socket, "-p", "15479", "-U", "tuti_legal_test"];
    const archive = join(root, "legal-test.dump");
    execFileSync(binary("pg_dump"), [...connection, "-d", "postgres", "--format=custom", "--file", archive], { env, stdio: "pipe" });
    execFileSync(binary("createdb"), [...connection, "legal_restore_test"], { env, stdio: "pipe" });
    execFileSync(binary("pg_restore"), [...connection, "-d", "legal_restore_test", "--exit-on-error", archive], { env, stdio: "pipe" });
    const restoredArgs = ["--no-psqlrc", ...connection, "-d", "legal_restore_test", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-f", "-"];
    const restoredQuery = (sql: string) => execFileSync(binary("psql"), restoredArgs, { input: sql, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    assert.equal(restoredQuery("SELECT approval_reference FROM service_terms_releases WHERE version='v1'"), "APPROVAL-1");
    assert.equal(restoredQuery("SELECT delivery_proof_reference FROM journal_rights_notices WHERE id='pending'"), "DELIVERY-123");
    for (const [sql, error] of [
      ["UPDATE service_terms_releases SET document='{}' WHERE version='v1'", /immutable/],
      ["DELETE FROM service_terms_releases WHERE version='v1'", /immutable/],
      ["UPDATE journal_rights_notices SET status='sent' WHERE id='pending'", /check constraint/],
      ["UPDATE journal_rights_notices SET delivery_proof_reference=NULL WHERE id='pending'", /check constraint/],
      ["UPDATE journal_rights_cases SET expires_at='2026-11-19' WHERE id='valid'", /check constraint/],
    ] as const) {
      const result = spawnSync(binary("psql"), restoredArgs, { input: sql, env, encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    }
    assert.equal(query("SELECT count(*) FROM service_terms_releases"), "1", "복원 시험이 원본 시험 DB를 변경하면 안 된다.");

    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const client = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15479, user: "tuti_legal_test", database: "legal_restore_test", ssl: false }) });
    const originalUrl = process.env.DATABASE_URL;
    const originalLedger = process.env.PRIVACY_REPLAY_LEDGER_ENABLED;
    // 실제 연결은 위 Unix 소켓 adapter만 사용한다. 운영 DATABASE_URL은 참조하지 않는다.
    process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
    process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
    (globalThis as { prisma?: unknown }).prisma = client;
    try {
      const { recordLocationConsent, purgeWithdrawnLocationSubject, replayLocationWithdrawal } = await import("../../src/server/location/compliance");
      restoredQuery(`CREATE FUNCTION fail_location_purge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test purge failure'; END $$;
        CREATE TRIGGER fail_location_purge BEFORE UPDATE ON recommendation_actions FOR EACH ROW EXECUTE FUNCTION fail_location_purge();`);
      await assert.rejects(recordLocationConsent({ user: { id: "location-user", role: "user" }, status: "withdrawn", termsVersion: "old-client", ageConfirmed: false, clientPlatform: "web" }), { code: "location_consent_record_failed" });
      assert.equal(restoredQuery("SELECT status FROM location_consent_events WHERE id='location-old'"), "accepted");
      assert.equal(restoredQuery("SELECT count(*) FROM location_usage_logs WHERE user_id='location-user'"), "1");
      assert.equal(restoredQuery("SELECT count(*) FROM recommendation_runs WHERE id='located'"), "1");
      restoredQuery("DROP TRIGGER fail_location_purge ON recommendation_actions; DROP FUNCTION fail_location_purge()");
      await recordLocationConsent({ user: { id: "location-user", role: "user" }, status: "withdrawn", termsVersion: "old-client", ageConfirmed: false, clientPlatform: "web" });
      const residual = await purgeWithdrawnLocationSubject("location-user");
      assert.deepEqual(residual, { skipped: false, usageLogs: 0, consentEvents: 0, recommendationRuns: 0, routeMetadata: 0 });
      assert.equal(restoredQuery("SELECT string_agg(id,',' ORDER BY id) FROM recommendation_runs"), "other,region");
      assert.equal(restoredQuery("SELECT count(*) FROM location_usage_logs WHERE user_id='location-other'"), "1");
      assert.equal(restoredQuery("SELECT metadata IS NULL FROM recommendation_actions WHERE id='navigation'"), "t");
      assert.equal(restoredQuery("SELECT metadata->>'method' FROM recommendation_actions WHERE id='selection'"), "direct");
      assert.equal(query("SELECT count(*) FROM recommendation_runs"), "3", "원본 DB는 변경하지 않는다.");

      const { LOCATION_TERMS_VERSION } = await import("../../src/shared/location/terms");
      const { recordRecommendationRunSafely } = await import("../../src/server/recommendations/run");
      const accepted = await recordLocationConsent({ user: { id: "location-user", role: "user" }, status: "accepted", termsVersion: LOCATION_TERMS_VERSION, ageConfirmed: true, clientPlatform: "web" });
      const input = { id: "snapshot", userId: "location-user", request: {}, places: [], locationUsed: true, locationConsentId: accepted.id, stateTextUsed: false };
      await recordRecommendationRunSafely(input);
      assert.equal(restoredQuery("SELECT count(*) FROM recommendation_runs WHERE id='snapshot'"), "1");
      await Promise.all([
        recordRecommendationRunSafely({ ...input, id: "racing-snapshot" }),
        recordLocationConsent({ user: { id: "location-user", role: "user" }, status: "withdrawn", termsVersion: LOCATION_TERMS_VERSION, ageConfirmed: false, clientPlatform: "web" }),
      ]);
      await recordRecommendationRunSafely({ ...input, id: "late-snapshot" });
      assert.equal(restoredQuery("SELECT count(*) FROM recommendation_runs WHERE user_id='location-user' AND location_used"), "0");

      // 철회 뒤 재동의가 있는 복원본에서도 철회 이전 잔존 자료만 제거한다.
      restoredQuery(`DELETE FROM location_consent_events WHERE user_id='location-user';
        INSERT INTO location_consent_events VALUES ('reaccepted','location-user','key','accepted','current',true,'web','2026-03-01');
        INSERT INTO recommendation_runs(id,user_id,location_used,created_at) VALUES ('old-restored','location-user',true,'2026-01-01'),('new-allowed','location-user',true,'2026-03-01');
        INSERT INTO location_usage_logs VALUES ('old-restored','location-user','key','2026-01-01'),('new-allowed','location-user','key','2026-03-01');`);
      await replayLocationWithdrawal("location-user", new Date("2026-02-01T00:00:00Z"), true);
      assert.equal(restoredQuery("SELECT count(*) FROM recommendation_runs WHERE id='old-restored'"), "0");
      assert.equal(restoredQuery("SELECT count(*) FROM recommendation_runs WHERE id='new-allowed'"), "1");
      assert.equal(restoredQuery("SELECT count(*) FROM location_usage_logs WHERE id='old-restored'"), "0");
      assert.equal(restoredQuery("SELECT count(*) FROM location_usage_logs WHERE id='new-allowed'"), "1");
      assert.equal(restoredQuery("SELECT status FROM location_consent_events WHERE id='reaccepted'"), "accepted");

      // 운영 점검 역시 실제 ORM/읽기 전용 트랜잭션으로 시험한다. 운영 DB는 사용하지 않는다.
      restoredQuery(`
        CREATE TYPE "ReportReason" AS ENUM ('inappropriate','copyright','privacy','spam','other');
        CREATE TYPE "ReportStatus" AS ENUM ('pending','reviewing','resolved','dismissed');
        CREATE TYPE "LogLevel" AS ENUM ('info','warning','error');
        ALTER TABLE content_reports ADD COLUMN reason "ReportReason" DEFAULT 'privacy', ADD COLUMN status "ReportStatus" DEFAULT 'pending';
        ALTER TABLE system_logs ADD COLUMN message text DEFAULT '', ADD COLUMN level "LogLevel" DEFAULT 'info';
      `);
      const { inspectLegalOperations, recordRightsMaintenanceSuccess } = await import("../../src/server/legal/operations");
      const { hashServiceTerms } = await import("../../src/server/legal/serviceTerms");
      const legalDocument = { title: "이용약관", summary: "시험 안내", importantTerms: ["중요 내용"], sections: [{ title: "범위", paragraphs: ["기록 보관"] }] };
      await client.serviceTermsRelease.create({ data: {
        version: "operational-test", document: legalDocument, documentHash: hashServiceTerms(legalDocument),
        publishedAt: new Date("2026-11-01T00:00:00Z"), effectiveAt: new Date("2026-12-01T00:00:00Z"), noticeDays: 30, approvalReference: "TEST-123",
      } });
      const observedAt = new Date("2026-12-02T00:00:00Z");
      await recordRightsMaintenanceSuccess(observedAt);
      const observations = await inspectLegalOperations(observedAt, { SERVICE_TERMS_WORKFLOW_ENABLED: "true" });
      assert.equal(observations.terms.status, "observed");
      assert.equal(observations.terms.data?.stage, "effective_not_enforced");
      assert.equal(observations.terms.data?.currentAcceptances, 0);
      assert.equal(observations.terms.data?.documentIntegrity, true);
      assert.equal(observations.rights.status, "observed");
      assert.equal(observations.rights.data?.recentSuccessfulApplyObserved, true);
      assert.equal(observations.rights.data?.schedulerInstallationVerified, false);
      assert.equal(observations.operationalCompletionVerified, false);
      assert.equal(query("SELECT count(*) FROM service_terms_releases"), "1", "조회 도구 시험은 원본 DB에 쓰지 않는다.");

      await t.test("푸시 정리는 실제 DB에서 조회 무변경·30일 경계·참조 보존·실패 롤백을 지킨다", async () => {
        for (const name of ["20260831150000_add_push_devices", "20260901130000_add_push_delivery_observability"]) {
          restoredQuery(readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
        }
        restoredQuery(`
          INSERT INTO push_devices(id,user_id,installation_id,platform,token,enabled,invalidated_at,updated_at) VALUES
            ('active','location-other','active','android','test-active',true,NULL,now()),
            ('disabled','location-other','disabled','android','test-disabled',false,NULL,now()),
            ('invalid','location-other','invalid','ios','test-invalid',true,now(),now());
          INSERT INTO push_deliveries(id,user_id,device_id,platform,provider,message_type,status,created_at,entity_id,error_message) VALUES
            ('old',NULL,NULL,'android','fcm','test','sent','2026-09-19','old-reference','old-error'),
            ('boundary','location-other','active','android','fcm','test','sent','2026-09-20',NULL,NULL),
            ('recent','location-other','disabled','android','fcm','test','failed','2026-09-20 00:00:00.001','private-reference','private-error');
        `);
        const { purgePushRetention } = await import("../../src/server/notifications/retention");
        const now = new Date("2026-10-20T00:00:00Z");
        assert.deepEqual(await purgePushRetention(now), { mode: "dry-run", cutoff: new Date("2026-09-20T00:00:00Z"), invalidDevices: 2, expiredDeliveries: 2 });
        assert.equal(restoredQuery("SELECT count(*) FROM push_devices"), "3");
        assert.equal(restoredQuery("SELECT count(*) FROM push_deliveries WHERE error_message IS NOT NULL"), "2");
        restoredQuery(`CREATE FUNCTION fail_push_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cleanup failure'; END $$;
          CREATE TRIGGER fail_push_cleanup BEFORE UPDATE ON push_deliveries FOR EACH ROW EXECUTE FUNCTION fail_push_cleanup();`);
        await assert.rejects(purgePushRetention(now, true));
        assert.equal(restoredQuery("SELECT count(*) FROM push_devices"), "3", "중간 실패 시 토큰 삭제도 롤백한다.");
        assert.equal(restoredQuery("SELECT count(*) FROM push_deliveries"), "3");
        restoredQuery("DROP TRIGGER fail_push_cleanup ON push_deliveries; DROP FUNCTION fail_push_cleanup()");
        assert.deepEqual(await purgePushRetention(now, true), { mode: "applied", cutoff: new Date("2026-09-20T00:00:00Z"), invalidDevices: 2, expiredDeliveries: 2, minimized: 1 });
        assert.equal(restoredQuery("SELECT string_agg(id,',') FROM push_devices"), "active");
        assert.equal(restoredQuery("SELECT id || ':' || (device_id IS NULL)::text || ':' || (entity_id IS NULL AND error_message IS NULL)::text FROM push_deliveries"), "recent:true:true");
        assert.equal((await purgePushRetention(now, true)).invalidDevices, 0, "재실행해도 보존한 활성 토큰은 삭제하지 않는다.");
      });
      await t.test("신규 보관정책은 합성 자료만 있는 별도 복원 DB에서 실제 ORM으로 검증한다", async t => {
        const { verifyOperationalRetention } = await import("./operational-retention-scenario");
        await verifyOperationalRetention(t, client, restoredQuery, socket);
        assert.equal(query("SELECT count(*) FROM service_terms_releases"), "1", "운영자료가 아닌 원본 시험 DB도 그대로 유지한다.");
      });
    } finally {
      await client.$disconnect();
      delete (globalThis as { prisma?: unknown }).prisma;
      if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
      if (originalLedger === undefined) delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; else process.env.PRIVACY_REPLAY_LEDGER_ENABLED = originalLedger;
    }
  });
});
