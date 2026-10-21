import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { verifyIsolatedRestore, type RestoreReferences } from "../src/server/legal/isolatedRestoreVerification";

function fixture() {
  const objects = [{ key: "journal-images/private/photo.webp", bytes: Buffer.from("synthetic-photo") }, { key: "journal-books/private/book.pdf", bytes: Buffer.from("synthetic-pdf") }];
  const manifest = { objects: objects.map(item => ({ key: item.key, file: `${Buffer.from(item.key).toString("base64url")}.object`, size: item.bytes.length, sha256: createHash("sha256").update(item.bytes).digest("hex") })) };
  const refs: RestoreReferences = { accounts: 1, journals: 1, books: 1, migrations: 75, failedMigrations: 0, unvalidatedForeignKeys: 0, postgresMajor: 17,
    images: [objects[0].key], pdfs: [{ key: objects[1].key, pageCount: 2 }], externalImages: 0, embeddedImages: 0 };
  const restored = new Map<string, Buffer>();
  const io = {
    read: async (file: string) => objects[manifest.objects.findIndex(item => item.file === file)].bytes,
    put: async (item: { key: string }, bytes: Buffer) => { restored.set(item.key, bytes); },
    get: async (key: string) => restored.get(key)!,
    image: async (bytes: Buffer) => { assert.equal(bytes.toString(), "synthetic-photo"); },
    pdf: async () => 2,
  };
  return { manifest, refs, io, restored };
}

test("격리 저장소 쓰기·재조회·바이트 해시·기록 참조·이미지 해독·PDF 쪽 수를 검사한다", async () => {
  const f = fixture();
  const result = await verifyIsolatedRestore(f.manifest, f.refs, f.io);
  assert.equal(result.objectsRestoredAndReadBack, 2);
  assert.equal(result.imagesDecoded, 1);
  assert.equal(result.pdfsDecoded, 1);
  assert.equal(result.productionDatabaseTouched, false);
  assert.equal(result.productionObjectStorageTouched, false);
  assert.equal(result.privacyReplayPerformed, false);
  assert.doesNotMatch(JSON.stringify(result), /private|synthetic|photo\.webp|book\.pdf/);
});

test("손상·누락·잘못된 DB·쪽 수·메모리 한도 초과를 성공 처리하지 않는다", async () => {
  const wrongDb = fixture(); wrongDb.refs.postgresMajor = 16;
  await assert.rejects(verifyIsolatedRestore(wrongDb.manifest, wrongDb.refs, wrongDb.io), /DATABASE_VALIDATION/);
  const missing = fixture(); missing.refs.images.push("missing");
  await assert.rejects(verifyIsolatedRestore(missing.manifest, missing.refs, missing.io), /IMAGE_REFERENCE_MISSING/);
  const wrongReadback = fixture(); wrongReadback.io.get = async () => Buffer.from("damaged");
  await assert.rejects(verifyIsolatedRestore(wrongReadback.manifest, wrongReadback.refs, wrongReadback.io), /RESTORED_OBJECT_MISMATCH/);
  const wrongPages = fixture(); wrongPages.io.pdf = async () => 3;
  await assert.rejects(verifyIsolatedRestore(wrongPages.manifest, wrongPages.refs, wrongPages.io), /PDF_PAGE_COUNT_MISMATCH/);
  const oversize = fixture(); oversize.manifest.objects[0].size = 33 * 1024 * 1024;
  await assert.rejects(verifyIsolatedRestore(oversize.manifest, oversize.refs, oversize.io), /OBJECT_METADATA_INVALID/);
  const decoderFailure = fixture(); decoderFailure.io.image = async () => { throw new Error("DECODE_FAILED"); };
  await assert.rejects(verifyIsolatedRestore(decoderFailure.manifest, decoderFailure.refs, decoderFailure.io), /DECODE_FAILED/);
});

test("실제 백업 시험은 운영 Compose·자격증명·포트 공개 없이 RAM 자원만 쓴다", async () => {
  const path = "scripts/ops/tuti-prod-backup-restore-test";
  const source = await readFile(path, "utf8");
  assert.equal(spawnSync("sh", ["-n", path]).status, 0);
  assert.doesNotMatch(source, /docker compose|--env-file|--publish|--privileged|--network host|timeout 240 limits/);
  for (const value of ["--network none", '--network "container:$garage_name"', '--tmpfs "/var/lib/postgresql/data:', "--tmpfs /var/lib/garage:", '--label "tuti.restore-test=$test_id"', '"$backup_dir:/backup:ro"', "--log-driver none", "--cap-drop ALL", "--memory", '"$owner" != "$test_id"', "--no-owner --no-privileges --exit-on-error"]) assert.ok(source.includes(value), value);
  assert.ok(source.indexOf('sh scripts/ops/tuti-prod-backup-verify "$backup_id"') < source.indexOf('limits 768m --detach'));
  assert.match(source, /MemAvailable/);
  assert.match(source, /CPUCfsQuota/);
  assert.match(source, /sandboxResourcesRemoved/);
  assert.match(source, /cat \/proc\/1\/comm/);
  assert.match(source, /createdb --username postgres --template template0 restore_test/);
});

