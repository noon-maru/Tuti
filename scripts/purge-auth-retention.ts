import { purgeExpiredAuthRecords } from "../src/server/auth/retention";
import { prisma } from "../src/server/db/prisma";

try {
  const executedAt = new Date();
  const deleted = await purgeExpiredAuthRecords(executedAt);

  console.log(JSON.stringify({ executedAt: executedAt.toISOString(), deleted }, null, 2));
} catch (error) {
  console.error("만료된 인증자료를 파기하지 못했습니다.", {
    error: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
