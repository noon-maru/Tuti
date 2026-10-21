import { readFile } from "node:fs/promises";
import { prepareServiceTermsReview } from "../src/server/legal/noticePreparation";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--document")) throw new Error("지원 옵션: [--document]. 승인·공고·파일 쓰기는 수행하지 않습니다.");
  const review = prepareServiceTermsReview(await readFile("docs/legal/service-terms-draft.md", "utf8"));
  if (args.includes("--document")) console.log(JSON.stringify(review, null, 2));
  else {
    const { document, ...metadata } = review;
    console.log(JSON.stringify({ ...metadata, title: document.title, summary: document.summary, importantTerms: document.importantTerms }, null, 2));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "일반약관 검토 후보 생성 실패"); process.exitCode = 1; });