test("래퍼 전체 대역 실행은 성공·복원 실패 모두 자기 시험 컨테이너만 정리한다", async t => {
  // NAS의 /tmp는 noexec이므로 대역 실행 파일만 작업 트리의 일회성 폴더에 둔다.
  const root = await mkdtemp(join(process.cwd(), ".restore-wrapper-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["bin", ".ops-state", "scripts/ops", "backups/20261020-233213", "containers"]) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, "backups/20261020-233213/postgres.dump"), "synthetic-dump");
  await writeFile(join(root, "scripts/ops/tuti-prod-backup-verify"), "#!/bin/sh\nexit 0\n");
  await writeFile(join(root, "scripts/ops/isolated-restore-observations.sql"), "SELECT 1;\n");
  await writeFile(join(root, "bin/git"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await writeFile(join(root, "bin/docker"), `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2), root = process.env.MOCK_RESTORE_ROOT;
fs.appendFileSync(path.join(root, 'calls'), JSON.stringify(a) + '\\n');
const state = name => path.join(root, 'containers', name);
if (a[0] === 'image') process.exit(0);
if (a[0] === 'info') { console.log(a.join(' ').includes('MemoryLimit') ? 'true' : 'false'); process.exit(0); }
if (a[0] === 'run') {
  if (a.includes('id')) { console.log('999'); process.exit(0); }
  const name = a[a.indexOf('--name') + 1], label = a[a.indexOf('--label') + 1].split('=')[1];
  fs.writeFileSync(state(name), label);
  if (name.endsWith('-node')) { fs.unlinkSync(state(name)); console.log('{"testObjectsVerified":true}'); }
  process.exit(0);
}
if (a[0] === 'exec') {
  if (a.includes('pg_restore') && process.env.FAIL_RESTORE === 'true') { console.error('ERROR: private-row already exists'); process.exit(1); }
  if (a.includes('psql')) console.log('{}');
  process.exit(0);
}
if (a[0] === 'container' && a[1] === 'inspect') {
  const name = a[a.length - 1];
  if (!fs.existsSync(state(name))) process.exit(1);
  if (a.includes('--format')) console.log(fs.readFileSync(state(name), 'utf8'));
  process.exit(0);
}
if (a[0] === 'rm') {
  const name = a[a.length - 1];
  if (!name.startsWith('tuti-restore-test-')) process.exit(1);
  fs.unlinkSync(state(name)); process.exit(0);
}
process.exit(1);
`, { mode: 0o700 });
  const source = (await readFile("scripts/ops/tuti-prod-backup-restore-test", "utf8"))
    .replace('"$(id -u)" != 0', '"0" != 0')
    .replace('project_dir="/var/services/homes/Tutiadmin/source/Tuti"', `project_dir=${JSON.stringify(root)}`)
    .replace('backup_root="/volume1/tuti/backups/full"', `backup_root=${JSON.stringify(join(root, "backups"))}`)
    .replace('PATH="/usr/local/bin:', `PATH="${join(root, "bin")}:/usr/local/bin:`)
    .replaceAll('git -c safe.directory=', `${join(root, "bin/git")} -c safe.directory=`)
    .replace(/available_kb="\$\(awk[^\n]+/, 'available_kb="8388608"');
  const wrapper = join(root, "wrapper.sh");
  await writeFile(wrapper, source);
  const run = (fail: boolean) => spawnSync("sh", [wrapper, "20261020-233213"], { env: { ...process.env, MOCK_RESTORE_ROOT: root, FAIL_RESTORE: String(fail) }, encoding: "utf8", timeout: 15000 });
  const success = run(false);
  assert.equal(success.status, 0, success.stdout + success.stderr);
  assert.match(success.stdout, /sandboxResourcesRemoved.*true/);
  const failure = run(true);
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.match(failure.stderr, /isolated-postgres-restore/);
  assert.match(failure.stderr, /DATABASE_OBJECT_ALREADY_EXISTS/);
  assert.doesNotMatch(failure.stderr + failure.stdout, /private-row/);
  assert.match(failure.stdout, /sandboxResourcesRemoved.*true/);
  const calls = (await readFile(join(root, "calls"), "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.ok(calls.some(args => args.includes("--network") && args.includes("none")));
  assert.ok(calls.filter(args => args[0] === "rm").every(args => args.at(-1)?.startsWith("tuti-restore-test-")));
});
