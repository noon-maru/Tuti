import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("한 책에 여러 명을 초대하되 링크는 1회만 사용하고 내보내기는 해당 연결만 제거한다", async t => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
  type Member = { id: string; harumadiId: string; userId: string; endedAt: Date | null; joinedAt: Date };
  type Invite = { id: string; harumadiId: string; tokenHash: string; createdAt: Date; expiresAt: Date; acceptedAt: Date | null; acceptedByUserId: string | null; revokedAt: Date | null };
  const members = new Map<string, Member>(), invites = new Map<string, Invite>();
  const book = { id: "book", ownerId: "owner", revision: 1, accessRevision: 0, collaborationStartedAt: null as Date | null };
  const records = [{ id: "a", ownerId: "member-a", sensitiveContent: false, sensitiveWithdrawnAt: null, sensitiveConsentVersion: null }, { id: "b", ownerId: "member-b", sensitiveContent: false, sensitiveWithdrawnAt: null, sensitiveConsentVersion: null }];
  const links = new Map<string, { id: string; harumadiId: string; entryId: string }>();
  const memberFor = (userId: string) => members.get(`${book.id}:${userId}`) ?? null;
  const db = {
    $queryRaw: async () => [],
    authIdentity: { findFirst: async () => ({ id: "identity" }) },
    user: { findUniqueOrThrow: async () => ({ displayName: "만든 사람" }) },
    contentReport: { findFirst: async () => null },
    journalAuthorBlock: { findFirst: async () => null },
    journalEntry: { count: async () => 0, findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => records.find(entry => entry.id === where.id && entry.ownerId === where.ownerId) ?? null },
    harumadi: {
      findUnique: async ({ where, select }: { where: { id: string }; select: { members: { where: { userId: string } } } }) => where.id === book.id ? { ...book, members: [...members.values()].filter(member => member.userId === select.members.where.userId && !member.endedAt) } : null,
      update: async ({ data }: { data: { revision?: { increment: number }; accessRevision?: { increment: number }; collaborationStartedAt?: Date } }) => { if (data.revision) book.revision += data.revision.increment; if (data.accessRevision) book.accessRevision += data.accessRevision.increment; if (data.collaborationStartedAt) book.collaborationStartedAt = data.collaborationStartedAt; return book; },
    },
    harumadiMember: {
      findUnique: async ({ where }: { where: { id?: string; harumadiId_userId?: { userId: string } } }) => where.id ? [...members.values()].find(member => member.id === where.id) ?? null : memberFor(where.harumadiId_userId!.userId),
      findMany: async () => [...members.values()].filter(member => !member.endedAt).map(member => ({ ...member, user: { displayName: member.userId } })),
      upsert: async ({ where, create, update }: { where: { harumadiId_userId: { userId: string } }; create: Omit<Member, "joinedAt" | "endedAt">; update: Partial<Member> }) => { const old = memberFor(where.harumadiId_userId.userId); const row = old ? { ...old, ...update } : { ...create, joinedAt: new Date(), endedAt: null }; members.set(`${book.id}:${row.userId}`, row); return row; },
      updateMany: async ({ where, data }: { where: { userId: string }; data: { endedAt: Date } }) => { Object.assign(memberFor(where.userId)!, data); return { count: 1 }; },
    },
    harumadiInvite: {
      create: async ({ data }: { data: Omit<Invite, "createdAt" | "acceptedAt" | "acceptedByUserId" | "revokedAt"> }) => { const row = { ...data, createdAt: new Date(), acceptedAt: null, acceptedByUserId: null, revokedAt: null }; invites.set(row.id, row); return row; },
      count: async () => [...invites.values()].filter(invite => !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date()).length,
      findUnique: async ({ where }: { where: { tokenHash: string } }) => { const row = [...invites.values()].find(invite => invite.tokenHash === where.tokenHash); return row ? { ...row, harumadi: { ...book, title: "함께한 하루", owner: { displayName: "만든 사람" } } } : null; },
      findFirst: async ({ where }: { where: { id: string } }) => invites.get(where.id) ?? null,
      findMany: async () => [...invites.values()].filter(invite => !invite.acceptedAt && !invite.revokedAt),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Invite> }) => { Object.assign(invites.get(where.id)!, data); return invites.get(where.id)!; },
    },
    harumadiEntryLink: {
      findUnique: async ({ where }: { where: { harumadiId_entryId: { entryId: string } } }) => links.get(where.harumadiId_entryId.entryId) ?? null,
      create: async ({ data }: { data: { harumadiId: string; entryId: string } }) => { const row = { ...data, id: randomUUID() }; links.set(row.entryId, row); return row; },
      deleteMany: async ({ where }: { where: { harumadiId: string; entry: { ownerId: string } } }) => { for (const [id, link] of links) if (link.harumadiId === where.harumadiId && records.some(entry => entry.id === id && entry.ownerId === where.entry.ownerId)) links.delete(id); return { count: 1 }; },
    },
    harumadiComment: { updateMany: async () => ({ count: 0 }) },
  };
  let queue = Promise.resolve();
  const previous = (globalThis as { prisma?: unknown }).prisma;
  (globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: (work: (tx: typeof db) => Promise<unknown>) => { const next = queue.then(() => work(db)); queue = next.then(() => undefined, () => undefined); return next; } };
  t.after(() => { (globalThis as { prisma?: unknown }).prisma = previous; });
  const { createInvite, acceptInvite, readTogether, leaveHarumadi, addSharedEntry, revokeInvite } = await import("@/server/harumadi/together");
  const first = await createInvite("owner", "book");
  assert.ok(!JSON.stringify([...invites.values()]).includes(first.token), "초대 토큰 원문은 저장하지 않는다");
  const race = await Promise.allSettled([acceptInvite("member-a", first.token), acceptInvite("member-b", first.token)]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  const second = await createInvite("owner", "book"); await acceptInvite("member-b", second.token);
  assert.equal((await readTogether("owner", "book")).participants.length, 3);
  assert.deepEqual((await readTogether("member-a", "book")).invites, []);
  await assert.rejects(createInvite("member-a", "book"), { status: 404 });
  await assert.rejects(readTogether("member-a", "private-book"), { status: 404 });
  await addSharedEntry("member-a", "book", "a"); await addSharedEntry("member-b", "book", "b");
  await assert.rejects(addSharedEntry("member-b", "book", "a"), { status: 404 });
  await leaveHarumadi("owner", "book", "member-a");
  assert.equal(links.has("a"), false); assert.equal(links.has("b"), true); assert.equal(records.length, 2);
  await assert.rejects(acceptInvite("member-a", first.token), { status: 410 });
  await assert.rejects(addSharedEntry("member-a", "book", "a"), { status: 404 });
  const pending = await createInvite("owner", "book"); await revokeInvite("owner", "book", pending.id);
  await assert.rejects(acceptInvite("member-c", pending.token), { status: 410 });
});
