import { prisma } from "../src/server/db/prisma";
import {
  createSourceFingerprint,
  generatePlaceMeaningProfile,
} from "../src/server/personalization/profileGeneration";
import { PERSONALIZATION_PROFILE_VERSION } from "../src/server/personalization/types";

const limit = readPositiveInteger("--limit", 100);
const concurrency = readPositiveInteger("--concurrency", 2);
const force = process.argv.includes("--force");
const model = process.env.OPENAI_PROFILE_MODEL?.trim() || "gpt-4o-mini";

assertApiKey();

const places = await prisma.place.findMany({
  where: {
    isActive: true,
    reviewStatus: "approved",
    OR: [
      { candidateOverride: "include" },
      { candidateOverride: "auto", candidateStatus: "selected" },
    ],
  },
  orderBy: { id: "asc" },
  select: {
    id: true,
    name: true,
    phrase: true,
    note: true,
    sourceAddress: true,
    sourceContentType: true,
    moodTags: true,
    meaningProfile: true,
    tourismSourceRecord: {
      select: {
        detailRecord: {
          select: {
            overview: true,
            openingHours: true,
            restDate: true,
            admissionFee: true,
            parking: true,
            reservation: true,
            usageDuration: true,
            experienceGuide: true,
          },
        },
      },
    },
  },
});

const scheduled = places
  .map((place) => {
    const source = {
      name: place.name,
      address: place.sourceAddress,
      contentType: place.sourceContentType,
      existingDescription: { phrase: place.phrase, note: place.note },
      moodTags: place.moodTags,
      detail: place.tourismSourceRecord?.detailRecord ?? null,
    };
    const fingerprint = createSourceFingerprint(source);
    const current = place.meaningProfile;
    const shouldGenerate =
      force ||
      !current ||
      current.profileVersion !== PERSONALIZATION_PROFILE_VERSION ||
      current.sourceFingerprint !== fingerprint;
    return shouldGenerate ? { placeId: place.id, source, fingerprint } : null;
  })
  .filter((item): item is NonNullable<typeof item> => Boolean(item))
  .slice(0, limit);

console.log(`장소 의미 프로필 생성 시작: ${scheduled.length}곳, 동시 작업 ${concurrency}개`);
let generated = 0;
let failed = 0;

await mapWithConcurrency(scheduled, concurrency, async (item) => {
  const profile = await generatePlaceMeaningProfile(item.source);
  if (!profile) {
    failed += 1;
    console.warn(`프로필 생성 실패: ${item.source.name}`);
    return;
  }

  await prisma.placeMeaningProfile.upsert({
    where: { placeId: item.placeId },
    update: {
      traits: profile.traits,
      confidence: profile.confidence,
      evidence: profile.evidence,
      sourceFingerprint: item.fingerprint,
      model,
      profileVersion: PERSONALIZATION_PROFILE_VERSION,
      generatedAt: new Date(),
    },
    create: {
      placeId: item.placeId,
      traits: profile.traits,
      confidence: profile.confidence,
      evidence: profile.evidence,
      sourceFingerprint: item.fingerprint,
      model,
      profileVersion: PERSONALIZATION_PROFILE_VERSION,
      generatedAt: new Date(),
    },
  });
  generated += 1;
  if (generated % 25 === 0) console.log(`진행 ${generated}/${scheduled.length}`);
});

console.log(JSON.stringify({ scheduled: scheduled.length, generated, failed }, null, 2));
await prisma.$disconnect();

function assertApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.includes("example")) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }
}

function readPositiveInteger(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function mapWithConcurrency<Input>(
  items: Input[],
  workerCount: number,
  worker: (item: Input) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(workerCount, Math.max(items.length, 1)) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index]);
      }
    }),
  );
}
