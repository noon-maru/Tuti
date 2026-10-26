import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createHarumadiPdfFilename } from "../src/shared/api/harumadiPdf";

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
test("사용자 화면·공유·API 안내의 제품 표시는 하루마디로 통일한다", () => {
  const paths = [
    ...files("src/features"), ...files("src/lib"), ...files("src/shared/tuti"),
    ...files("src/server/journal"), ...files("src/server/harumadi"), ...files("src/app/api/harumadi-pdfs"), ...files("src/app/api/harumadis"),
    "src/shared/api/harumadiPdf.ts", "src/shared/legal/sensitiveJournalPolicy.ts", "src/app/layout.tsx",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /기록집/, path);
    assert.doesNotMatch(source, /작은 하루마디|하루마디(?:으로|을|은|과|이에요|가름)/, path);
  }
  assert.match(readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8"), /새 하루마디 만들기/);
  assert.match(readFileSync("src/features/tuti/components/HarumadiPurchaseButton.tsx", "utf8"), /실물 하루마디 구매하기/);
  assert.equal(createHarumadiPdfFilename(""), "Tuti_하루마디.pdf");
  // 사용자가 붙인 제목을 제품 이름이라는 이유로 바꾸지는 않는다.
  assert.equal(createHarumadiPdfFilename("나의 작은 기록집"), "Tuti_나의 작은 기록집.pdf");
});
