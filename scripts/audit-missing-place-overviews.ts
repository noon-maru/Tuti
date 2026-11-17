import { prisma } from "../src/server/db/prisma";
import { readablePlaceWhere } from "../src/server/recommendations/dogPlaceWhere";
import { editorialBackfillSelection, editorialSource } from "../src/server/tourism/placeEditorialBackfill";
import { fetchTourApiPage, TourApiError } from "../src/server/tourism/tourApiClient";

// Public place diagnostics only. Never calls enrichment/upsert functions or writes to the DB.
const live = process.argv.includes("--sample-api");
const offsetArgument = process.argv.find(argument => argument.startsWith("--sample-offset="));
const sampleOffset = offsetArgument ? Number(offsetArgument.split("=")[1]) : 0;
if (!Number.isInteger(sampleOffset) || sampleOffset < 0) throw new Error("잘못된 표본 시작 위치입니다.");
function hasText(value: unknown): boolean { return typeof value === "string" && Boolean(value.trim()); }
function overviewPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return /overview|description|소개|설명/i.test(key) && hasText(item) ? [path] : overviewPaths(item, path);
  });
}
try {
  const rows = await prisma.place.findMany({ where: readablePlaceWhere, orderBy: { sourceId: "asc" }, select: {
    ...editorialBackfillSelection,
    tourismSourceRecord: { select: { rawPayload: true, detailRecord: true } },
    dogCatalog: { select: { status: true } },
  } });
  const targets = rows.filter(row => (!row.suggestedAction?.trim() || !row.tourismSourceRecord?.detailRecord?.overviewSummary?.trim()) && !editorialSource(row).overview);
  const groups = new Map<string, typeof targets>();
  const counts: Record<string, number> = {};
  for (const row of targets) {
    const source = row.tourismSourceRecord, detail = source?.detailRecord;
    const state = !source ? "noSourceRecord" : !detail ? "noDetailRecord" : detail.editorialSyncedAt || detail.syncedAt ? "successfulFetchButEmptyOverview" : detail.editorialAttemptAt || detail.lastAttemptAt ? "attemptedWithoutSuccess" : "detailNeverFetched";
    counts[state] = (counts[state] ?? 0) + 1;
    const key = `${row.sourceContentType ?? "unknown"}:${state}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const payloadAlternatives = targets.flatMap(row => {
    const paths = overviewPaths({ source: row.tourismSourceRecord?.rawPayload, common: row.tourismSourceRecord?.detailRecord?.commonPayload,
      intro: row.tourismSourceRecord?.detailRecord?.introPayload, info: row.tourismSourceRecord?.detailRecord?.infoPayload });
    return paths.length ? [{ contentId: row.sourceId, paths }] : [];
  });
  const petRows = await prisma.tourismPetSourceRecord.findMany({ where: { contentId: { in: targets.flatMap(row => row.sourceId ? [row.sourceId] : []) } }, select: { contentId: true, rawPayload: true, listPayload: true } });
  const petAlternatives = petRows.flatMap(row => {
    const paths = overviewPaths({ raw: row.rawPayload, list: row.listPayload });
    return paths.length ? [{ contentId: row.contentId, paths }] : [];
  });
  const samples = [...groups.entries()].flatMap(([group, list]) => {
    const size = Math.min(group.startsWith("38:") ? 12 : 4, list.length);
    return Array.from({ length: size }, (_, index) => ({ group, row: list[Math.floor(index * list.length / size)] }));
  });
  console.log(JSON.stringify({ scope: "configured-database-public-place-audit", totalReadable: rows.length, missingOverview: targets.length, states: counts,
    groups: [...groups].map(([group, list]) => ({ group, count: list.length })), payloadAlternatives, petAlternatives,
    readyDogCatalogWithoutOverview: targets.filter(row => row.dogCatalog?.status === "ready").length,
    liveSamplePlanned: live ? samples.slice(sampleOffset).length : 0, databaseChanged: false }));
  if (live) {
    let httpFailures = 0;
    for (const { group, row } of samples.slice(sampleOffset)) {
      if (!row.sourceId) continue;
      try {
        const response = await fetchTourApiPage<Record<string, unknown>>("detailCommon2", { contentId: row.sourceId, pageNo: "1", numOfRows: "1" });
        const item = response.items[0];
        console.log(JSON.stringify({ group, contentId: row.sourceId, name: row.name, items: response.items.length,
          remoteOverviewPresent: hasText(item?.overview), remoteOverviewLength: typeof item?.overview === "string" ? item.overview.trim().length : 0,
          alternativeOverviewPaths: overviewPaths(item), storedLastError: Boolean(row.tourismSourceRecord?.detailRecord?.editorialLastError || row.tourismSourceRecord?.detailRecord?.lastError) }));
      } catch (error) {
        const code = error instanceof TourApiError ? error.code : "unknown_error";
        const httpStatus = error instanceof TourApiError ? error.message.match(/HTTP (\d{3})/)?.[1] : undefined;
        console.log(JSON.stringify({ group, contentId: row.sourceId, errorCode: code, httpStatus }));
        // Isolated HTTP failures do not prove the remaining samples lack an overview.
        // Stop on authorization/quota/transport failures or repeated HTTP failures.
        if (code !== "tour_api_http_error" || httpStatus === "429" || httpStatus === "401" || httpStatus === "403" || ++httpFailures >= 3) break;
      }
    }
  }
} finally { await prisma.$disconnect(); }
