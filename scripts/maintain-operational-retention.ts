import { prisma } from "../src/server/db/prisma";
import { purgeOperationalRetention } from "../src/server/legal/retention";

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg !== "--apply")) throw new Error("INVALID_ARGUMENTS");
  const result = await purgeOperationalRetention(new Date(), args.includes("--apply"));
  console.log(JSON.stringify(result));
  if (result.reviewRequired) process.exitCode = 2;
} catch {
  console.error("운영자료 보관기한 점검에 실패했습니다. 원문·식별값 없이 설정과 보전 목록을 확인해주세요.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
