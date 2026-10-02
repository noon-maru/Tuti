import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { derivePlaceExperienceType } from "../src/server/recommendations/experienceType";
import { recommendablePlaceWhere } from "../src/server/recommendations/recommendablePlaceWhere";
import {
  createPlaceVisitTimeSourceFingerprint,
  deriveVisitAccessProfile,
  getDefaultStayDurationProfile,
  PLACE_VISIT_TIME_DEFAULT_MODEL,
  PLACE_VISIT_TIME_PROFILE_MODEL,
  PLACE_VISIT_TIME_PROFILE_VERSION,
  resolveStayDuration,
  type ParsedStayDuration,
  type PlaceVisitTimeSource,
  type StayDurationSource,
} from "../src/server/recommendations/placeVisitTimeProfile";

const DEFAULT_INPUT_DIR = "data/place-visit-time-profiles";
const DEFAULT_BATCH = "2026-10-02";
const inputDir = resolve(readOption("--input-dir") ?? DEFAULT_INPUT_DIR);
const batch = readOption("--batch") ?? DEFAULT_BATCH;
const apply = process.argv.includes("--apply");
const explicitItems = readExplicitItems(inputDir, batch);
const explicitInputs = readExplicitInputs(inputDir, batch);
const explicitByContentId = new Map(
  explicitItems.map((item) => [item.contentId, item]),
);
const explicitInputByContentId = new Map(
  explicitInputs.map((item) => [item.contentId, item]),
);

const places = await prisma.place.findMany({
  where: recommendablePlaceWhere,
  orderBy: { id: "asc" },
  select: {
    id: true,
    name: true,
    sourceId: true,
    sourceContentType: true,
    experienceType: true,
    tourismSourceRecord: {
      select: {
        detailRecord: {
          select: {
            overview: true,
            overviewSummary: true,
            usageDuration: true,
            experienceGuide: true,
            parking: true,
            reservation: true,
            admissionFee: true,
          },
        },
      },
    },
  },
});

const eligibleContentIds = new Set(
  places.flatMap(({ sourceId }) => sourceId ? [sourceId] : []),
);
const extras = explicitItems.filter(({ contentId }) => !eligibleContentIds.has(contentId));
if (extras.length > 0) {
  console.warn(
    `현재 추천 대상이 아닌 구조화 결과 ${extras.length}건은 무시합니다: ${extras[0].contentId}`,
  );
}

const missingExplicit = places.filter((place) => {
  const usageDuration = place.tourismSourceRecord?.detailRecord?.usageDuration?.trim();
  return usageDuration && (!place.sourceId || !explicitByContentId.has(place.sourceId));
});
if (missingExplicit.length > 0) {
  throw new Error(
    `체류시간 원문이 있지만 LLM 구조화 결과가 없는 장소 ${missingExplicit.length}곳: ${missingExplicit[0].name}`,
  );
}

const staleExplicit = places.filter((place) => {
  if (!place.sourceId || !explicitByContentId.has(place.sourceId)) return false;
  const input = explicitInputByContentId.get(place.sourceId);
  return !input || normalizeText(input.usageDuration) !== normalizeText(
    place.tourismSourceRecord?.detailRecord?.usageDuration,
  );
});
if (staleExplicit.length > 0) {
  throw new Error(
    `구조화 이후 체류시간 원문이 바뀐 장소 ${staleExplicit.length}곳: ${staleExplicit[0].name}`,
  );
}

