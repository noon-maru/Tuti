import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

// Stateful fixture models the user/book cascade which caused the regression.
// No development or production database connection is used.
test("익명 로그인 병합은 하루마디를 삭제하지 않는다", async (t) => {
  const sourceId = "anonymous";
  const targetId = "existing-admin";
  const email = "fixture@example.test";
  const secret = "fixture-only-email-secret";
  const code = "123456";
  const challenge = {
    id: "challenge", expiresAt: new Date(Date.now() + 60_000), attempts: 0,
    codeHash: createHmac("sha256", secret).update(`challenge:${email}:${code}`).digest("hex"),
  };
  let state: ReturnType<typeof initialState>;
  let failPdfTransfer = false;
  let sourceIdentityCount = 0;
  function initialState(journals = 2, books = 1, pdfs = 1) {
    return {
      sourceExists: true, consumed: false,
      entries: Array.from({ length: journals }, (_, i) => ({ id: `entry-${i}`, ownerId: sourceId })),
      books: Array.from({ length: books }, () => ({ id: "book", ownerId: sourceId, title: "나의 하루마디", accessRevision: 0 })),
      pdfs: Array.from({ length: pdfs }, () => ({ id: "pdf", ownerId: sourceId, objectKey: "original-key" })),
      links: Array.from({ length: journals }, (_, i) => ({ harumadiId: "book", entryId: `entry-${i}`, position: journals - i })),
      comments: [{ authorId: sourceId }], invites: [{ acceptedByUserId: sourceId }],
    };
  }
  const updateOwners = (rows: { ownerId: string }[], ownerId: string) => rows.forEach(row => { row.ownerId = ownerId; });
  const noop = async () => ({ count: 0 });
  const prismaMock = {
    $queryRaw: async () => [{ id: sourceId }, { id: targetId }],
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(sql.join("?"), /INSERT INTO place_familiarities/);
      assert.equal(values[0], targetId);
      assert.equal(values[1], sourceId);
      return 0;
    },
    journalEntry: {
      count: async () => state.entries.length,
      updateMany: async ({ data }: { data: { ownerId: string } }) => updateOwners(state.entries, data.ownerId),
    },
    harumadi: {
      count: async () => state.books.length,
      updateMany: async ({ data }: { data: { ownerId: string } }) => {
        updateOwners(state.books, data.ownerId);
        state.books.forEach(book => { book.accessRevision += 1; });
      },
    },
    harumadiPdf: {
      count: async () => state.pdfs.length,
      updateMany: async ({ data }: { data: { ownerId: string } }) => {
        if (failPdfTransfer) throw new Error("fixture transfer failure");
        updateOwners(state.pdfs, data.ownerId);
      },
    },
    harumadiMember: { findMany: async () => [] },
    harumadiComment: { updateMany: async () => { state.comments[0].authorId = targetId; } },
    harumadiInvite: { updateMany: async () => { state.invites[0].acceptedByUserId = targetId; } },
    journalShareTrace: { updateMany: noop }, customerInquiry: { updateMany: noop },
    recommendationAction: { updateMany: noop }, recommendationRun: { updateMany: noop },
    productActivityEvent: { updateMany: noop }, locationUsageLog: { updateMany: noop },
    userSignalProfile: { deleteMany: noop },
    emailVerificationCode: {
      findFirst: async () => challenge,
      updateMany: async () => { if (state.consumed) return { count: 0 }; state.consumed = true; return { count: 1 }; },
    },
    authIdentity: { count: async () => sourceIdentityCount, findUnique: async () => ({ id: "identity", userId: targetId }), update: noop },
    oAuthAuthorization: { findUnique: async () => ({
      id: "authorization", userId: sourceId, provider: "google", providerSubject: "subject",
      providerEmail: email, providerDisplayName: null, collectDisplayName: true,
      providerRefreshTokenEncrypted: null, completedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000), user: { authIdentities: [] },
    }) },
    user: {
      delete: async () => {
        state.sourceExists = false;
        state.entries = state.entries.filter(row => row.ownerId !== sourceId);
        state.books = state.books.filter(row => row.ownerId !== sourceId);
        state.pdfs = state.pdfs.filter(row => row.ownerId !== sourceId);
        state.links = state.links.filter(row => state.books.some(book => book.id === row.harumadiId));
      },
      findUniqueOrThrow: async () => ({ role: "admin", displayName: "운영자", authIdentities: [] }),
    },
    userSession: { create: noop }, systemLog: { create: noop },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      assert.equal(typeof callback, "function", "병합은 하나의 콜백 트랜잭션이어야 한다");
      const before = structuredClone(state);
      try { return await callback(prismaMock); }
      catch (error) { state = before; throw error; }
    },
  };
  const globalDb = globalThis as unknown as { prisma?: unknown };
  const previous = globalDb.prisma;
  globalDb.prisma = prismaMock;
  const keys = ["ACCOUNT_AUTH_ENABLED", "AUTH_EMAIL_CODE_SECRET", "AUTH_APP_REVIEW_EMAIL", "AUTH_APP_REVIEW_PASSWORD"] as const;
  const env = keys.map(key => process.env[key]);
  process.env.ACCOUNT_AUTH_ENABLED = "true";
  process.env.AUTH_EMAIL_CODE_SECRET = secret;
  delete process.env.AUTH_APP_REVIEW_EMAIL;
  delete process.env.AUTH_APP_REVIEW_PASSWORD;
  t.after(() => {
    globalDb.prisma = previous;
    keys.forEach((key, i) => { if (env[i] === undefined) delete process.env[key]; else process.env[key] = env[i]; });
  });
  const { verifyEmailCode } = await import("../src/server/auth/emailCode");
  const { completeOAuthLogin } = await import("../src/server/auth/oauth");
  const logins = {
    email: (merge?: "merge") => verifyEmailCode({ id: sourceId, role: "user" }, { email, code, journalResolution: merge }),
    oauth: (merge?: "merge") => completeOAuthLogin({ ticket: "x".repeat(40), journalResolution: merge }),
  };
  for (const [provider, login] of Object.entries(logins)) {
    await t.test(`${provider}: 임시 계정이 다른 화면에서 로그인 계정으로 바뀌면 삭제하지 않는다`, async () => {
      state = initialState(); const before = structuredClone(state); sourceIdentityCount = 1;
      try { await assert.rejects(login("merge"), { code: "account_merge_source_changed" }); }
      finally { sourceIdentityCount = 0; }
      assert.deepEqual(state, before);
    });
    await t.test(`${provider}: 관리자 로그인에도 표지·연결·순서·PDF·댓글을 보존`, async () => {
      state = initialState();
      const links = structuredClone(state.links);
      const result = await login("merge");
      assert.equal(result.status, "authenticated");
      assert.equal(state.sourceExists, false);
      assert.deepEqual(state.entries.map(row => row.ownerId), [targetId, targetId]);
      assert.deepEqual(state.books, [{ id: "book", ownerId: targetId, title: "나의 하루마디", accessRevision: 1 }]);
      assert.deepEqual(state.links, links);
      assert.deepEqual(state.pdfs, [{ id: "pdf", ownerId: targetId, objectKey: "original-key" }]);
      assert.equal(state.comments[0].authorId, targetId);
      assert.equal(state.invites[0].acceptedByUserId, targetId);
    });
    for (const [label, books, pdfs] of [["빈 하루마디", 1, 0], ["PDF만", 0, 1]] as const) {
      await t.test(`${provider}: ${label} 있어도 삭제 전에 선택을 요청`, async () => {
        state = initialState(0, books, pdfs);
        const before = structuredClone(state);
        const result = await login();
        assert.equal(result.status, "journal-resolution-required");
        assert.deepEqual(state, before);
      });
    }
    await t.test(`${provider}: 이전 실패 시 계정·데이터·인증 소비를 모두 롤백`, async () => {
      state = initialState();
      const before = structuredClone(state);
      failPdfTransfer = true;
      try { await assert.rejects(login("merge"), /fixture transfer failure/); }
      finally { failPdfTransfer = false; }
      assert.deepEqual(state, before);
    });
  }
});
