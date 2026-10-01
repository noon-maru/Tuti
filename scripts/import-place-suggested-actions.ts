import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { recommendablePlaceWhere } from "../src/server/recommendations/recommendablePlaceWhere";

const DEFAULT_INPUT = "data/place-suggested-actions/2026-10-01.jsonl";
const inputPath = resolve(readOption("--input") ?? DEFAULT_INPUT);
const apply = process.argv.includes("--apply");

const items = readItems(inputPath);
const places = await prisma.place.findMany({
  where: recommendablePlaceWhere,
  select: {
    id: true,
    sourceId: true,
  },
});

const itemByContentId = new Map(items.map((item) => [item.contentId, item]));
const missing = places.filter(
  ({ sourceId }) => !sourceId || !itemByContentId.has(sourceId),
);
if (missing.length > 0) {
  throw new Error(`행동 문구 입력에서 현재 추천 장소 ${missing.length}곳이 누락됐습니다.`);
}

const updates = places.map(({ id, sourceId }) => {
  const item = sourceId ? itemByContentId.get(sourceId) : null;
  if (!item) throw new Error(`행동 문구 입력을 찾지 못했습니다: ${id}`);
  return { placeId: id, ...item };
});

console.log(
  JSON.stringify(
    {
      input: inputPath,
      supplied: items.length,
      eligible: updates.length,
      mode: apply ? "apply" : "dry-run",
    },
    null,
    2,
  ),
);

if (apply) {
  for (const chunk of chunked(updates, 200)) {
    await prisma.$transaction(
      chunk.map(({ placeId, action }) =>
        prisma.place.update({
          where: { id: placeId },
          data: { suggestedAction: action },
        }),
      ),
    );
  }
  console.log(`장소별 할 일 문구 ${updates.length}곳을 반영했습니다.`);
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
      if (typeof value.action !== "string") {
        throw new Error(`${index + 1}행의 action이 올바르지 않습니다.`);
      }
      const keys = Object.keys(value).sort().join(",");
      if (keys !== "action,contentId") {
        throw new Error(`${index + 1}행에 허용되지 않은 필드가 있습니다.`);
      }
      if (seen.has(value.contentId)) {
        throw new Error(`중복 contentId입니다: ${value.contentId}`);
      }
      seen.add(value.contentId);

      const action = value.action.replace(/\s+/g, " ").trim();
      if (action.length < 1 || action.length > 60) {
        throw new Error(`${index + 1}행의 action 길이가 올바르지 않습니다.`);
      }
      return { contentId: value.contentId, action };
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
