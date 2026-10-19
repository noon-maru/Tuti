import { prisma } from "../src/server/db/prisma";
import { inspectLegalOperations } from "../src/server/legal/operations";

async function main() {
  if (process.argv.length > 2) throw new Error("이 도구는 인자 없이 실행하는 읽기 전용 점검입니다.");
  const result = await inspectLegalOperations();
  console.log(JSON.stringify(result, null, 2));
  if (result.terms.status === "unavailable" || result.rights.status === "unavailable") process.exitCode = 2;
}
main().catch(() => { console.error("운영 이행 점검에 실패했습니다. 설정·DB 연결·마이그레이션을 확인해주세요."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
