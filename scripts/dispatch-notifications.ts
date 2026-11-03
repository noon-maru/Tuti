import { prisma } from "../src/server/db/prisma";
import { dispatchNotifications } from "../src/server/notifications/dispatch";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) throw new Error("사용법: dispatch-notifications.ts [--apply]");
try {
  const result = await dispatchNotifications(args[0] === "--apply");
  console.log(JSON.stringify(result));
  if ("failed" in result && result.failed > 0) process.exitCode = 1;
} catch { console.error("알림 발송 점검에 실패했습니다. DB·제공자 설정을 확인해주세요."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
