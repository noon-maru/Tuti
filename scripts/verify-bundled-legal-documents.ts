import { readFileSync } from "node:fs";
import { FINAL_NOTICE_FILES, prepareFinalNoticeBundle } from "../src/server/legal/finalNoticeBundle";

const read = (file: string) => readFileSync(file, "utf8");
const bundle = prepareFinalNoticeBundle({
  sources: Object.fromEntries(Object.entries(FINAL_NOTICE_FILES).map(([kind, file]) => [kind, read("docs/legal/release/" + file)])) as Parameters<typeof prepareFinalNoticeBundle>[0]["sources"],
  serviceTermsDraft: read("docs/legal/service-terms-draft.md"),
  manifest: JSON.parse(read("docs/legal/release/review-manifest.json")),
  readiness: JSON.parse(read("docs/legal/readiness-status.json")),
});
const documents = Object.fromEntries(bundle.entries.map(entry => [entry.documentType, {
  version: entry.notice.version, documentHash: entry.documentHash, document: entry.notice.document,
}]));
if (process.argv.slice(2).join() === "--print") console.log(JSON.stringify(documents, null, 2));
else if (process.argv.length !== 2) throw new Error("지원 옵션: --print");
else if (JSON.stringify(documents) !== JSON.stringify(JSON.parse(read("src/shared/legal/finalizedDocuments.json")))) throw new Error("앱 약관 묶음이 승인한 원문과 다릅니다.");
else console.log("bundled-legal-documents=verified");
