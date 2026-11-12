import { prisma } from "../src/server/db/prisma";
import { cafeCategoryFromPayload, classifyCafe } from "../src/server/tourism/cafeClassification";

if (process.argv.slice(2).length) throw new Error("이 도구는 인자 없이 조회만 합니다. --apply는 지원하지 않습니다.");
try {
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const types = await tx.tourismPlaceSourceRecord.groupBy({ by: ["contentTypeId"], _count: true });
    const rows = await tx.tourismPlaceSourceRecord.findMany({
      where: { OR: [{ contentTypeId: "39" }, ...["카페", "까페", "커피", "찻집", "다방", "티하우스", "coffee", "cafe", "café"].map(value => ({ title: { contains: value, mode: "insensitive" as const } }))] },
      orderBy: { contentId: "asc" },
      select: { contentId: true, title: true, contentTypeId: true, rawPayload: true,
        detailRecord: { select: { overview: true, commonPayload: true, overviewSummary: true } },
        linkedPlace: { select: { name: true, candidateStatus: true, candidateScore: true, candidateOverride: true, reviewStatus: true, visibilityOverride: true, isActive: true, image: true, suggestedAction: true } } },
    });
    const places = rows.map(row => {
      const detail = row.detailRecord;
      const raw = detail?.commonPayload && typeof detail.commonPayload === "object" && !Array.isArray(detail.commonPayload) ? detail.commonPayload : {};
      const overview = detail?.overview ?? (typeof raw.overview === "string" ? raw.overview : null);
      const classification = classifyCafe({ name: row.linkedPlace?.name ?? row.title, contentTypeId: row.contentTypeId, overview, ...cafeCategoryFromPayload(row.rawPayload) });
      const place = row.linkedPlace;
      return { contentId: row.contentId, name: place?.name ?? row.title, classification,
        registered: Boolean(place), candidateStatus: place?.candidateStatus ?? null, candidateScore: place?.candidateScore ?? null,
        recommendable: Boolean(place && place.isActive && place.reviewStatus === "approved" && (place.candidateOverride === "include" || place.candidateOverride === "auto" && place.candidateStatus === "selected")),
        operatorReviewRequired: Boolean(place && (place.reviewStatus === "rejected" || place.visibilityOverride === "hide" || place.candidateOverride === "exclude")),
        hasOverview: Boolean(overview?.trim()), hasSummary: Boolean(detail?.overviewSummary?.trim()), hasAction: Boolean(place?.suggestedAction?.trim()),
        hasImage: Boolean(place?.image?.trim() || (row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload) && (row.rawPayload.firstimage || row.rawPayload.firstimage2))),
      };
    });
    const counts = Object.fromEntries(["venue", "related", "ambiguous", "unrelated"].map(kind => [kind, places.filter(row => row.classification.kind === kind).length]));
    return { scope: "tourism-cafe-audit-read-only", databaseChanged: false, externalApiCalls: 0, types, counts, places };
  }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(report, null, 2));
} finally { await prisma.$disconnect(); }
