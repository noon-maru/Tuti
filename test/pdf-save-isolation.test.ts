import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

test("PDF 재시도는 다른 업로드를 지우거나 삭제된 승인 ID를 재생성하지 않는다", async t => {
  const objects = new Set<string>(), receipts = new Set<string>();
  let saved: { id: string; ownerId: string; objectKey: string; title: string; entryIds: string[]; pageCount: number; createdAt: Date } | null = null;
  const globals = globalThis as unknown as { prisma?: unknown; tutiObjectStorageClient?: unknown };
  const oldDb = globals.prisma, oldStorage = globals.tutiObjectStorageClient;
  globals.tutiObjectStorageClient = { send: async (command: { constructor: { name: string }; input: { Key: string } }) => {
    if (command.constructor.name === "DeleteObjectCommand") objects.delete(command.input.Key);
    else objects.add(command.input.Key);
    return {};
  } };
  const db = {
    user: { findUnique: async () => ({ id: "fixture", role: "user", displayName: null, lastAccessedAt: new Date(), authIdentities: [] }) },
    harumadiPdf: { findUnique: async () => saved, create: async ({ data }: { data: NonNullable<typeof saved> }) => { saved = { ...data, createdAt: new Date() }; return saved; } },
    lifecycleEvent: {
      findUnique: async ({ where }: { where: { occurrenceKey: string } }) => receipts.has(where.occurrenceKey) ? { id: "receipt" } : null,
      createMany: async ({ data }: { data: { occurrenceKey: string }[] }) => { data.forEach(item => receipts.add(item.occurrenceKey)); },
    },
    journalEntry: { findMany: async () => [{ sensitiveContent: false, sensitiveWithdrawnAt: null, sensitiveConsentVersion: null, updatedAt: new Date(0) }] },
    $queryRaw: async () => [], $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
  };
  globals.prisma = db;
  const env = { HARUMADI_PDF_APPROVAL_SECRET: "fixture-approval-secret-32-characters", OBJECT_STORAGE_ENABLED: "true", OBJECT_STORAGE_ENDPOINT: "http://fixture.invalid", OBJECT_STORAGE_REGION: "fixture", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret", SENSITIVE_MADI_WORKFLOW_ENABLED: "false" };
  const previous = Object.keys(env).map(key => process.env[key]); Object.assign(process.env, env);
  t.after(() => { globals.prisma = oldDb; globals.tutiObjectStorageClient = oldStorage;
    Object.keys(env).forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
  const doc = await PDFDocument.create(); doc.addPage(); const pdf = await doc.save();
  const { storeHarumadiPdf } = await import("../src/server/harumadi/pdfStorage");
  const first = await storeHarumadiPdf("fixture", "same-id", pdf);
  const second = await storeHarumadiPdf("fixture", "same-id", pdf);
  assert.notEqual(first, second); assert.equal(objects.size, 2); objects.clear();
  const { createHarumadiPdfApproval } = await import("../src/server/harumadi/pdfApproval");
  const token = await createHarumadiPdfApproval("fixture", { title: "예시", entryIds: ["entry"], letter: "", coverEntryId: null, coverStyle: "white-plain" }, pdf);
  const { POST } = await import("../src/app/api/harumadi-pdfs/route");
  const request = () => new Request("https://fixture.test/api/harumadi-pdfs", { method: "POST", headers: { Authorization: `Bearer ${"x".repeat(40)}`, "Content-Type": "application/pdf", "X-Tuti-Journal-Harumadi-Approval": token }, body: Buffer.from(pdf) });
  assert.equal((await POST(request())).status, 201);
  assert.equal(objects.size, 1);
  assert.equal((await POST(request())).status, 200); assert.equal(objects.size, 1);
  saved = null; objects.clear(); // 명시적 PDF 삭제가 이미 완료된 상태
  assert.equal((await POST(request())).status, 409);
  assert.equal(saved, null); assert.equal(objects.size, 0, "거절한 요청의 새 업로드만 정리한다");
});
