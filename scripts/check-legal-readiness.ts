import { readFile } from "node:fs/promises";
import { legalReadinessBlockers, legalRuntimeFacts, parseLegalReadinessEvidence } from "../src/server/legal/readiness";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--strict" && !arg.startsWith("--file="))) throw new Error("--file=확인파일.json [--strict] 형식으로 실행해주세요.");
  const file = args.find((arg) => arg.startsWith("--file="))?.slice(7) ?? "docs/legal/readiness-status.json";
  const evidence = parseLegalReadinessEvidence(JSON.parse(await readFile(file, "utf8")));
  const facts = legalRuntimeFacts();
  const blockers = legalReadinessBlockers(evidence, facts);
  console.log(JSON.stringify({ scope: "environment-configuration-and-recorded-evidence-only", liveDatabaseAndSchedulerVerified: false, ready: blockers.length === 0, facts, blockers }, null, 2));
  if (args.includes("--strict") && blockers.length) process.exitCode = 2;
}
main().catch(() => { console.error("시행 준비 확인에 실패했습니다. 입력 파일과 실행 환경을 확인해주세요."); process.exitCode = 1; });
