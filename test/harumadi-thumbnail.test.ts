import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createJournalThumbnail, serializeJournalImage } from "@/server/journal/imageStorage";

test("캐시 사진은 비율을 유지한 640px 이하 JPEG이며 작은 사진을 확대하지 않는다", async () => {
  for (const [width, height, expectedWidth, expectedHeight] of [[1200, 900, 640, 480], [40, 80, 40, 80]]) {
    const original = await sharp({ create: { width, height, channels: 4, background: "#ffffff00" } }).png().toBuffer();
    const thumbnail = await createJournalThumbnail(original);
    const meta = await sharp(thumbnail).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, expectedWidth);
    assert.equal(meta.height, expectedHeight);
    assert.equal(meta.hasAlpha, false);
  }
});

test("손상된 사진은 썸네일로 저장하지 않는다", async () => {
  await assert.rejects(createJournalThumbnail(new Uint8Array([1, 2, 3])));
});

test("썸네일 경로도 민감·분류 미확정·철회 및 잘못된 서명을 거절한다", async () => {
  const previous = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "thumbnail-test-only-secret";
  const entry = { id: "entry-a", ownerId: "owner", image: "journal-images/owner/entry-a/test.webp", updatedAt: new Date(),
    sensitiveContent: true as boolean | null, sensitiveWithdrawnAt: null as Date | null };
  (globalThis as { prisma?: unknown }).prisma = { journalEntry: { findUnique: async () => entry } };
  try {
    const { GET } = await import("@/app/api/journal-entry-images/[entryId]/route");
    const path = serializeJournalImage(entry)!;
    for (const sensitive of [true, null]) {
      entry.sensitiveContent = sensitive;
      assert.equal((await GET(new Request(`https://tuti.today${path}&thumbnail=1`), { params: Promise.resolve({ entryId: entry.id }) })).status, 404);
    }
    entry.sensitiveContent = false; entry.sensitiveWithdrawnAt = new Date();
    assert.equal((await GET(new Request(`https://tuti.today${path}&thumbnail=1`), { params: Promise.resolve({ entryId: entry.id }) })).status, 404);
    entry.sensitiveWithdrawnAt = null;
    assert.equal((await GET(new Request("https://tuti.today/api/journal-entry-images/entry-a?thumbnail=1&signature=00"), { params: Promise.resolve({ entryId: entry.id }) })).status, 404);
  } finally {
    if (previous === undefined) delete process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
    else process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = previous;
  }
});
