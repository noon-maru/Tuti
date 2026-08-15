import { prisma } from "../src/server/db/prisma";

async function main() {
  const now = new Date();
  const [expired, retained, deleted] = await prisma.$transaction([
    prisma.locationUsageLog.count({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.locationUsageLog.count({
      where: { retentionUntil: { gt: now } },
    }),
    prisma.locationUsageLog.deleteMany({
      where: { retentionUntil: { lte: now } },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        executedAt: now.toISOString(),
        expiredBeforeRun: expired,
        deleted: deleted.count,
        retained,
        policy: "location usage logs are retained for six months",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("위치정보 이용·제공사실 확인자료를 파기하지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
