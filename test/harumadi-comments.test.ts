import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

test("댓글은 책별 권한·본인 수정·1단 답글·중복 재시도·부모 삭제를 구분한다", async t => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
  type Row = { id: string; harumadiId: string; authorId: string | null; parentId: string | null; body: string; revision: number; deletedAt: Date | null };
  const rows = new Map<string, Row>();
  const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key as keyof Row] === value);
  const db = {
    $queryRaw: async () => [],
    harumadi: { findUnique: async ({ where, select }: { where: { id: string }; select: { members: { where: { userId: string } } } }) => where.id === "book" ? {
      id: "book", ownerId: "owner", revision: 1, accessRevision: 0, collaborationStartedAt: new Date(), members: select.members.where.userId === "member" ? [{ id: "membership" }] : [],
    } : null },
    authIdentity: { findFirst: async () => ({ id: "login" }) },
    harumadiComment: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].find(row => matches(row, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      create: async ({ data }: { data: Omit<Row, "revision" | "deletedAt"> }) => { rows.set(data.id, { ...data, revision: 1, deletedAt: null }); return { id: data.id }; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> & { revision: { increment: number } } }) => {
        const row = rows.get(where.id)!; const { revision, ...other } = data; Object.assign(row, other, { revision: row.revision + revision.increment }); return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { body: string; revision: { increment: number } } }) => {
        const row = [...rows.values()].find(row => matches(row, where)); if (!row) return { count: 0 }; row.body = data.body; row.revision += data.revision.increment; return { count: 1 };
      },
    },
  };
  const previous = (globalThis as { prisma?: unknown }).prisma;
  (globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (work: (tx: typeof db) => Promise<unknown>) => work(db) };
  t.after(() => { (globalThis as { prisma?: unknown }).prisma = previous; });
  const { saveComment, eraseComment } = await import("@/server/harumadi/comments");
  const requestId = randomUUID();
  const root = await saveComment("owner", "book", { body: "좋았던 하루", requestId });
  assert.equal((await saveComment("owner", "book", { body: "좋았던 하루", requestId })).id, root.id);
  assert.equal(rows.size, 1);
  const reply = await saveComment("member", "book", { body: "나도 좋았어", parentId: root.id });
  await assert.rejects(saveComment("outsider", "book", { body: "다른 사람" }), { status: 404 });
  await assert.rejects(saveComment("member", "another-book", { body: "다른 책", parentId: root.id }), { status: 404 });
  await assert.rejects(saveComment("member", "book", { body: "깊은 답글", parentId: reply.id }), { status: 404 });
  await assert.rejects(saveComment("owner", "book", { body: "대신 수정", parentId: root.id }, reply.id, 1), { status: 409 });
  await eraseComment("owner", "book", root.id);
  assert.equal(rows.get(root.id)?.body, ""); assert.equal(rows.get(root.id)?.authorId, null);
  assert.equal(rows.get(reply.id)?.body, "나도 좋았어");
  await assert.rejects(saveComment("member", "book", { body: "삭제 후 새 답글", parentId: root.id }), { status: 404 });
  await saveComment("member", "book", { body: "내 답글 수정", parentId: root.id }, reply.id, 1);
  assert.equal(rows.get(reply.id)?.body, "내 답글 수정");
  await assert.rejects(saveComment("member", "book", { body: "오래된 수정", parentId: root.id }, reply.id, 1), { status: 409 });
  await eraseComment("owner", "book", reply.id);
  assert.equal(rows.get(reply.id)?.body, "");
});
