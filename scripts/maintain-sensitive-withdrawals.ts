import { prisma } from "../src/server/db/prisma";
import { maintainSensitiveWithdrawals } from "../src/server/journal/sensitiveWithdrawal";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1) throw new Error("지원하지 않는 인자입니다.");
  const result = await maintainSensitiveWithdrawals(args.includes("--apply"));
  console.log(JSON.stringify(result));
  if (result.failed > 0) process.exitCode = 2;
} catch {
  console.error("철회한 민감정보 기록 정리에 실패했습니다.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
