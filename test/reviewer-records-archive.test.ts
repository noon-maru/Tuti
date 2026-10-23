import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import sharp from "sharp";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
let users = 1;
let books = 0;
let changed = false;
let sensitive = false;
const calls: string[] = [];
const rows = () => [1, 2, 3].map(i => ({ id: `test-${i}`, title: "테스트", content: changed ? "바뀐 내용" : "본문", image: "data:image/png;base64,example", crowd: "한적", difficulty: "낮음", theme: "산책", placeId: null, placeName: "예시 공간", visitedAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"), sensitiveContent: sensitive, sensitiveWithdrawnAt: null }));
(globalThis as { prisma?: unknown }).prisma = { $transaction: async (operation: (tx: unknown) => Promise<unknown>, options: unknown) => {
  assert.deepEqual(options, { isolationLevel: "RepeatableRead" });
  return operation({
    $executeRaw: async (sql: TemplateStringsArray) => { assert.equal(sql.join(""), "SET TRANSACTION READ ONLY"); calls.push("read-only"); },
    user: { findMany: async (input: { where: { id: string; role: string; authIdentities: { some: { email: { equals: string } } } } }) => {
      assert.equal(input.where.id, "f0181f76-8ee4-43cc-b4c4-0d214afc4aeb");
      assert.equal(input.where.role, "user");
      assert.equal(input.where.authIdentities.some.email.equals, "openapi@tuti.today");
      return users ? [{ id: input.where.id }] : [];
    } },
    journalBook: { count: async () => books }, journalEntry: { findMany: async () => rows() },
  });
} };
const { SOURCE_USER_ID, sourceSnapshot, validateArchive, verifyArchiveFiles, decodeImage, imageBytes } = await import("../scripts/reviewer-records-archive");
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("지정 계정의 테스트 기록만 읽기 전용 스냅샷으로 조회하며 범위 변경은 거절한다", async () => {
  const initial = await sourceSnapshot();
  assert.equal(initial.records.length, 3);
  assert.deepEqual(calls, ["read-only"]);
  users = 0; await assert.rejects(sourceSnapshot()); users = 1;
  books = 1; await assert.rejects(sourceSnapshot()); books = 0;
  sensitive = true; await assert.rejects(sourceSnapshot()); sensitive = false;
  changed = true; assert.notEqual((await sourceSnapshot()).fingerprint, initial.fingerprint); changed = false;
});

test("외부 URL·잘못된 이미지 인코딩을 거절하고 실제 이미지 디코딩을 검사한다", async () => {
  await assert.rejects(imageBytes("https://example.invalid/private"));
  await assert.rejects(imageBytes("data:image/png;base64,%%%"));
  await assert.rejects(decodeImage(Buffer.from("not an image")));
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#8CBDEF" } }).png().toBuffer();
  assert.equal(await decodeImage(await imageBytes(`data:image/png;base64,${image.toString("base64")}`)), "image/png");
});

test("사본 해시·이미지 해독·원본 비교와 변조/링크/범위 밖 정보 거절을 검증한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "tuti-reviewer-archive-test-"));
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const snapshot = await sourceSnapshot();
  const archive = {
    version: 1, purpose: "operator-owned-review-test-content", sourceUserId: SOURCE_USER_ID, sourceFingerprint: snapshot.fingerprint,
    exportedAt: new Date().toISOString(), reviewBy: new Date(Date.now() + 30 * 86400000).toISOString(), importPolicy: "new-account-new-ids-private-no-consent-copy",
    records: snapshot.records.map((row, i) => ({ sourceEntryId: row.id, title: row.title, content: row.content, crowd: row.crowd, difficulty: row.difficulty, theme: row.theme, placeId: row.placeId, placeName: row.placeName, visitedAt: row.visitedAt.toISOString(), image: { file: `image-0${i + 1}.bin`, bytes: image.byteLength, sha256: sha(image), contentType: "image/png" } })),
  };
  const raw = JSON.stringify(archive);
  try {
    await writeFile(join(root, "archive.json"), raw, { mode: 0o600 });
    await writeFile(join(root, "archive.sha256"), sha(raw), { mode: 0o600 });
    for (const record of archive.records) await writeFile(join(root, record.image.file), image, { mode: 0o600 });
    const result = await verifyArchiveFiles(root, true);
    assert.equal(result.imagesDecoded, 3); assert.equal(result.databaseChanged, false); assert.equal(result.accountDeleted, false);
    changed = true; await assert.rejects(verifyArchiveFiles(root, true)); changed = false;
    await writeFile(join(root, "image-01.bin"), "corrupt"); await assert.rejects(verifyArchiveFiles(root, false));
    await rm(join(root, "image-01.bin")); await symlink(join(root, "image-02.bin"), join(root, "image-01.bin")); await assert.rejects(verifyArchiveFiles(root, false));
    assert.throws(() => validateArchive({ ...archive, accessToken: "not-allowed" }));
    assert.throws(() => validateArchive({ ...archive, records: [{ ...archive.records[0], publicationConsentedAt: "not-allowed" }, ...archive.records.slice(1)] }));
    assert.throws(() => validateArchive({ ...archive, records: [{ ...archive.records[0], image: { ...archive.records[0].image, file: "../outside" } }, ...archive.records.slice(1)] }));
  } finally { changed = false; await rm(root, { recursive: true, force: true }); }
});

test("운영 도구는 원본 덮어쓰기·삭제·시행 없이 제한된 사본과 검토 코드만 연결한다", () => {
  const wrapper = "scripts/ops/tuti-reviewer-records-archive";
  const source = readFileSync(wrapper, "utf8");
  assert.equal(spawnSync("sh", ["-n", wrapper]).status, 0);
  assert.match(source, /transfer_root=\/volume1\/tuti\/backups\/reviewer-transfer/);
  assert.match(source, /hash-object --no-filters/);
  assert.match(source, /verify:2 \| verify-with-source:2/);
  assert.match(source, /mount_mode=ro/);
  assert.doesNotMatch(source, /rm -rf|deleteUser|--privileged|chmod.*777/);
});
