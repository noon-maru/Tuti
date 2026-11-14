import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/prisma";
import { getObject, putObject } from "../src/server/storage/objectStorage";
import { processDataCleanupJob } from "../src/server/legal/dataCleanup";
import { HARUMADI_PDF_COVER_STYLES } from "../src/shared/api/harumadiPdf";
import { isHarumadiBackCoverText } from "../src/shared/harumadi/backCover";

export type DemoPhoto = { placeId: string; name: string; url: string; sha256: string; copyright: string };
type DemoEntry = { title: string; content: string; date: string; photoPlaceId?: string; placeName?: string };
export type DemoFixture = { batch: string; photos: DemoPhoto[]; books: {
  slug: string; title: string; coverStyle: string; backCoverText: string; entries: DemoEntry[];
}[] };
type Reader = Pick<Prisma.TransactionClient, "user" | "place" | "journalEntry" | "harumadi" | "harumadiEntryLink" | "systemLog">;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function ensure(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
export function demoId(batch: string, owner: string, part: string) {
  const h = hash(`${batch}:${owner}:${part}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function demoPlanHash(fixture: DemoFixture, user: { id: string; displayName: string | null; role: string }, existingBooks: number, existingEntries: number) {
  return hash(JSON.stringify({ fixture, user: { id: user.id, displayName: user.displayName, role: user.role }, existingBooks, existingEntries }));
}
export function validateDemoFixture(value: unknown): asserts value is DemoFixture {
  const data = value as DemoFixture;
  ensure(data?.batch === "harumadi-demo-20261114" && data.books?.length === 5 && data.photos?.length === 11, "INVALID_DEMO_FIXTURE");
  ensure(new Set(data.photos.map(p => p.placeId)).size === 11 && new Set(data.books.map(b => b.slug)).size === 5, "INVALID_DEMO_FIXTURE");
  for (const photo of data.photos) {
    const url = new URL(photo.url);
    ensure(photo.copyright === "Type1" && /^[a-f0-9]{64}$/.test(photo.sha256) && /^tourapi-\d+$/.test(photo.placeId) && photo.name,
      "INVALID_DEMO_PHOTO");
    ensure(url.protocol === "https:" && url.hostname === "tong.visitkorea.or.kr" && !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/cms\/(resource|resource_photo)\/\d+\/\d+_image2_1\.jpg$/.test(url.pathname), "INVALID_DEMO_PHOTO_URL");
  }
  for (const book of data.books) {
    ensure(/^[a-z-]+$/.test(book.slug) && book.title.length > 0 && book.title.length <= 80 && book.entries.length === 3 &&
      HARUMADI_PDF_COVER_STYLES.some(style => style === book.coverStyle) && isHarumadiBackCoverText(book.backCoverText), "INVALID_DEMO_BOOK");
    for (const entry of book.entries) {
      ensure(entry.title.length > 0 && entry.title.length <= 100 && entry.content.trim().length > 0 && entry.content.length <= 1000 &&
        /^2026-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(Date.parse(`${entry.date}T12:00:00+09:00`)) && entry.date <= "2026-11-14", "INVALID_DEMO_ENTRY");
      ensure(entry.photoPlaceId ? data.photos.some(p => p.placeId === entry.photoPlaceId) : Boolean(entry.placeName), "INVALID_DEMO_PLACE");
    }
  }
  ensure(data.books.flatMap(b => b.entries).filter(e => e.photoPlaceId).length === 11, "INVALID_DEMO_PHOTO_COUNT");
}

export function demoRecords(fixture: DemoFixture, ownerId: string, now = new Date()) {
  validateDemoFixture(fixture);
  const books = fixture.books.map((book, bookIndex) => {
    const dates = book.entries.map(e => e.date).sort();
    return { id: demoId(fixture.batch, ownerId, `book:${book.slug}`), ownerId, title: book.title, coverStyle: book.coverStyle,
      backCoverText: book.backCoverText, periodStart: new Date(`${dates[0]}T00:00:00Z`), periodEnd: new Date(`${dates.at(-1)}T00:00:00Z`),
      createdAt: new Date(now.getTime() - bookIndex * 1000) };
  });
  const entries = fixture.books.flatMap((book, bookIndex) => book.entries.map((entry, position) => {
    const photo = fixture.photos.find(p => p.placeId === entry.photoPlaceId);
    return { id: demoId(fixture.batch, ownerId, `madi:${book.slug}:${position}`), ownerId, title: entry.title,
      content: entry.content + (photo ? "\n\n사진 제공: 한국관광공사 TourAPI · 공공누리 제1유형\nhttps://api.visitkorea.or.kr" : ""),
      placeId: photo?.placeId ?? null, placeName: photo?.name ?? entry.placeName!, visitedAt: new Date(`${entry.date}T12:00:00+09:00`),
      photo, bookId: books[bookIndex].id, position };
  }));
  return { books, entries, receiptId: demoId(fixture.batch, ownerId, "receipt") };
}

export async function inspectDemo(fixture: DemoFixture, userId?: string, db: Reader = prisma) {
  validateDemoFixture(fixture);
  const users = await db.user.findMany({ where: { ...(userId ? { id: userId } : {}), displayName: "정연한",
    authIdentities: { some: { provider: "kakao" } } }, select: { id: true, displayName: true, role: true }, take: 2 });
  ensure(users.length === 1, "TARGET_KAKAO_ACCOUNT_NOT_UNIQUE");
  const user = users[0], records = demoRecords(fixture, user.id);
  const [books, entries, links, receipt, existingBooks, existingEntries, places] = await Promise.all([
    db.harumadi.findMany({ where: { id: { in: records.books.map(b => b.id) } }, select: { id: true, ownerId: true, collaborationStartedAt: true } }),
    db.journalEntry.findMany({ where: { id: { in: records.entries.map(e => e.id) } }, select: { id: true, ownerId: true, publicationStatus: true, publishedAt: true, publicId: true, sensitiveContent: true } }),
    db.harumadiEntryLink.findMany({ where: { harumadiId: { in: records.books.map(b => b.id) } }, select: { harumadiId: true, entryId: true } }),
    db.systemLog.findUnique({ where: { id: records.receiptId }, select: { id: true, targetId: true } }),
    db.harumadi.count({ where: { ownerId: user.id } }), db.journalEntry.count({ where: { ownerId: user.id } }),
    db.place.findMany({ where: { id: { in: fixture.photos.map(p => p.placeId) } }, select: { id: true, name: true, image: true, sourceCopyright: true } }),
  ]);
  ensure(fixture.photos.every(p => places.some(row => row.id === p.placeId && row.name === p.name && row.sourceCopyright === "Type1" &&
    row.image.replace(/^http:/, "https:") === p.url)), "PUBLIC_PHOTO_SOURCE_CHANGED");
  const exists = Boolean(receipt || books.length || entries.length || links.length);
  if (exists) {
    ensure(receipt?.targetId === user.id && books.length === 5 && entries.length === 15 && links.length === 15 &&
      books.every(b => b.ownerId === user.id && !b.collaborationStartedAt) &&
      entries.every(e => e.ownerId === user.id && e.publicationStatus === "private" && !e.publishedAt && !e.publicId && e.sensitiveContent === false) &&
      records.entries.every(e => links.some(l => l.harumadiId === e.bookId && l.entryId === e.id)), "DEMO_PARTIAL_OR_CHANGED_DO_NOT_OVERWRITE");
  }
  // 사진 메타데이터는 위에서 고정 원문과 일치하는지 검증했다. 계정·규모를 명시적으로 정규화한다.
  const planHash = demoPlanHash(fixture, user, existingBooks, existingEntries);
  return { user, records, planHash, alreadyPresent: exists, existingBooks, existingEntries };
}

type Asset = { bytes: Buffer; width: number; height: number };
export async function fetchDemoPhoto(photo: DemoPhoto): Promise<Asset> {
  const response = await fetch(photo.url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  ensure(response.ok && response.headers.get("content-type")?.startsWith("image/"), "PUBLIC_IMAGE_FETCH_FAILED");
  ensure(Number(response.headers.get("content-length") ?? 0) <= 5_000_000, "PUBLIC_IMAGE_TOO_LARGE");
  const chunks: Uint8Array[] = []; let total = 0;
  ensure(response.body, "PUBLIC_IMAGE_FETCH_FAILED");
  const reader = response.body.getReader();
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; ensure(total <= 5_000_000, "PUBLIC_IMAGE_TOO_LARGE"); chunks.push(value); } }
  finally { await reader.cancel(); }
  const original = Buffer.concat(chunks);
  ensure(hash(original) === photo.sha256, "PUBLIC_IMAGE_BYTES_CHANGED");
  const result = await sharp(original, { limitInputPixels: 16_000_000 }).rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  return { bytes: result.data, width: result.info.width, height: result.info.height };
}
async function verifyPhoto(key: string, expected?: Asset) {
  const object = await getObject(key), bytes = Buffer.from(await object.body.transformToByteArray());
  ensure(bytes.length <= 5_000_000 && (!expected || hash(bytes) === hash(expected.bytes)), "STORED_IMAGE_READBACK_FAILED");
  const image = sharp(bytes, { limitInputPixels: 16_000_000 });
  const metadata = await image.metadata(); await image.stats();
  ensure(metadata.width && metadata.height && (!expected || metadata.width === expected.width && metadata.height === expected.height), "STORED_IMAGE_DECODE_FAILED");
}
type Storage = { prepare: typeof fetchDemoPhoto; put: (key: string, asset: Asset) => Promise<void>; verify: typeof verifyPhoto; clean: (id: string) => Promise<unknown> };
const storage: Storage = { prepare: fetchDemoPhoto, put: async (key, asset) => { await putObject({ key, body: asset.bytes, contentType: "image/webp" }); }, verify: verifyPhoto, clean: processDataCleanupJob };

export async function applyDemo(fixture: DemoFixture, userId: string, expectedHash: string, db = prisma, files = storage) {
  const plan = await inspectDemo(fixture, userId, db);
  if (plan.alreadyPresent) return { mode: "already-present", books: 5, madis: 15, privateOnly: true, analyticsEventsCreated: 0 };
  ensure(plan.planHash === expectedHash, "DEMO_PLAN_CHANGED");
  // 모든 사진을 검증한 뒤 새 객체만 회수할 정리 예약을 먼저 영속화한다.
  const uploads: { entryId: string; key: string; asset: Asset }[] = [];
  for (const entry of plan.records.entries) if (entry.photo) uploads.push({ entryId: entry.id,
    key: `journal-images/${userId}/${entry.id}/${randomUUID()}.webp`, asset: await files.prepare(entry.photo) });
  const cleanupId = randomUUID(), deadline = new Date(Date.now() + 30 * 60_000);
  await db.userDataCleanupJob.create({ data: { id: cleanupId, nextAttemptAt: deadline,
    payload: { images: uploads.map(u => u.key), pdfs: [], appleTokens: [], receipt: null } } });
  try {
    for (const upload of uploads) { await files.put(upload.key, upload.asset); await files.verify(upload.key, upload.asset); }
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const current = await inspectDemo(fixture, userId, tx);
      ensure(!current.alreadyPresent && current.planHash === expectedHash, "DEMO_PLAN_CHANGED");
      // 정리 작업이 이미 인수하거나 시한이 지난 경우에는 DB에 연결하지 않는다.
      const claimed = await tx.userDataCleanupJob.deleteMany({ where: { id: cleanupId, attempts: 0, leaseToken: null, nextAttemptAt: { gt: new Date() } } });
      ensure(claimed.count === 1, "DEMO_UPLOAD_RESERVATION_EXPIRED");
      for (const book of current.records.books) await tx.harumadi.create({ data: book });
      for (const entry of current.records.entries) {
        const uploaded = uploads.find(u => u.entryId === entry.id);
        await tx.journalEntry.create({ data: { id: entry.id, ownerId: userId, title: entry.title, content: entry.content,
          placeId: entry.placeId, placeName: entry.placeName, visitedAt: entry.visitedAt,
          sensitiveContent: false, publicationStatus: "private", image: uploaded?.key ?? null,
          imageWidth: uploaded?.asset.width ?? null, imageHeight: uploaded?.asset.height ?? null } });
        await tx.harumadiEntryLink.create({ data: { id: demoId(fixture.batch, userId, `link:${entry.id}`), harumadiId: entry.bookId, entryId: entry.id, position: entry.position } });
      }
      await tx.systemLog.create({ data: { id: current.records.receiptId, level: "info", category: "admin", action: "demo.harumadis_seeded",
        message: "운영자 요청으로 비공개 시연용 하루마디를 추가했습니다.", targetType: "user", targetId: userId,
        metadata: { batch: fixture.batch, books: 5, madis: 15, photos: 11, synthetic: true, analyticsEventsCreated: 0 } } });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    // COMMIT 응답이 유실돼도 실제 마디가 참조하는 사진은 기존 정리기가 보존한다.
    await db.userDataCleanupJob.updateMany({ where: { id: cleanupId }, data: { nextAttemptAt: new Date() } }).catch(() => {});
    await files.clean(cleanupId).catch(() => {});
    throw error;
  }
  return { mode: "applied", books: 5, madis: 15, imagesReadBack: uploads.length, privateOnly: true, analyticsEventsCreated: 0 };
}

export async function verifyDemo(fixture: DemoFixture, userId: string, db = prisma, files = storage) {
  const plan = await inspectDemo(fixture, userId, db); ensure(plan.alreadyPresent, "DEMO_NOT_APPLIED");
  const images = await db.journalEntry.findMany({ where: { id: { in: plan.records.entries.map(e => e.id) }, ownerId: userId, image: { not: null } }, select: { id: true, image: true } });
  ensure(images.length === 11, "DEMO_IMAGE_COUNT_MISMATCH");
  for (const entry of images) {
    const key = entry.image;
    ensure(typeof key === "string" && key.startsWith(`journal-images/${userId}/${entry.id}/`), "DEMO_IMAGE_OWNER_MISMATCH");
    await files.verify(key);
  }
  return { verified: true, books: 5, madis: 15, imagesReadBack: images.length, privateOnly: true, analyticsEventsCreated: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) { if (["--user-id", "--expected-plan-hash"].includes(args[i])) { ensure(args[i + 1], "INVALID_ARGUMENTS"); i++; } else ensure(["--check", "--apply", "--verify"].includes(args[i]), "INVALID_ARGUMENTS"); }
  const option = (key: string) => args[args.indexOf(key) + 1];
  const userId = args.includes("--user-id") ? option("--user-id") : undefined;
  ensure(!userId || /^[a-f0-9-]{36}$/.test(userId), "INVALID_TARGET_ID");
  const apply = args.includes("--apply"), verify = args.includes("--verify"); ensure(!apply || !verify, "INVALID_ARGUMENTS");
  ensure(args.filter(arg => ["--check", "--apply", "--verify"].includes(arg)).length <= 1, "INVALID_ARGUMENTS");
  const expected = args.includes("--expected-plan-hash") ? option("--expected-plan-hash") : "";
  ensure(!apply || Boolean(userId && /^[a-f0-9]{64}$/.test(expected)), "EXPLICIT_TARGET_AND_PLAN_REQUIRED");
  ensure(!verify || userId, "EXPLICIT_TARGET_REQUIRED");
  const fixture: unknown = JSON.parse(readFileSync("data/demo-harumadis/2026-11-14.json", "utf8")); validateDemoFixture(fixture);
  const plan = await inspectDemo(fixture, userId);
  if (verify) { console.log(JSON.stringify(await verifyDemo(fixture, userId!))); return; }
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", targetUserId: plan.user.id, provider: "kakao", name: plan.user.displayName,
    planHash: plan.planHash, existingBooks: plan.existingBooks, existingMadis: plan.existingEntries, newBooks: 5, newMadis: 15, photos: 11,
    titles: plan.records.books.map(b => b.title), alreadyPresent: plan.alreadyPresent, databaseChanged: false }));
  if (apply) { console.log(JSON.stringify(await applyDemo(fixture, userId!, expected))); console.log(JSON.stringify(await verifyDemo(fixture, userId!))); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { const code = error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message) ? error.message : "DEMO_SEED_FAILED";
    console.error(JSON.stringify({ status: "failed", code, privateDetailsSuppressed: true, applyMayHaveCommitted: process.argv.includes("--apply") })); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