const generatedAt = new Date();
const updates = places.map((place) => {
  const detail = place.tourismSourceRecord?.detailRecord;
  const experienceType = derivePlaceExperienceType({
    name: place.name,
    phrase: "",
    note: "",
    sourceContentType: place.sourceContentType ?? undefined,
    moodTags: [],
    overview: detail?.overview,
    experienceGuide: detail?.experienceGuide,
  });
  const source: PlaceVisitTimeSource = {
    name: place.name,
    contentTypeId: place.sourceContentType,
    experienceType,
    overview: detail?.overview,
    overviewSummary: detail?.overviewSummary,
    usageDuration: detail?.usageDuration,
    experienceGuide: detail?.experienceGuide,
    parking: detail?.parking,
    reservation: detail?.reservation,
    admissionFee: detail?.admissionFee,
  };
  const explicit = place.sourceId
    ? explicitByContentId.get(place.sourceId)
    : undefined;
  const stay = resolveStayDuration(source, explicit);
  const defaultProfile = stay.source === "type_default"
    ? getDefaultStayDurationProfile(source)
    : null;
  const access = deriveVisitAccessProfile(source);
  const fallbackFields = [
    ...(stay.source === "type_default" ? ["stayDuration"] : []),
    ...(access.parkingAvailability === "unknown" ? ["parkingAvailability"] : []),
  ];

  return {
    placeId: place.id,
    stay,
    defaultProfileId: defaultProfile?.id,
    access,
    confidence: stay.confidence,
    evidence: [stay.evidence],
    fallbackFields,
    sourceFingerprint: createPlaceVisitTimeSourceFingerprint(source),
    model: stay.source === "type_default"
      ? PLACE_VISIT_TIME_DEFAULT_MODEL
      : PLACE_VISIT_TIME_PROFILE_MODEL,
  };
});

console.log(JSON.stringify({
  inputDirectory: inputDir,
  batch,
  suppliedExplicit: explicitItems.length,
  ignoredExplicit: extras.length,
  eligiblePlaces: places.length,
  llmParsed: updates.filter(({ stay }) => stay.source === "llm_parsed").length,
  defaulted: updates.filter(({ stay }) => stay.source === "type_default").length,
  defaultProfiles: Object.fromEntries(
    Array.from(Map.groupBy(
      updates.filter(({ stay }) => stay.source === "type_default"),
      ({ defaultProfileId }) => defaultProfileId ?? "unknown",
    )).map(([profileId, items]) => [profileId, items.length]),
  ),
  unknownParking: updates.filter(
    ({ access }) => access.parkingAvailability === "unknown",
  ).length,
  mode: apply ? "apply" : "dry-run",
}, null, 2));

