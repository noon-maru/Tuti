import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { prisma } from "../src/server/db/prisma";
import { getObject, putObject } from "../src/server/storage/objectStorage";
import { processDataCleanupJob } from "../src/server/legal/dataCleanup";
import type { Prisma } from "../src/generated/prisma/client";

const batch = "development-admin-design-20261118";
const email = "admin@tuti.today";
const images = ["dog-walk-example-v2.webp", "cat-at-home-example-v2.webp", "shared-afternoon-example.webp"] as const;
type Entry = { title: string; content: string; place: string; image?: number };
type Book = { title: string; coverStyle: string; entries: Entry[] };
const longText = [
  "서두르지 않고 익숙한 길을 조금 더 천천히 걸었다. 늘 지나치던 나무 아래에도 계절이 와 있었다.",
  "바람이 불 때마다 잎이 서로 부딪히는 소리가 났다. 오늘은 목적지보다 걷는 시간이 더 좋았다.",
  "돌아오는 길에는 작은 벤치에 앉아 잠시 쉬었다. 특별한 일이 없어도 남겨두고 싶은 날이 있다.",
  "사진 한 장에 담기지 않는 기분을 글로 덧붙여본다. 다음에 이 페이지를 펼치면 오늘의 느린 걸음도 떠오르면 좋겠다.",
].join("\n\n");
export const developmentBooks: Book[] = [
  { title: "함께 걷는 오후", coverStyle: "green-image", entries: [
    { title: "조금 느린 산책", content: "익숙한 길도 함께 걸으면 다른 풍경이 된다.\n오늘은 서두르지 않기로 했다.", place: "동네 산책길", image: 0 },
    { title: "", content: "", place: "나무 그늘 아래", image: 0 },
    { title: "돌아오는 길", content: longText, place: "집 앞 공원", image: 0 },
  ] },
  { title: "집 안의 작은 계절", coverStyle: "white-image", entries: [
    { title: "햇볕이 머무는 자리", content: "창가에 빛이 들어오자 가장 먼저 자리를 잡았다. 오늘의 느긋함을 한 장 남긴다.", place: "우리 집 창가", image: 1 },
    { title: "아무것도 하지 않는 오후에도 남겨두고 싶은 순간이 있다", content: "작은 소리와 따뜻한 빛.\n대단한 일이 없어도 충분한 하루였다.", place: "거실", image: 1 },
    { title: "오늘의 한 문장", content: "곁에 있다는 것만으로도 채워지는 날.", place: "집" },
  ] },
  { title: "차 한 잔, 짧은 이야기", coverStyle: "green-plain", entries: [
    { title: "잠깐의 쉼표", content: "마주 앉아 사소한 이야기를 나눴다.\n길지 않은 시간이 오래 기억에 남을 것 같다.", place: "동네 카페", image: 2 },
    { title: "잔이 비워질 때까지", content: longText, place: "창가 자리", image: 2 },
    { title: "", content: "", place: "오후의 테이블", image: 2 },
  ] },
  { title: "사진 없이도 남아 있는 하루의 조각들", coverStyle: "white-plain", entries: [
    { title: "첫 문장", content: "사진을 찍지 않은 날에도 이야기는 남는다.", place: "돌아오는 길" },
    { title: "", content: "오늘은 평소보다 하늘을 자주 올려다봤다. 그 정도의 변화로도 괜찮았다.", place: "동네" },
    { title: "길게 적어두는 마음", content: Array(3).fill(longText).join("\n\n"), place: "작은 책상" },
  ] },
  { title: "다음 이야기를 기다리는 하루마디", coverStyle: "white-plain", entries: [] },
];
function ensure(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
export function developmentSeedGuard(env: NodeJS.ProcessEnv) {
  ensure(env.TUTI_INSPECTION_ENV === "development" && env.NODE_ENV !== "production", "DEVELOPMENT_ONLY");
}
export function developmentId(owner: string, part: string) {
  const h = createHash("sha256").update(`${batch}:${owner}:${part}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
type Asset = { bytes: Buffer; width: number; height: number };
type Files = { prepare: (index: number) => Promise<Asset>; put: (key: string, asset: Asset) => Promise<void>; verify: (key: string) => Promise<void>; clean: (id: string) => Promise<unknown> };
const files: Files = {
  async prepare(index) {
    const bytes = readFileSync(resolve("public/welcome", images[index]));
    const image = sharp(bytes, { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata(); await image.stats();
    ensure(metadata.width && metadata.height && metadata.format === "webp", "INVALID_GENERATED_IMAGE");
    return { bytes, width: metadata.width, height: metadata.height };
  },
  put: async (key, asset) => { await putObject({ key, body: asset.bytes, contentType: "image/webp" }); },
  async verify(key) {
    const object = await getObject(key), bytes = Buffer.from(await object.body.transformToByteArray());
    const original = readFileSync(resolve("public/welcome", images[Number(key.split("/").at(-1)?.split("-")[0])]));
    ensure(bytes.equals(original), "IMAGE_READBACK_MISMATCH");
    await sharp(bytes, { limitInputPixels: 16_000_000 }).stats();
  },
  clean: processDataCleanupJob,
};
type Reader = Pick<Prisma.TransactionClient, "user" | "systemLog" | "harumadi" | "journalEntry" | "harumadiEntryLink">;
async function inspect(db: Reader) {
  const users = await db.user.findMany({ where: { role: "admin", authIdentities: { some: { email: { equals: email, mode: "insensitive" } } } }, select: { id: true }, take: 2 });
  ensure(users.length === 1, "TARGET_ADMIN_ACCOUNT_NOT_UNIQUE");
  const owner = users[0].id;
  const bookIds = developmentBooks.map((_, i) => developmentId(owner, `book:${i}`));
  const entryIds = developmentBooks.flatMap((b, i) => b.entries.map((_, j) => developmentId(owner, `madi:${i}:${j}`)));
  const receiptId = developmentId(owner, "receipt");
  const [receipt, books, entries, links] = await Promise.all([
    db.systemLog.findUnique({ where: { id: receiptId }, select: { targetId: true } }),
    db.harumadi.count({ where: { id: { in: bookIds }, ownerId: owner } }),
    db.journalEntry.count({ where: { id: { in: entryIds }, ownerId: owner, publicationStatus: "private" } }),
    db.harumadiEntryLink.count({ where: { harumadiId: { in: bookIds }, entryId: { in: entryIds } } }),
  ]);
  const present = Boolean(receipt || books || entries || links);
  ensure(!present || (receipt?.targetId === owner && books === 5 && entries === 12 && links === 12), "PARTIAL_SEED_DO_NOT_OVERWRITE");
  return { owner, receiptId, present };
}
export async function seedDevelopment(apply: boolean, db = prisma, storage = files) {
  developmentSeedGuard(process.env);
  const plan = await inspect(db);
  if (!apply || plan.present) return { mode: plan.present ? "already-present" : "dry-run", targetUserId: plan.owner, newBooks: plan.present ? 0 : 5, newMadis: plan.present ? 0 : 12, newPhotos: plan.present ? 0 : 8, databaseChanged: false };
  const assets = await Promise.all(images.map((_, i) => storage.prepare(i)));
  const uploads = developmentBooks.flatMap((b, i) => b.entries.flatMap((e, j) => e.image === undefined ? [] : [{
    id: developmentId(plan.owner, `madi:${i}:${j}`),
    key: `journal-images/${plan.owner}/${developmentId(plan.owner, `madi:${i}:${j}`)}/${e.image}-${randomUUID()}.webp`, asset: assets[e.image],
  }]));
  const cleanupId = randomUUID();
  await db.userDataCleanupJob.create({ data: { id: cleanupId, nextAttemptAt: new Date(Date.now() + 30 * 60_000), payload: { images: uploads.map(u => u.key), pdfs: [], appleTokens: [], receipt: null } } });
  try {
    for (const upload of uploads) { await storage.put(upload.key, upload.asset); await storage.verify(upload.key); }
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${plan.owner} FOR UPDATE`;
      const current = await inspect(tx);
      ensure(current.owner === plan.owner && !current.present, "TARGET_OR_SEED_CHANGED");
      const claimed = await tx.userDataCleanupJob.deleteMany({ where: { id: cleanupId, attempts: 0, leaseToken: null, nextAttemptAt: { gt: new Date() } } });
      ensure(claimed.count === 1, "UPLOAD_RESERVATION_EXPIRED");
      for (const [i, book] of developmentBooks.entries()) {
        const bookId = developmentId(plan.owner, `book:${i}`);
        await tx.harumadi.create({ data: { id: bookId, ownerId: plan.owner, title: book.title, coverStyle: book.coverStyle,
          backCoverText: "작은 하루도, 오래 남을 이야기.\n개발 화면 검증용 가상 예시입니다." } });
        for (const [j, entry] of book.entries.entries()) {
          const id = developmentId(plan.owner, `madi:${i}:${j}`), upload = uploads.find(u => u.id === id);
          await tx.journalEntry.create({ data: { id, ownerId: plan.owner, title: entry.title, content: entry.content,
            placeName: entry.place, visitedAt: new Date(`2026-11-${String(2 + i * 3 + j).padStart(2, "0")}T03:00:00Z`),
            sensitiveContent: false, publicationStatus: "private", image: upload?.key ?? null,
            imageWidth: upload?.asset.width ?? null, imageHeight: upload?.asset.height ?? null } });
          await tx.harumadiEntryLink.create({ data: { id: developmentId(plan.owner, `link:${i}:${j}`), harumadiId: bookId, entryId: id, position: j } });
        }
      }
      await tx.systemLog.create({ data: { id: plan.receiptId, category: "admin", action: "demo.development_harumadis_seeded", targetType: "user", targetId: plan.owner,
        message: "개발 디자인 검증용 비공개 예시를 추가했습니다.", metadata: { batch, synthetic: true, books: 5, madis: 12, photos: uploads.length, analyticsEventsCreated: 0 } } });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    await db.userDataCleanupJob.updateMany({ where: { id: cleanupId }, data: { nextAttemptAt: new Date() } }).catch(() => {});
    await storage.clean(cleanupId).catch(() => {});
    throw error;
  }
  const verified = await inspect(db);
  ensure(verified.present && verified.owner === plan.owner, "SEED_VERIFICATION_FAILED");
  return { mode: "applied", books: 5, madis: 12, imagesReadBack: uploads.length, privateOnly: true, existingDataPreserved: true, analyticsEventsCreated: 0 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    ensure(args.length === 1 && ["--check", "--apply"].includes(args[0]), "INVALID_ARGUMENTS");
    console.log(JSON.stringify(await seedDevelopment(args[0] === "--apply")));
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "DEVELOPMENT_SEED_FAILED";
    console.error(JSON.stringify({ status: "failed", code, privateDetailsSuppressed: true, applyMayHaveCommitted: process.argv.includes("--apply") })); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
