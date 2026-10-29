import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { Prisma } from "@/generated/prisma/client";
import { requireHarumadiAccess } from "@/server/harumadi/access";
import { INVITE_TOKEN, parseTogetherComment } from "@/shared/api/harumadiTogether";

test("함께 채우기 권한은 책별 활성 참여자에게만 주고 관리는 만든 사람만 한다", async t => {
  const previous = process.env.HARUMADI_TOGETHER_ENABLED;
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.HARUMADI_TOGETHER_ENABLED; else process.env.HARUMADI_TOGETHER_ENABLED = previous; });
  const tx = { harumadi: { findUnique: async ({ where, select }: { where: { id: string }; select: { members: { where: { userId: string } } } }) => where.id === "shared-book" ? {
    id: where.id, ownerId: "owner", revision: 1, accessRevision: 2, collaborationStartedAt: new Date(),
    members: select.members.where.userId === "participant" ? [{ id: "membership" }] : [],
  } : null } } as unknown as Prisma.TransactionClient;
  assert.equal((await requireHarumadiAccess(tx, "owner", "shared-book", true)).ownerId, "owner");
  assert.equal((await requireHarumadiAccess(tx, "participant", "shared-book")).id, "shared-book");
  await assert.rejects(requireHarumadiAccess(tx, "participant", "shared-book", true), { status: 404 });
  await assert.rejects(requireHarumadiAccess(tx, "outsider", "shared-book"), { status: 404 });
  await assert.rejects(requireHarumadiAccess(tx, "participant", "another-book"), { status: 404 });
  process.env.HARUMADI_TOGETHER_ENABLED = "false";
  await assert.rejects(requireHarumadiAccess(tx, "participant", "shared-book"), { status: 404 });
});

test("초대 원문은 해시로 저장하며 댓글 입력은 텍스트와 한 단계 답글에 한정한다", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  const { hashInvite } = await import("@/server/harumadi/together");
  const token = "a".repeat(43);
  assert.ok(INVITE_TOKEN.test(token));
  assert.match(hashInvite(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashInvite(token), token);
  assert.throws(() => hashInvite("short"), { status: 404 });
  assert.deepEqual(parseTogetherComment({ body: " 함께한 하루 ", parentId: "parent" }), { body: "함께한 하루", parentId: "parent" });
  for (const input of [{ body: " " }, { body: "가".repeat(1001) }, { body: "답글", parentId: "../another-book" }]) assert.equal(parseTogetherComment(input), null);
});

test("계정 탈퇴와 공동작성 종료는 원본·연결·다른 사람 PDF를 구분한다", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const sql = readFileSync("prisma/migrations/20261029150000_harumadi_together/migration.sql", "utf8");
  const together = readFileSync("src/server/harumadi/together.ts", "utf8");
  const end = together.slice(together.indexOf("export async function endMember"), together.indexOf("export async function leaveHarumadi"));
  assert.match(end, /harumadiEntryLink\.deleteMany/);
  assert.doesNotMatch(end, /journalEntry\.delete|harumadiPdf\./);
  assert.match(sql, /UPDATE harumadi_comments SET body = '', author_id = NULL/);
  assert.doesNotMatch(sql, /DELETE FROM harumadi_pdfs/);
  const pdf = schema.slice(schema.indexOf("model HarumadiPdf"), schema.indexOf("model JournalShareTrace"));
  assert.doesNotMatch(pdf, /harumadiId.*@relation/);
});

test("권한 철회·초대 취소·마디 빼기·댓글 삭제는 복원 방지 원장과 연결한다", () => {
  assert.match(readFileSync("src/server/harumadi/access.ts", "utf8"), /pg_advisory_xact_lock\(hashtextextended\([^\n]+\)\)::text AS lock_result/);
  const ledger = readFileSync("src/server/legal/privacyReplayLedger.ts", "utf8");
  for (const kind of ["harumadi_member_left", "harumadi_invite_revoked", "harumadi_entry_removed", "harumadi_comment_deleted"]) assert.ok(ledger.includes(kind));
  assert.match(readFileSync("src/server/legal/privacyReplay.ts", "utf8"), /inspectTogetherReplay/);
  assert.match(readFileSync("src/server/harumadi/replay.ts", "utf8"), /where: \{ id: row\.id \}/);
});
