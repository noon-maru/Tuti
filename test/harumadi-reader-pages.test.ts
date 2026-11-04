import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildHarumadiReaderPages, splitReaderText } from "@/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HarumadiPageSheet } from "@/features/tuti/components/HarumadiSheet";
import { readerPageWidth, readerTextLines, takeReaderText } from "@/shared/harumadi/readerText";

test("사진 아래 짧은 글은 큰 간격부터 줄여 한 쪽에 보존한다", () => {
  const { harumadi: book, entries } = harumadiContent();
  Object.assign(entries[0], { title: "서울숲, 그늘 따라 한 바퀴", image: "/photo.jpg",
    content: "나무 그늘을 따라 천천히 걸었다. 바쁜 길에서 조금만 벗어났는데 공기가 달라진 듯했다." });
  for (const width of [300, 320, 340, 360, 400]) {
    const pages = buildHarumadiReaderPages(book, entries, width);
    assert.deepEqual(pages.map(page => page.kind), ["cover", "photo", "back"], `${width}px`);
    assert.equal(pages[1].content, entries[0].content);
  }
  assert.equal(buildHarumadiReaderPages(book, entries, 320)[1].storyGap, 36, "화면용 간격에서도 전체 글이 들어가면 간격을 유지한다");
  entries[0].content = "천천히 걸었던 하루.";
  assert.equal(buildHarumadiReaderPages(book, entries, 340)[1].long, false, "넉넉히 들어가는 짧은 글의 여백은 유지한다");
});

test("단어 줄바꿈과 실제 글꼴 너비로 나누고 공백·개행은 유실하지 않는다", () => {
  assert.deepEqual(readerTextLines("aa bbbb", 4, 1), ["aa ", "bbbb"]);
  for (const text of ["단어 사이 공백\n\n마지막 줄", "\r\n".repeat(12) + "끝", "  WWWWWW\t🙂 ".repeat(8)]) {
    assert.equal(readerTextLines(text, 6, 1).join(""), text);
    const [first, rest] = takeReaderText(text, 6, 1, 2);
    assert.equal(first + rest, text);
  }
  const { harumadi: book, entries } = harumadiContent();
  Object.assign(entries[0], { image: "/photo.jpg", title: "", content: "i".repeat(140) });
  const fallback = buildHarumadiReaderPages(book, entries, 320);
  const measured = buildHarumadiReaderPages(book, entries, 320, (text, size) => text.length * size * .25);
  assert.ok(fallback.filter(p => p.kind === "continuation").length > 0);
  assert.deepEqual(measured.map(p => p.kind), ["cover", "photo", "back"]);
});

test("이어지는 쪽은 원래 마디 제목·사진 맥락을 표시하며 본문과 작성자를 유지한다", () => {
  const { harumadi: book, entries } = harumadiContent();
  Object.assign(entries[0], { title: "서울숲에서 남긴 하루", image: "/photo.jpg", authorName: "작성자", content: "천천히 걸으며 남긴 이야기. ".repeat(100) });
  const pages = buildHarumadiReaderPages(book, entries);
  const continuation = pages.filter(p => p.kind === "continuation");
  assert.ok(continuation.length > 0);
  for (const page of continuation) {
    assert.deepEqual(page.continuation, { title: entries[0].title, image: entries[0].image });
    assert.equal(page.authorName, "작성자");
  }
  assert.equal(pages.slice(1, -1).map(p => p.content).join(""), entries[0].content);
  // next/image's server interop is verified by Actions; Node SSR checks text here.
  const textOnlyHeader = { ...continuation[0], continuation: { ...continuation[0].continuation!, image: null } };
  const html = renderToStaticMarkup(createElement(HarumadiPageSheet, { page: textOnlyHeader, coverStyle: "white-plain", number: 2 }));
  assert.match(html, /서울숲에서 남긴 하루/);
  assert.match(html, /이어서/);
  assert.match(html, /data-harumadi-page="continuation"/);
  const sheet = readFileSync("src/features/tuti/components/HarumadiSheet.tsx", "utf8");
  assert.match(sheet, /<ContinuedPhoto><Image src=\{page.continuation.image\}/);
  entries[0].image = null;
  entries[0].title = "";
  const textPage = buildHarumadiReaderPages(book, entries).find(p => p.kind === "continuation")!;
  assert.deepEqual(textPage.continuation, { title: "남긴 하루", image: null });
});

test("쪽 크기는 PC 목업 축소 이전 CSS 좌표로 계산하고 숨긴 지면은 측정하지 않는다", () => {
  assert.equal(readerPageWidth(340, 600), 338);
  assert.equal(readerPageWidth(400, 500), 350);
  assert.equal(readerPageWidth(0, 0), 0);
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(viewer, /readerPageWidth\(node.clientWidth, node.clientHeight, captionSpace\)/);
  assert.doesNotMatch(viewer, /node.getBoundingClientRect\(\)/);
  assert.match(viewer, /context.measureText\(text\).width/);
  assert.match(viewer, /document.fonts\?\.ready.then\(update\)/);
});

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
