import { Prisma } from "@/generated/prisma/client";

// 자동 취득한 위치에서 나온 거리·시간·후보 목록과 직접 작성한 기록/찜은 구분한다.
export async function purgeLocationDerivedData(transaction: Prisma.TransactionClient, userId: string, through?: Date) {
  const time = through ? { createdAt: { lte: through } } : {};
  await transaction.recommendationRun.deleteMany({ where: { userId, locationUsed: true, ...time } });
  await transaction.recommendationAction.updateMany({
    where: { userId, action: "navigation_started", ...time },
    data: { metadata: Prisma.DbNull },
  });
}

export async function countLocationDerivedData(transaction: Prisma.TransactionClient, userId: string) {
  const [recommendationRuns, routeMetadata] = await Promise.all([
    transaction.recommendationRun.count({ where: { userId, locationUsed: true } }),
    transaction.recommendationAction.count({ where: { userId, action: "navigation_started", metadata: { not: Prisma.DbNull } } }),
  ]);
  return { recommendationRuns, routeMetadata };
}