if (apply) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1418031911)`;
    for (const chunk of chunked(updates, 200)) {
      await Promise.all(chunk.map((item) =>
        transaction.placeVisitTimeProfile.upsert({
          where: { placeId: item.placeId },
          update: toPersistenceData(item),
          create: { placeId: item.placeId, ...toPersistenceData(item) },
        }),
      ));
    }
  }, { maxWait: 30_000, timeout: 300_000 });
  console.log(`장소 방문시간 프로필 ${updates.length}곳을 반영했습니다.`);
}

await prisma.$disconnect();

function toPersistenceData(item: (typeof updates)[number]) {
  return {
    stayMinimumMinutes: item.stay.minimumMinutes,
    stayTypicalMinutes: item.stay.typicalMinutes,
    stayMaximumMinutes: item.stay.maximumMinutes,
    staySource: item.stay.source,
    stayFlexibility: item.access.stayFlexibility,
    parkingAvailability: item.access.parkingAvailability,
    carSuitability: item.access.carSuitability,
    entryProcess: item.access.entryProcess,
    reservationRequirement: item.access.reservationRequirement,
    accessConstraint: item.access.accessConstraint,
    parkingBufferMinimumMinutes: item.access.parkingBuffer.minimumMinutes,
    parkingBufferTypicalMinutes: item.access.parkingBuffer.typicalMinutes,
    parkingBufferMaximumMinutes: item.access.parkingBuffer.maximumMinutes,
    entryBufferMinimumMinutes: item.access.entryBuffer.minimumMinutes,
    entryBufferTypicalMinutes: item.access.entryBuffer.typicalMinutes,
    entryBufferMaximumMinutes: item.access.entryBuffer.maximumMinutes,
    confidence: item.confidence,
    evidence: item.evidence,
    fallbackFields: item.fallbackFields,
    sourceFingerprint: item.sourceFingerprint,
    model: item.model,
    profileVersion: PLACE_VISIT_TIME_PROFILE_VERSION,
    generatedAt,
  };
}

function readExplicitItems(directory: string, batchName: string) {
  const escapedBatchName = escapeRegExp(batchName);
  const paths = readdirSync(directory)
    .filter((name) => new RegExp(
      `^${escapedBatchName}-explicit-[a-z]\\.jsonl$`,
      "u",
    ).test(name))
    .sort()
    .map((name) => resolve(directory, name));
  if (paths.length === 0) throw new Error(`LLM 구조화 JSONL을 찾지 못했습니다: ${directory}`);

  const seen = new Set<string>();
  return paths.flatMap((path) => readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => parseExplicitItem(line, `${path}:${index + 1}`, seen)));
}

function readExplicitInputs(directory: string, batchName: string) {
  const path = resolve(directory, `${batchName}-explicit-input.jsonl`);
  const seen = new Set<string>();
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const location = `${path}:${index + 1}`;
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) throw new Error(`${location} 객체가 아닙니다.`);
      const expectedKeys = [
        "contentId",
        "contentTypeId",
        "experienceType",
        "name",
        "usageDuration",
      ];
      if (Object.keys(value).sort().join(",") !== expectedKeys.join(",")) {
        throw new Error(`${location} 허용되지 않은 필드가 있습니다.`);
      }
      if (typeof value.contentId !== "string" || seen.has(value.contentId)) {
        throw new Error(`${location} contentId가 없거나 중복입니다.`);
      }
      if (typeof value.usageDuration !== "string") {
        throw new Error(`${location} usageDuration이 올바르지 않습니다.`);
      }
      seen.add(value.contentId);
      return {
        contentId: value.contentId,
        usageDuration: value.usageDuration,
      };
    });
}

function parseExplicitItem(line: string, location: string, seen: Set<string>) {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error(`${location} 객체가 아닙니다.`);
  const expectedKeys = [
    "confidence",
    "contentId",
    "evidence",
    "maximumMinutes",
    "minimumMinutes",
    "source",
    "typicalMinutes",
  ];
  if (Object.keys(value).sort().join(",") !== expectedKeys.join(",")) {
    throw new Error(`${location} 허용되지 않은 필드가 있습니다.`);
  }
  if (typeof value.contentId !== "string" || seen.has(value.contentId)) {
    throw new Error(`${location} contentId가 없거나 중복입니다.`);
  }
  seen.add(value.contentId);
  if (
    !isStaySource(value.source) ||
    typeof value.evidence !== "string" ||
    value.evidence.trim().length === 0
  ) {
    throw new Error(`${location} source 또는 evidence가 올바르지 않습니다.`);
  }
  const minutes = [value.minimumMinutes, value.typicalMinutes, value.maximumMinutes];
  if (!minutes.every((minute) => Number.isInteger(minute) && Number(minute) >= 10 && Number(minute) <= 720)) {
    throw new Error(`${location} 체류시간 범위가 올바르지 않습니다.`);
  }
  if (Number(minutes[0]) > Number(minutes[1]) || Number(minutes[1]) > Number(minutes[2])) {
    throw new Error(`${location} 최소·일반·최대 순서가 올바르지 않습니다.`);
  }
  if (!Number.isInteger(value.confidence) || Number(value.confidence) < 0 || Number(value.confidence) > 100) {
    throw new Error(`${location} confidence가 올바르지 않습니다.`);
  }
  return {
    contentId: value.contentId,
    minimumMinutes: Number(value.minimumMinutes),
    typicalMinutes: Number(value.typicalMinutes),
    maximumMinutes: Number(value.maximumMinutes),
    source: value.source,
    confidence: Number(value.confidence),
    evidence: value.evidence.trim(),
  } satisfies ParsedStayDuration & { contentId: string };
}

function readOption(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function chunked<Value>(values: Value[], size: number) {
  const chunks: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function isStaySource(value: unknown): value is StayDurationSource {
  return value === "llm_parsed" || value === "type_default" || value === "manual_override";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
