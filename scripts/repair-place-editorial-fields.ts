import { prisma } from "../src/server/db/prisma";
import { recommendablePlaceWhere } from "../src/server/recommendations/recommendablePlaceWhere";
import { normalizeTourApiPlaceDetail } from "../src/server/tourism/enrichTourismPlaceDetail";
import { createEditorialFieldRepairs } from "../src/server/tourism/placeEditorialRepair";
import type { TourApiDetailItem } from "../src/server/tourism/tourApiDetailClient";

const apply = process.argv.includes("--apply");
const idsIndex = process.argv.indexOf("--ids");
const contentIds = idsIndex >= 0
  ? process.argv[idsIndex + 1]?.split(",").map((id) => id.trim()).filter(Boolean)
  : undefined;
if (idsIndex >= 0 && !contentIds?.length) throw new Error("--ids에 contentId를 쉼표로 구분해 지정해주세요.");

try {
  const places = await prisma.place.findMany({
    where: {
      AND: [recommendablePlaceWhere, ...(contentIds ? [{ sourceId: { in: contentIds } }] : [])],
    },
    select: {
      name: true,
      tourismSourceRecord: { select: { detailRecord: true } },
    },
    orderBy: { id: "asc" },
  });
  const repairs = places.flatMap((place) => {
    const record = place.tourismSourceRecord?.detailRecord;
    if (!record) return [];
    const normalized = normalizeTourApiPlaceDetail({
      common: asRecord(record.commonPayload),
      intro: asRecord(record.introPayload),
      info: Array.isArray(record.infoPayload)
        ? record.infoPayload.map(asRecord).filter((item): item is TourApiDetailItem => item !== null)
        : [],
      images: [],
    }).fields;
    const data = createEditorialFieldRepairs(record, normalized);
    return Object.keys(data).length > 0
      ? [{ contentId: record.contentId, name: place.name, data, current: record }]
      : [];
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    eligiblePlaces: places.length,
    repairedPlaces: repairs.length,
    repairedFields: repairs.reduce((count, item) => count + Object.keys(item.data).length, 0),
    repairs: repairs.map(({ contentId, name, data }) => ({
      contentId, name, fields: Object.keys(data),
    })),
  }, null, 2));

  if (apply) {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1418031911)`;
      for (const { contentId, data, current } of repairs) {
        // 원문이나 편집값이 조회 이후 바뀌었으면 전체 복원을 취소한다.
        const result = await transaction.tourismPlaceDetailRecord.updateMany({
          where: { contentId, updatedAt: current.updatedAt },
          data,
        });
        if (result.count !== 1) {
          throw new Error(`원문이 동시에 갱신됐습니다. 복원 대상을 다시 확인해주세요: ${contentId}`);
        }
      }
    }, { maxWait: 30_000, timeout: 300_000 });
  }
} finally {
  await prisma.$disconnect();
}

function asRecord(value: unknown): TourApiDetailItem | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as TourApiDetailItem
    : null;
}
