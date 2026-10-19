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
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined, PGPASSWORD: undefined, PGPASSFILE: undefined, PGSSLMODE: "disable" };
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
  const expectedMajor = process.env.LEGAL_POSTGRES_EXPECTED_MAJOR;
  if (expectedMajor) {
    assert.match(expectedMajor, /^[1-9][0-9]+$/);
    assert.equal(Math.floor(serverVersion / 10000), Number(expectedMajor), "요청한 PostgreSQL 주 버전으로 시험해야 한다.");
  }
  t.diagnostic(`isolated PostgreSQL server_version_num=${serverVersion}`);
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
  await t.test("관리자 접근 증거를 별도 보존하고 계정 삭제·변조·조기 파기를 막는다", () => {
    assert.equal(query("SELECT count(*) FROM admin_journal_access_audits"), "1");
    assert.equal(query("SELECT case_reference || ':' || array_to_string(entry_ids, ',') FROM admin_journal_access_audits"), "CASE-123:entry-1,entry-2");
    assert.doesNotMatch(query("SELECT row_to_json(a)::text FROM admin_journal_access_audits a"), /DO-NOT-COPY/);
    query("INSERT INTO users VALUES ('legacy-admin'),('legacy-owner'); DELETE FROM users WHERE id IN ('legacy-admin','legacy-owner'); DELETE FROM system_logs");
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
  await t.test("공고일 30일 미만 시행을 DB도 거절한다", () => {
    rejected("INSERT INTO service_terms_releases VALUES ('invalid','{}','hash','2026-10-19','2026-11-17','APPROVAL-1',30)", /check constraint/);
    query("INSERT INTO service_terms_releases VALUES ('v1','{}','hash','2026-10-19','2026-11-18','APPROVAL-1',30)");
  });
  await t.test("공고 원문의 UPDATE·DELETE를 실제 트리거가 거절한다", () => {
    rejected("UPDATE service_terms_releases SET document='{}' WHERE version='v1'", /immutable/);
    rejected("DELETE FROM service_terms_releases WHERE version='v1'", /immutable/);
  });
  await t.test("연령·중요 내용 확인 누락과 중복 동의를 거절하고 계정 삭제 시 영수증을 지운다", () => {
    query("INSERT INTO users VALUES ('subject')");
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
  await t.test("백업을 별도 임시 DB로 복원해도 원문 변경 금지·통지 제약과 기존 증빙이 보존된다", () => {
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
  });
});
