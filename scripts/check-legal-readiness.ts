import { readFile } from "node:fs/promises";
import { legalReadinessReport, legalRuntimeFacts, parseLegalReadinessArguments, parseLegalReadinessEvidence } from "../src/server/legal/readiness";

async function main() {
  const { file, scope, strict } = parseLegalReadinessArguments(process.argv.slice(2));
  const evidence = parseLegalReadinessEvidence(JSON.parse(await readFile(file, "utf8")));
  const facts = legalRuntimeFacts();
  const report = legalReadinessReport(evidence, facts, scope);
  console.log(JSON.stringify({ scope: "environment-configuration-and-recorded-evidence-only", liveDatabaseAndSchedulerVerified: false, facts, ...report }, null, 2));
  if (strict && !report.ready) process.exitCode = 2;
}
main().catch(() => { console.error("시행 준비 확인에 실패했습니다. 입력 파일과 실행 환경을 확인해주세요."); process.exitCode = 1; });
