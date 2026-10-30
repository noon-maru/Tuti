import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initializePrivacyReplayLedger, readPrivacyReplaySnapshot, isTogetherReplayKind } from "@/server/legal/privacyReplayLedger";

test("소유자의 공동작성 전체 종료·롤백·복원은 원본과 새 참여 세대를 구분한다", async t => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-end-together-"));
  const oldPrisma = (globalThis as { prisma?: unknown }).prisma;
  const keys = ["HARUMADI_TOGETHER_ENABLED", "PRIVACY_REPLAY_LEDGER_ENABLED", "PRIVACY_REPLAY_LEDGER_PATH", "PRIVACY_REPLAY_HMAC_SECRET"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  t.after(async () => {
    (globalThis as { prisma?: unknown }).prisma = oldPrisma;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await rm(directory, { recursive: true, force: true });
  });
  await initializePrivacyReplayLedger();
  const started = new Date("2026-10-01T00:00:00Z");
  const originalEntries = [{ id: "mine", ownerId: "owner" }, { id: "a", ownerId: "member-a" }, { id: "b", ownerId: "member-b" }];
  let state = {
    books: [{ id: "book", ownerId: "owner", collaborationStartedAt: started as Date | null, revision: 1, accessRevision: 1 }, { id: "other", ownerId: "owner", collaborationStartedAt: started as Date | null, revision: 1, accessRevision: 1 }],
    members: ["member-a", "member-b"].map((userId, i) => ({ id: `member-${i}`, harumadiId: "book", userId, endedAt: null as Date | null })),
    invites: [{ id: "pending", harumadiId: "book", revokedAt: null as Date | null }, { id: "accepted", harumadiId: "book", revokedAt: null as Date | null }, { id: "other-invite", harumadiId: "other", revokedAt: null as Date | null }],
    comments: ["owner", "member-a", "member-b"].map((authorId, i) => ({ id: `comment-${i}`, harumadiId: "book", authorId: authorId as string | null, body: "공유 댓글", deletedAt: null as Date | null, revision: 1 })),
    links: [{ id: "link-mine", harumadiId: "book", entryId: "mine" }, { id: "link-a", harumadiId: "book", entryId: "a" }, { id: "link-b", harumadiId: "book", entryId: "b" }, { id: "other-link", harumadiId: "other", entryId: "a" }],
    entries: structuredClone(originalEntries), pdfs: [{ id: "saved-pdf", ownerId: "member-a", bytes: "immutable" }],
  };
  const backup = structuredClone(state);
  type Where = { id?: string | { gt: string }; harumadiId?: string; userId?: string; endedAt?: null; revokedAt?: null; deletedAt?: null; entry?: { ownerId: string | { not: string } } };
  const matches = (row: { id: string; harumadiId?: string; userId?: string; endedAt?: Date | null; revokedAt?: Date | null; deletedAt?: Date | null; entryId?: string }, where: Where = {}) => {
    if (typeof where.id === "string" && row.id !== where.id || typeof where.id === "object" && row.id <= where.id.gt) return false;
    for (const key of ["harumadiId", "userId", "endedAt", "revokedAt", "deletedAt"] as const) if (key in where && row[key] !== where[key]) return false;
    if (where.entry) {
      const ownerId = state.entries.find(entry => entry.id === row.entryId)?.ownerId;
      if (typeof where.entry.ownerId === "string" ? ownerId !== where.entry.ownerId : ownerId === where.entry.ownerId.not) return false;
    }
    return true;
  };
  let failWrite = false, beforeWrite: (() => void) | undefined;
  const updateBook = (row: typeof state.books[number], data: { collaborationStartedAt?: Date | null; revision?: { increment: number }; accessRevision?: { increment: number } }) => {
    if (failWrite) throw new Error("synthetic database failure");
    if ("collaborationStartedAt" in data) row.collaborationStartedAt = data.collaborationStartedAt!;
    if (data.revision) row.revision += data.revision.increment;
    if (data.accessRevision) row.accessRevision += data.accessRevision.increment;
    return row;
  };
  const db = {
    $queryRaw: async () => [],
    harumadi: {
      findUnique: async ({ where, select }: { where: { id: string }; select: { members: { where: { userId: string } } } }) => {
        const row = state.books.find(book => book.id === where.id);
        return row ? { ...row, members: state.members.filter(member => member.harumadiId === row.id && member.userId === select.members.where.userId && !member.endedAt) } : null;
      },
      findMany: async ({ where }: { where: Where }) => state.books.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)),
      update: async ({ where, data }: { where: { id: string }; data: Parameters<typeof updateBook>[1] }) => updateBook(state.books.find(row => row.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: string; ownerId?: string; collaborationStartedAt?: { lt: Date } }; data: Parameters<typeof updateBook>[1] }) => {
        const rows = state.books.filter(row => row.id === where.id && (!where.ownerId || row.ownerId === where.ownerId) && (!where.collaborationStartedAt || row.collaborationStartedAt && row.collaborationStartedAt < where.collaborationStartedAt.lt));
        rows.forEach(row => updateBook(row, data)); return { count: rows.length };
      },
    },
    harumadiMember: {
      findMany: async ({ where }: { where: Where }) => state.members.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)).map(({ id, userId, ...rest }) => ({ id, userId, ...rest })),
      findUnique: async ({ where }: { where: { id: string } }) => state.members.find(row => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: Where; data: { endedAt: Date } }) => { const rows = state.members.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    },
    harumadiInvite: {
      findMany: async ({ where }: { where: Where }) => state.invites.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)),
      updateMany: async ({ where, data }: { where: Where; data: { revokedAt: Date } }) => { const rows = state.invites.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    },
    harumadiComment: {
      findMany: async ({ where }: { where: Where }) => state.comments.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)),
      updateMany: async ({ where, data }: { where: Where; data: { body: string; authorId: null; deletedAt: Date; revision: { increment: number } } }) => {
        const rows = state.comments.filter(row => matches(row, where)); rows.forEach(row => { const { revision, ...rest } = data; Object.assign(row, rest); row.revision += revision.increment; }); return { count: rows.length };
      },
    },
    harumadiEntryLink: {
      findMany: async ({ where }: { where: Where }) => state.links.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)),
      deleteMany: async ({ where }: { where: Where }) => { const before = state.links.length; state.links = state.links.filter(row => !matches(row, where)); return { count: before - state.links.length }; },
    },
  };
  (globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (work: (tx: typeof db) => Promise<unknown>, options?: unknown) => {
    if (!options && beforeWrite) { beforeWrite(); beforeWrite = undefined; }
    const before = structuredClone(state);
    try { return await work(db); } catch (error) { state = before; throw error; }
  } };
  const { endTogether } = await import("@/server/harumadi/endTogether");
  const { inspectTogetherReplay } = await import("@/server/harumadi/replay");
  await t.test("소유자 외 요청·다른 책은 거절하고 DB 실패·대상 변경은 원자적으로 보류한다", async () => {
    process.env.HARUMADI_TOGETHER_ENABLED = "false";
    await assert.rejects(endTogether("owner", "book"), { status: 503 });
    process.env.HARUMADI_TOGETHER_ENABLED = "true";
    await assert.rejects(endTogether("member-a", "book"), { status: 404 });
    await assert.rejects(endTogether("outsider", "book"), { status: 404 });
    assert.equal((await readPrivacyReplaySnapshot()).committed.length, 0);
    failWrite = true;
    await assert.rejects(endTogether("owner", "book"), /synthetic database failure/);
    assert.deepEqual(state, backup);
    failWrite = false;
    beforeWrite = () => { state.invites.push({ id: "new-pending", harumadiId: "book", revokedAt: null }); };
    await assert.rejects(endTogether("owner", "book"), { status: 409 });
    assert.equal(state.books[0].collaborationStartedAt?.getTime(), started.getTime());
    assert.equal(state.members.some(row => row.endedAt), false);
  });
  const beforeEnd = structuredClone(state);
  await endTogether("owner", "book");
  const snapshot = await readPrivacyReplaySnapshot();
  const receipts = snapshot.committed;
  assert.equal(snapshot.unresolved, 0, "성공한 재시도는 같은 대상의 미완료 준비 기록을 대체한다");
  const assertEnded = () => {
    assert.equal(state.books[0].collaborationStartedAt, null);
    assert(state.members.every(row => row.endedAt));
    assert(state.invites.filter(row => row.harumadiId === "book").every(row => row.revokedAt));
    assert(state.comments.every(row => row.deletedAt && !row.body && !row.authorId));
    assert.deepEqual(state.links.filter(row => row.harumadiId === "book").map(row => row.entryId), ["mine"]);
    assert.deepEqual(state.entries, originalEntries);
    assert.deepEqual(state.pdfs, backup.pdfs);
    assert.deepEqual(state.books[1], backup.books[1]);
    assert.deepEqual(state.links.find(row => row.harumadiId === "other"), backup.links.find(row => row.harumadiId === "other"));
    assert.equal(state.invites.find(row => row.id === "other-invite")?.revokedAt, null);
  };
  await t.test("전체 종료는 타인 연결·댓글·초대를 정리하고 원본·다른 책·PDF는 유지한다", async () => {
    assertEnded();
    const count = receipts.length;
    await endTogether("owner", "book");
    assert.equal((await readPrivacyReplaySnapshot()).committed.length, count, "반복 종료는 추가 삭제 없이 성공한다");
  });
  await t.test("과거 백업의 참여·공유 상태를 다시 종료한다", async () => {
    state = structuredClone(beforeEnd);
    for (const record of receipts) if (isTogetherReplayKind(record.kind)) await inspectTogetherReplay({ ...record, kind: record.kind }, true);
    assertEnded();
    for (const record of receipts) if (isTogetherReplayKind(record.kind)) assert.equal((await inspectTogetherReplay({ ...record, kind: record.kind }, false)).fulfilled, true);
  });
  await t.test("과거 종료 영수증은 새 초대·재참여·다시 담은 마디를 지우지 않는다", async () => {
    const future = new Date(Date.now() + 1000);
    state.books[0].collaborationStartedAt = future;
    state.members[0] = { ...state.members[0], id: "new-member-generation", endedAt: null };
    state.invites.push({ id: "new-invite-generation", harumadiId: "book", revokedAt: null });
    state.links.push({ id: "new-link-generation", harumadiId: "book", entryId: "a" });
    for (const record of receipts) if (isTogetherReplayKind(record.kind)) await inspectTogetherReplay({ ...record, kind: record.kind }, true);
    assert.equal(state.books[0].collaborationStartedAt?.getTime(), future.getTime());
    assert.equal(state.members[0].endedAt, null);
    assert.equal(state.invites.at(-1)?.revokedAt, null);
    assert(state.links.some(row => row.id === "new-link-generation"));
  });
});

test("전체 종료는 소유자의 공유 책에서만 확인 후 실행하고 댓글·책장 캐시를 갱신한다", () => {
  const panel = readFileSync("src/features/tuti/components/HarumadiTogetherPanel.tsx", "utf8");
  const client = readFileSync("src/lib/harumadiTogether.ts", "utf8");
  const route = readFileSync("src/app/api/harumadis/[harumadiId]/together/route.ts", "utf8");
  assert.match(panel, /query.data.owner && query.data.shared && <EndSection/);
  assert.match(panel, /requestConfirmation\("end-together"\)/);
  assert.doesNotMatch(panel, /window.confirm/);
  assert.match(panel, /함께 채우기 종료/);
  assert.match(panel, /client.removeQueries\(\{ queryKey: \["harumadi-comments", owner, bookId\]/);
  assert.match(panel, /client.invalidateQueries\(\{ queryKey: \["library-harumadis", owner\]/);
  assert.match(client, /action === "end-together"\) await harumadiReadCache.clearBook/);
  assert.match(route, /body.action === "end-together"\) return endTogether\(userId, harumadiId\)/);
});
