import { prisma } from "../src/server/db/prisma";
import { purgePushRetention } from "../src/server/notifications/retention";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1) throw new Error("지원하지 않는 인자입니다.");
  console.log(JSON.stringify(await purgePushRetention(new Date(), args.includes("--apply"))));
} catch {
  console.error("푸시 보관자료 정리에 실패했습니다.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
