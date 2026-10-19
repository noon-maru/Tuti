import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { planBackupRetention, applyBackupRetention } from "@/server/legal/backupRetention";

test("30일 백업 파기는 mtime이 아니라 manifest 생성 시각을 사용하고 기본 조회는 삭제하지 않는다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tuti-backup-retention-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [id, createdAt] of [["20260918-000000", "2026-09-18T00:00:00Z"], ["20260919-000000", "2026-09-19T00:00:00Z"], ["20261018-000000", "2026-10-18T00:00:00Z"]]) {
    await mkdir(join(root, id));
    await writeFile(join(root, id, "manifest.txt"), `backup_version=1\ncreated_at=${createdAt}\nrestore_scope=database-and-journal-objects\n`);
  }
  const plan = await planBackupRetention(root, 30, new Date("2026-10-19T00:00:00Z"));
  assert.deepEqual(plan.candidates.map((item) => item.id), ["20260918-000000"]);
  assert.ok(await stat(join(root, "20260918-000000")));
  assert.equal(await applyBackupRetention(root, plan), 1);
  await assert.rejects(stat(join(root, "20260918-000000")));
  assert.ok(await stat(join(root, "20260919-000000")));
});
test("임의 경로·심볼릭 링크·변경된 대상은 재귀 파기 대상으로 사용하지 않는다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tuti-backup-retention-"));
  const outside = await mkdtemp(join(tmpdir(), "tuti-backup-outside-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await symlink(outside, join(root, "20260901-000000"));
  const plan = await planBackupRetention(root, 30, new Date("2026-10-19T00:00:00Z"));
  assert.equal(plan.skipped, 1);
  assert.equal(plan.candidates.length, 0);
  await assert.rejects(applyBackupRetention(root, { ...plan, candidates: [{ id: "../outside", createdAt: "2026-09-01T00:00:00Z" }] }));
  assert.ok(await stat(outside));
});
