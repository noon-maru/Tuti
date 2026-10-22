import { readFile } from "node:fs/promises";
import { prisma } from "../src/server/db/prisma";
import { prepareLegalDocumentNotice } from "../src/server/legal/documentNotice";

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--apply" && !apply) { apply = true; continue; }
    if ((key !== "--file" && key !== "--readiness-file") || options.has(key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--file 승인문서.json --readiness-file 문서승인.json [--apply] 형식으로 실행해주세요.");
    options.set(key, args[++i]);
  }
  if (!options.has("--file") || !options.has("--readiness-file")) throw new Error("공고 원문과 문서 승인 파일이 필요합니다.");
  const notice = prepareLegalDocumentNotice(JSON.parse(await readFile(options.get("--file")!, "utf8")), JSON.parse(await readFile(options.get("--readiness-file")!, "utf8")));
  if (apply) await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text AS lock_result`;
    await tx.legalDocumentNotice.create({ data: notice });
  });
  console.log(JSON.stringify({ mode: apply ? "announced" : "dry-run", documentType: notice.documentType, version: notice.version,
    documentHash: notice.documentHash, publishedAt: notice.publishedAt, plannedEffectiveAt: notice.plannedEffectiveAt,
    serviceTermsActivated: false, accountsDeleted: false, consentsCreated: false, runtimeSettingsChanged: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "공고 준비에 실패했습니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
