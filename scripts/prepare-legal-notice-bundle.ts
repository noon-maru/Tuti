import { readFile } from "node:fs/promises";
import { FINAL_NOTICE_FILES, prepareFinalNoticeBundle } from "../src/server/legal/finalNoticeBundle";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !arg.startsWith("--effective-at=") || !arg.slice(15))) throw new Error("지원 옵션: [--effective-at=ISO시각]. 조회·준비 전용이며 --apply는 지원하지 않습니다.");
  const root = "docs/legal/release/";
  const sources = Object.fromEntries(await Promise.all(Object.entries(FINAL_NOTICE_FILES).map(async ([kind, file]) => [kind, await readFile(root + file, "utf8")]))) as Parameters<typeof prepareFinalNoticeBundle>[0]["sources"];
  const bundle = prepareFinalNoticeBundle({ sources,
    serviceTermsDraft: await readFile("docs/legal/service-terms-draft.md", "utf8"),
    manifest: JSON.parse(await readFile(root + "review-manifest.json", "utf8")),
    readiness: JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8")),
    ...(args[0] ? { effectiveAt: args[0].slice(15) } : {}),
  });
  console.log(JSON.stringify(bundle, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "공고 묶음 준비 실패"); process.exitCode = 1; });
