import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const path = "scripts/ops/tuti-empty-account-cleanup";
const source = readFileSync(path, "utf8");

test("NAS ACL 우회는 소스 권한 변경이나 root 실행 대신 임시 코드 읽기 전용 연결로 한정한다", () => {
  assert.equal(spawnSync("sh", ["-n", path]).status, 0);
  assert.match(source, /mktemp -d \/tmp\/tuti-empty-account-code\./);
  assert.ok(source.includes('chmod 0755 "$code_dir"'));
  assert.ok(source.includes('install -m 0644 scripts/cleanup-empty-accounts.ts "$code_dir/cleanup-empty-accounts.ts"'));
  assert.ok(source.includes('install -m 0644 src/server/admin/users.ts "$code_dir/users.ts"'));
  assert.ok(source.includes('hash-object --no-filters "$code_dir/$staged"'));
  assert.ok(source.includes('--user 1000:1000'));
  assert.ok(source.includes('"$code_dir/cleanup-empty-accounts.ts:/app/scripts/cleanup-empty-accounts.ts:ro"'));
  assert.ok(source.includes('"$code_dir/users.ts:/app/src/server/admin/users.ts:ro"'));
  assert.doesNotMatch(source, /--volume "\$project_dir\//);
  assert.doesNotMatch(source, /chmod.*(?:777|\s-R)|synoacltool|--privileged|--user 0:0/);
});

test("임시 코드만 정리하며 복사·해시 검사 실패 시 DB 명령에 도달하지 않는다", () => {
  assert.ok(source.includes('rm -f "$code_dir/cleanup-empty-accounts.ts" "$code_dir/users.ts"'));
  assert.ok(source.includes('rmdir "$code_dir"'));
  assert.match(source, /trap cleanup_code EXIT/);
  assert.doesNotMatch(source, /rm -rf/);
  assert.ok(source.indexOf('if [ "$expected" != "$actual" ]') < source.indexOf("if docker compose"));
});
