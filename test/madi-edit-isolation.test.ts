import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

test("마디 수정은 오래된 입력과 사진 참조를 원자적으로 거절한다", async t => {
  const initial = () => ({ id: "entry", ownerId: "fixture", title: "기존", content: "기존", image: "journal-images/fixture/entry/old.webp" as string | null,
    placeId: null, placeName: "공간", visitedAt: new Date(), updatedAt: new Date(0), publicId: null, publishedAt: null,
    publicationStatus: "private", publicationStatusChangedAt: new Date(), sensitiveContent: false, sensitiveWithdrawnAt: null });
  let row = initial(), transactions = 0, fail = false;
  let job: { id: string; payload: unknown; createdAt: Date } | null = null;
  let resume!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const objects = new Set<string>(), deleted = new Set<string>();
  const globals = globalThis as unknown as { prisma?: unknown; tutiObjectStorageClient?: unknown };
  const oldDb = globals.prisma, oldStorage = globals.tutiObjectStorageClient;
  globals.tutiObjectStorageClient = { send: async (command: { constructor: { name: string }; input: { Key: string } }) => {
    if (command.constructor.name === "DeleteObjectCommand") { objects.delete(command.input.Key); deleted.add(command.input.Key); }
    else objects.add(command.input.Key);
    return {};
  } };
  const db = {
    userDataCleanupJob: {
      create: async ({ data }: { data: { id: string; payload: unknown } }) => { job = { ...data, createdAt: new Date() }; return job; },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(job!, data); return { count: 1 }; },
      findUniqueOrThrow: async () => job,
      deleteMany: async () => { job = null; return { count: 1 }; },
    },
    journalEntry: { count: async ({ where }: { where: { image: string } }) => row.image === where.image ? 1 : 0, findFirst: async () => ({ ...row }), findUniqueOrThrow: async () => ({ ...row }),
      updateMany: async ({ data }: { data: Partial<typeof row> }) => { Object.assign(row, data); return { count: 1 }; } },
    $queryRaw: async () => [], systemLog: { create: async () => ({}) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => { if (fail) throw new Error("fixture rollback"); if (++transactions === 2) await gate; return work(db); },
  };
  globals.prisma = db;
  const env = { OBJECT_STORAGE_ENABLED: "true", OBJECT_STORAGE_ENDPOINT: "http://fixture.invalid", OBJECT_STORAGE_REGION: "fixture", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret", SENSITIVE_MADI_WORKFLOW_ENABLED: "false" };
  const previous = Object.keys(env).map(key => process.env[key]);
  Object.assign(process.env, env);
  t.after(() => { globals.prisma = oldDb; globals.tutiObjectStorageClient = oldStorage;
    Object.keys(env).forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
  const { updateJournalEntry } = await import("../src/server/journal/service");
  const base = { title: "제목", placeName: "공간", sensitiveContent: false };
  const oldImage = row.image!;
  objects.add(oldImage);
  const a = updateJournalEntry("fixture", "entry", { ...base, content: "최신", image: null });
  // 구 앱처럼 버전을 보내지 않아도 겹쳐 실행된 요청은 서버 스냅샷으로 보호한다.
  const b = updateJournalEntry("fixture", "entry", { ...base, content: "오래된 입력", image: oldImage });
  const rejected = assert.rejects(b, { status: 409 });
  await a; resume(); await rejected;
  assert.equal(row.content, "최신"); assert.equal(row.image, null); assert.ok(deleted.has(oldImage));

  await assert.rejects(updateJournalEntry("fixture", "entry", { ...base, content: "이전 화면", image: null, expectedVersion: new Date(0).toISOString() }), { status: 409 });
  assert.equal(row.content, "최신");

  row = initial(); objects.clear(); objects.add(oldImage); fail = true;
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(updateJournalEntry("fixture", "entry", { ...base, content: "실패", image: `data:image/png;base64,${png.toString("base64")}` }), /fixture rollback/);
  assert.equal(row.image, oldImage);
  assert.deepEqual([...objects], [oldImage], "실패한 업로드만 정리하며 기존 사진은 보존한다");
});
