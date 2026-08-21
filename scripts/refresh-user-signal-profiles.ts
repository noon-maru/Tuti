import { prisma } from "../src/server/db/prisma";
import { generateUserSignalProfile } from "../src/server/personalization/profileGeneration";
import { PERSONALIZATION_PROFILE_VERSION } from "../src/server/personalization/types";
import { isUserAiProfilingEnabled } from "../src/server/personalization/config";

const limit = readPositiveInteger("--limit", 100);
const minimumSignals = readPositiveInteger("--minimum-signals", 5);
const model = process.env.OPENAI_PROFILE_MODEL?.trim() || "gpt-4o-mini";
const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

assertUserProfilingEnabled();
assertApiKey();

const users = await prisma.user.findMany({
  where: { recommendationActions: { some: { createdAt: { gte: since } } } },
  orderBy: { updatedAt: "asc" },
  select: {
    id: true,
    signalProfile: true,
    recommendationActions: {
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        action: true,
        routeMode: true,
        createdAt: true,
        place: {
          select: {
            sourceContentType: true,
            movementLevel: true,
            meaningProfile: { select: { traits: true, confidence: true } },
          },
        },
      },
    },
    recommendationRuns: {
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { answers: true, createdAt: true },
    },
  },
});

const eligible = users
  .filter((user) => user.recommendationActions.length >= minimumSignals)
  .filter((user) => {
    const newestSignal = user.recommendationActions[0]?.createdAt;
    return (
      !user.signalProfile ||
      user.signalProfile.profileVersion !== PERSONALIZATION_PROFILE_VERSION ||
      !user.signalProfile.sourceCursor ||
      (newestSignal && newestSignal > user.signalProfile.sourceCursor)
    );
  })
  .slice(0, limit);

console.log(`사용자 행동 프로필 생성 시작: ${eligible.length}명`);
let generated = 0;
let failed = 0;

for (const user of eligible) {
  const source = {
    periodDays: 90,
    explicitAnswers: user.recommendationRuns.map((run) => run.answers),
    signals: user.recommendationActions.map((action) => ({
      action: action.action,
      routeMode: action.routeMode,
      place: action.place
        ? {
            contentType: action.place.sourceContentType,
            movementLevel: action.place.movementLevel,
            meaningTraits: action.place.meaningProfile?.traits ?? null,
            meaningConfidence: action.place.meaningProfile?.confidence ?? null,
          }
        : null,
    })),
  };
  const profile = await generateUserSignalProfile(source);
  if (!profile) {
    failed += 1;
    continue;
  }

  await prisma.userSignalProfile.upsert({
    where: { userId: user.id },
    update: {
      preferences: profile.preferences,
      confidence: profile.confidence,
      evidenceCount: user.recommendationActions.length,
      sourceCursor: user.recommendationActions[0]?.createdAt,
      model,
      profileVersion: PERSONALIZATION_PROFILE_VERSION,
      generatedAt: new Date(),
    },
    create: {
      userId: user.id,
      preferences: profile.preferences,
      confidence: profile.confidence,
      evidenceCount: user.recommendationActions.length,
      sourceCursor: user.recommendationActions[0]?.createdAt,
      model,
      profileVersion: PERSONALIZATION_PROFILE_VERSION,
      generatedAt: new Date(),
    },
  });
  generated += 1;
}

console.log(JSON.stringify({ eligible: eligible.length, generated, failed }, null, 2));
await prisma.$disconnect();

function assertApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.includes("example")) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }
}

function assertUserProfilingEnabled() {
  if (!isUserAiProfilingEnabled()) {
    throw new Error(
      "사용자 행동 AI 프로필은 명시적 동의 기능을 마련하기 전까지 비활성화되어 있습니다.",
    );
  }
}

function readPositiveInteger(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
