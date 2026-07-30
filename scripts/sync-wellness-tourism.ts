import { prisma } from "../src/server/db/prisma";
import { syncWellnessTourism } from "../src/server/tourism/syncWellnessTourism";

try {
  const startedAt = new Date();
  const result = await syncWellnessTourism({
    startPage: 1,
    maxPages: 100,
    pageSize: 100,
  });
  const canPrune =
    result.failed === 0 &&
    result.skipped === 0 &&
    result.received === result.totalAvailable;
  const pruned = canPrune
    ? await prisma.wellnessTourismSourceRecord.deleteMany({
        where: {
          langDivCd: "KOR",
          syncedAt: { lt: startedAt },
        },
      })
    : { count: 0 };

  console.log("웰니스 관광정보 정기 동기화를 완료했습니다.");
  console.table({
    ...result,
    pruned: pruned.count,
    pruningSkipped: !canPrune,
  });

  if (result.failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
