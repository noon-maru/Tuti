import { readFile } from "node:fs/promises";
import { auditProcessingInventory, type ProcessingInventory } from "../src/server/legal/processingInventory";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== "--strict")) throw new Error("지원 옵션: [--strict]. 실제 DB·설정은 변경하지 않습니다.");
  const inventory = JSON.parse(await readFile("docs/legal/processing-inventory.json", "utf8")) as ProcessingInventory;
  const report = auditProcessingInventory(inventory, await readFile("prisma/schema.prisma", "utf8"));
  // 선언한 소스가 사라지면 과거 근거를 그대로 정상 처리하지 않는다.
  await Promise.all(report.sources.map(source => readFile(source, "utf8")));
  console.log(JSON.stringify(report, null, 2));
  if (args.includes("--strict") && !report.sourceCoverageComplete) process.exitCode = 2;
}
main().catch(() => { console.error("처리 목록의 모델 분류·소스 근거 확인에 실패했습니다. 계약·적법성·운영 완료로 처리하지 않습니다."); process.exitCode = 1; });
