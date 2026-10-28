import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildHarumadiReaderPages, splitReaderText } from "@/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";

test("실제 마디를 표지·본문·뒷표지로 만들고 사진과 글을 내용에 따라 배치한다", () => {
  const { harumadi: book, entries } = harumadiContent();
  assert.deepEqual(buildHarumadiReaderPages(book, []).map(p => p.kind), ["cover", "empty", "back"]);
  entries[0].image = "/photo.jpg";
  entries[0].content = "";
  entries[0].title = "";
  assert.deepEqual(buildHarumadiReaderPages(book, entries).map(p => p.kind), ["cover", "photo-only", "back"]);
  assert.equal(buildHarumadiReaderPages(book, entries)[1].image, entries[0].image);
  entries[0].title = "사진에 붙인 제목";
  assert.equal(buildHarumadiReaderPages(book, entries)[1].kind, "photo");
  assert.equal(buildHarumadiReaderPages(book, entries)[1].title, "사진에 붙인 제목");
  entries[0].content = "짧게 남긴 하루";
  assert.equal(buildHarumadiReaderPages(book, entries)[1].kind, "photo");
  entries[0].image = null;
  assert.equal(buildHarumadiReaderPages(book, entries)[1].kind, "text");
});

test("속지 타입은 UI·API·모델에서 제거하고 설정 열만 삭제한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.doesNotMatch(flow, /innerStyle|InnerChoice|PaperSample|<legend>속지/);
  assert.match(flow, /이름과 표지/);
  for (const path of ["src/shared/api/harumadi.ts", "src/shared/api/harumadiPdf.ts", "src/server/harumadi/service.ts", "src/server/harumadi/content.ts", "src/server/pdf/harumadiPdf.tsx", "src/app/api/harumadi-pdfs/preview/route.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /innerStyle|HarumadiInnerStyle|HARUMADI_INNER_STYLES/);
  }
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(schema.match(/model Harumadi \{[\s\S]*?\n\}/)?.[0] ?? "", /innerStyle|inner_style/);
  const migration = readFileSync("prisma/migrations/20261028120000_remove_harumadi_inner_style/migration.sql", "utf8");
  assert.match(migration, /ALTER TABLE "harumadis" DROP COLUMN "inner_style"/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|journal_entries|harumadi_pdfs/);
});

test("긴 글·줄바꿈·이모지를 잘라 버리지 않고 이어지는 쪽으로 보존한다", () => {
  for (const text of ["길게남긴이야기".repeat(300), "\n".repeat(40) + "끝", "사진과 이야기 👩‍👩‍👧‍👦\n".repeat(100)]) {
    assert.equal(splitReaderText(text, 18, 7).join(""), text);
    const { harumadi: book, entries } = harumadiContent();
    entries[0].content = text; entries[0].image = "/photo.jpg";
    const pages = buildHarumadiReaderPages(book, entries).filter(p => !["cover", "back"].includes(p.kind));
    assert.equal(pages.map(p => p.content).join(""), text);
    assert.ok(pages.length > 1);
    assert.equal(pages[1].kind, "continuation");
  }
});

test("실제 읽기와 예시는 공유 지면을 사용하며 세로 목록 대신 쪽 이동을 제공한다", () => {
  const sample = readFileSync("src/features/tuti/screens/onboarding/WelcomeHarumadiSample.tsx", "utf8");
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(sample, /components\/HarumadiSheet/);
  assert.match(viewer, /HarumadiPageSheet/);
  assert.match(viewer, /welcomeHarumadiTurn/);
  assert.match(viewer, /이전 쪽/); assert.match(viewer, /다음 쪽/);
  assert.match(viewer, /onPointerUp/); assert.match(viewer, /ArrowRight/);
  assert.match(flow, /<HarumadiPageViewer book=\{harumadi\}/);
  assert.doesNotMatch(flow, /<Pages>|chosen.map\(entry => <Page/);
});

test("읽기 글꼴을 인쇄 수치와 분리하고 좁은 지면에서도 제목·본문을 모두 보존한다", () => {
  const { harumadi: book, entries } = harumadiContent();
  entries[0].title = "오래 기억하고 싶은 우리들의 작은 하루 ".repeat(3).slice(0, 80);
  entries[0].content = "넓은 영문 WWWWWW와 함께 남기는 이야기\n".repeat(70);
  entries[0].image = "/photo.jpg";
  const wide = buildHarumadiReaderPages(book, entries, 340);
  const narrow = buildHarumadiReaderPages(book, entries, 220);
  assert.ok(narrow.length > wide.length);
  for (const pages of [wide, narrow]) {
    const body = pages.filter(p => p.kind !== "cover" && p.kind !== "back");
    assert.equal(body.map(p => p.content).join(""), entries[0].content);
    assert.equal(body.map(p => p.title).join(""), entries[0].title);
  }
  const sheet = readFileSync("src/features/tuti/components/HarumadiSheet.tsx", "utf8");
  assert.match(sheet, /\$reading data-harumadi-page/);
  assert.match(sheet, /--hm-body: \$\{reading.body\}px/);
  assert.match(sheet, /--hm-photo-body: \$\{reading.photoBody\}px/);
  const sample = sheet.slice(sheet.indexOf("export function WelcomeHarumadiSample"), sheet.indexOf("function PhotoHeader"));
  assert.doesNotMatch(sample, /\$reading/);
});
