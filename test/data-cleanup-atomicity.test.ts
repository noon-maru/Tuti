import assert from "node:assert/strict";
import test from "node:test";

test("삭제와 외부 정리 예약은 함께 커밋하고 장애 후 남은 작업만 재시도한다", async t => {
  const imageA = "journal-images/fixture/a/a.webp", imageB = "journal-images/fixture/b/b.webp";
  const fixture = () => ({ id: "fixture", role: "user", createdAt: new Date(), authIdentities: [] as { provider: string; email: string; providerRefreshTokenEncrypted: string }[],
    journalEntries: [{ id: "a", image: imageA }, { id: "b", image: imageB }], harumadiPdfs: [], _count: { harumadis: 1 } });
  let account: ReturnType<typeof fixture> | null = fixture();
  type Job = { id: string; payload: { images: string[]; receipt: unknown }; createdAt: Date; leaseToken?: string | null; nextAttemptAt?: Date };
  const jobs = new Map<string, Job>(), deleted: string[] = [], liveImages = new Set<string>();
  let failCommit = true, failStorage = false, failEnqueue = false;
  const globals = globalThis as unknown as { prisma?: unknown; tutiObjectStorageClient?: unknown };
  const previousDb = globals.prisma, previousStorage = globals.tutiObjectStorageClient;
  const storage = { send: async (command: { input: { Key: string } }) => {
    assert.equal(account, null, "계정 DB 삭제가 커밋되기 전 외부 파일을 삭제하면 안 된다");
    if (failStorage && command.input.Key === imageB) throw new Error("fixture storage failure");
    deleted.push(command.input.Key); return {};
  } };
  globals.tutiObjectStorageClient = storage;
  const noop = async () => ({ count: 0 });
  const db = {
    user: { findUnique: async () => structuredClone(account), delete: async () => { account = null; } },
    journalEntry: { count: async ({ where }: { where: { image: string } }) => liveImages.has(where.image) ? 1 : 0 }, harumadiPdf: { count: async () => 0 },
    userDataCleanupJob: {
      create: async ({ data }: { data: Omit<Job, "createdAt"> }) => {
        if (failEnqueue) throw new Error("fixture enqueue failure");
        const job = { ...structuredClone(data), createdAt: new Date() }; jobs.set(job.id, job); return job;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => structuredClone(jobs.get(where.id)),
      updateMany: async ({ where, data }: { where: { id: string; leaseToken?: string }; data: Partial<Job> }) => {
        const job = jobs.get(where.id); if (!job || (where.leaseToken && job.leaseToken !== where.leaseToken)) return { count: 0 };
        Object.assign(job, structuredClone(data)); return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; leaseToken?: string } }) => { const job = jobs.get(where.id); if (job?.leaseToken === where.leaseToken) jobs.delete(where.id); return { count: 1 }; },
    },
    $queryRaw: async () => [{ id: "fixture" }],
    journalShareTrace: { deleteMany: noop }, contentReport: { updateMany: noop }, customerInquiry: { deleteMany: noop },
    emailVerificationCode: { deleteMany: noop },
    systemLog: { updateMany: noop, deleteMany: noop }, locationUsageLog: { deleteMany: noop }, locationConsentEvent: { deleteMany: noop }, pushDelivery: { deleteMany: noop },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(account), oldJobs = structuredClone(jobs);
      try { const result = await work(db); if (failCommit) throw new Error("fixture commit failure"); return result; }
      catch (error) { account = before; jobs.clear(); oldJobs.forEach((value, id) => jobs.set(id, value)); throw error; }
    },
  };
  globals.prisma = db;
  const env = { OBJECT_STORAGE_ENABLED: "true", OBJECT_STORAGE_ENDPOINT: "http://fixture.invalid", OBJECT_STORAGE_REGION: "fixture", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret", PRIVACY_REPLAY_LEDGER_ENABLED: "false", LEGAL_RIGHTS_WORKFLOW_ENABLED: "false", APPLE_CLIENT_ID: "" };
  const previous = Object.keys(env).map(key => process.env[key]); Object.assign(process.env, env);
  t.after(() => { globals.prisma = previousDb; globals.tutiObjectStorageClient = previousStorage;
    Object.keys(env).forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
  const { deleteUserAccount } = await import("../src/server/admin/users");
  const { processDataCleanupJob } = await import("../src/server/legal/dataCleanup");
  await assert.rejects(deleteUserAccount("fixture"), /fixture commit failure/);
  assert.ok(account); assert.equal(jobs.size, 0); assert.equal(deleted.length, 0);
  failCommit = false; failEnqueue = true;
  await assert.rejects(deleteUserAccount("fixture"), /fixture enqueue failure/);
  assert.ok(account); assert.equal(deleted.length, 0);
  failEnqueue = false; failStorage = true;
  const result = await deleteUserAccount("fixture");
  assert.equal(account, null); assert.equal(result?.externalCleanupPending, true); assert.equal(jobs.size, 1);
  assert.deepEqual(deleted, [imageA]);
  const job = [...jobs.values()][0]; assert.deepEqual(job.payload.images, [imageB]);
  failStorage = false;
  assert.equal(await processDataCleanupJob(job.id, new Date(Date.now() + 6 * 60_000)), true);
  assert.equal(jobs.size, 0); assert.deepEqual(deleted, [imageA, imageB]);
  assert.equal(await processDataCleanupJob(job.id), false, "완료된 작업을 다시 실행해도 사진을 재삭제하지 않는다");

  // 현재 참조하는 사진은 과거 백업에서 돌아온 정리 예약으로 지우지 않는다.
  liveImages.add(imageA); account = fixture(); deleted.length = 0;
  await deleteUserAccount("fixture");
  assert.deepEqual(deleted, [imageB]); assert.equal(jobs.size, 0);

  // Apple 연결 해제 설정 장애는 계정 삭제를 취소하거나 토큰 암호문을 버리지 않는다.
  const { encryptAppleRefreshToken } = await import("../src/server/auth/appleOAuth");
  const encrypted = encryptAppleRefreshToken("fixture-refresh-token", Buffer.alloc(32, 1).toString("base64"));
  account = fixture(); account.authIdentities.push({ provider: "apple", email: "fixture@example.test", providerRefreshTokenEncrypted: encrypted });
  const appleResult = await deleteUserAccount("fixture");
  assert.equal(account, null); assert.equal(appleResult?.externalCleanupPending, true);
  assert.equal(jobs.size, 1);
  assert.ok(JSON.stringify([...jobs.values()]).includes(encrypted));
  assert.ok(!JSON.stringify([...jobs.values()]).includes("fixture-refresh-token"));
});
