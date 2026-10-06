import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import {
  createPlaceOverviewSummaryFingerprint,
  PLACE_OVERVIEW_SUMMARY_MODEL,
  PLACE_OVERVIEW_SUMMARY_VERSION,
} from "../src/server/tourism/placeOverviewSummary";

const DEFAULT_INPUT = "data/place-overview-summaries/2026-10-01.jsonl";
const inputPath = resolve(readOption("--input") ?? DEFAULT_INPUT);
const apply = process.argv.includes("--apply");

const items = readItems(inputPath);
const places = await prisma.place.findMany({
  where: {
    isActive: true,
    reviewStatus: "approved",
    OR: [
      { candidateOverride: "include" },
      { candidateOverride: "auto", candidateStatus: "selected" },
    ],
  },
  select: {
    tourismSourceRecord: {
      select: {
        detailRecord: {
          select: {
            contentId: true,
            contentTypeId: true,
            overview: true,
            experienceGuide: true,
          },
        },
      },
    },
  },
});

const itemById = new Map(items.map((item) => [item.contentId, item]));
const eligibleRecords = places.flatMap(
  ({ tourismSourceRecord }) => tourismSourceRecord?.detailRecord ?? [],
);

const missing = eligibleRecords.filter(({ contentId }) => !itemById.has(contentId));
if (missing.length > 0) {
  throw new Error(
    `요약 입력에서 현재 추천 장소 ${missing.length}곳이 누락됐습니다: ${missing
      .map(({ contentId }) => contentId)
      .join(", ")}`,
  );
}

const updates = eligibleRecords.map((record) => {
  const item = itemById.get(record.contentId);
  if (!item) throw new Error(`요약 입력을 찾지 못했습니다: ${record.contentId}`);
  if (Boolean(record.overview?.trim()) !== Boolean(item.summary)) {
    throw new Error(`원문과 요약의 null 상태가 다릅니다: ${record.contentId}`);
  }

  return {
    contentId: record.contentId,
    summary: item.summary,
    fingerprint: item.summary
      ? createPlaceOverviewSummaryFingerprint(record)
      : null,
  };
});

console.log(
  JSON.stringify(
    {
      input: inputPath,
      supplied: items.length,
      eligible: eligibleRecords.length,
      summaries: updates.filter(({ summary }) => summary).length,
      skippedWithoutOverview: updates.filter(({ summary }) => !summary).length,
      mode: apply ? "apply" : "dry-run",
    },
    null,
    2,
  ),
);

if (apply) {
  const generatedAt = new Date();
  for (const chunk of chunked(updates, 200)) {
    await prisma.$transaction(
      chunk.map(({ contentId, summary, fingerprint }) =>
        prisma.tourismPlaceDetailRecord.update({
          where: { contentId },
          data: {
            overviewSummary: summary,
            summarySourceFingerprint: fingerprint,
            summaryModel: summary ? PLACE_OVERVIEW_SUMMARY_MODEL : null,
            summaryVersion: summary ? PLACE_OVERVIEW_SUMMARY_VERSION : null,
            summaryGeneratedAt: summary ? generatedAt : null,
          },
        }),
      ),
    );
  }
  console.log(`장소 요약 ${updates.length}곳을 반영했습니다.`);
}

await prisma.$disconnect();

function readItems(path: string) {
  const seen = new Set<string>();
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value) || typeof value.contentId !== "string") {
        throw new Error(`${index + 1}행의 contentId가 올바르지 않습니다.`);
      }
      if (value.summary !== null && typeof value.summary !== "string") {
        throw new Error(`${index + 1}행의 summary가 올바르지 않습니다.`);
      }
      const keys = Object.keys(value).sort().join(",");
      if (keys !== "contentId,summary") {
        throw new Error(`${index + 1}행에 허용되지 않은 필드가 있습니다.`);
      }
      if (seen.has(value.contentId)) {
        throw new Error(`중복 contentId입니다: ${value.contentId}`);
      }
      seen.add(value.contentId);

      const summary = value.summary?.replace(/\s+/g, " ").trim() ?? null;
      if (summary !== null && (summary.length < 1 || summary.length > 180)) {
        throw new Error(`${index + 1}행의 summary 길이가 올바르지 않습니다.`);
      }
      return { contentId: value.contentId, summary };
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
