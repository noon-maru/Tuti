import { prisma } from "../src/server/db/prisma";
import { purgeExpiredJournalModerationRecords } from "../src/server/journal/moderationRetention";

try {
  const executedAt = new Date();
  const deleted = await purgeExpiredJournalModerationRecords(executedAt);

  console.log(
    JSON.stringify({ executedAt: executedAt.toISOString(), deleted }, null, 2),
  );
} catch (error) {
  console.error("보존기간이 끝난 기록 공개 운영자료를 파기하지 못했습니다.", {
    error: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
