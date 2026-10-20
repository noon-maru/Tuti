import { prisma } from "../src/server/db/prisma";
import { maintainSensitiveWithdrawals } from "../src/server/journal/sensitiveWithdrawal";
import { purgePushRetention } from "../src/server/notifications/retention";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && arg !== "--restore") || new Set(args).size !== args.length) throw new Error("지원하지 않는 인자입니다.");
  const apply = args.includes("--apply");
  const restore = args.includes("--restore");
  if (restore && (!apply || process.env.TUTI_PRIVACY_REPLAY_OFFLINE !== "true")) throw new Error("복원 후 앱 중지·유지보수 잠금 확인이 필요합니다.");
  // 과거 백업의 서버 토큰으로 철회된 알림 연결이 되살아나는 것을 막는다.
  const resetDevices = restore ? await prisma.pushDevice.deleteMany({}) : null;
  // 한 작업이 실패해도 다른 종류의 파기를 계속 시도한다. 개인별 식별값은 출력하지 않는다.
  const results = await Promise.allSettled([purgePushRetention(new Date(), apply), maintainSensitiveWithdrawals(apply)]);
  const output = results.map((result, index) => ({ task: index === 0 ? "push" : "sensitive",
    ...(result.status === "fulfilled" ? { status: "completed", ...result.value } : { status: "failed" }) }));
  console.log(JSON.stringify({ resetPushDevicesAfterRestore: resetDevices?.count ?? null, tasks: output }));
  if (results.some((result) => result.status === "rejected" || ("failed" in result.value && result.value.failed > 0))) process.exitCode = 2;
} catch {
  console.error("개인정보 정기 정리에 실패했습니다.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
