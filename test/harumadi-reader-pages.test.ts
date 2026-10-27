import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildHarumadiReaderPages, splitReaderText } from "@/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";

test("실제 마디를 표지·본문·뒷표지로 만들고 빈 책과 글 속지도 지원한다", () => {
  const { harumadi: book, entries } = harumadiContent();
  assert.deepEqual(buildHarumadiReaderPages(book, []).map(p => p.kind), ["cover", "empty", "back"]);
  entries[0].image = "/photo.jpg";
  entries[0].content = "";
  assert.deepEqual(buildHarumadiReaderPages(book, entries).map(p => p.kind), ["cover", "photo-only", "back"]);
  assert.equal(buildHarumadiReaderPages({ ...book, innerStyle: "text" }, entries)[1].image, null);
  entries[0].content = "짧게 남긴 하루";
  assert.equal(buildHarumadiReaderPages(book, entries)[1].kind, "photo");
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
