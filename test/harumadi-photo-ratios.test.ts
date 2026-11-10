import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildHarumadiReaderPages } from "../src/shared/harumadi/readerPages";
import { buildHarumadiSpread } from "../src/features/tuti/components/HarumadiSpreadPreview";
import { HarumadiPageSheet } from "../src/features/tuti/components/HarumadiSheet";
import { harumadiContent } from "./fixtures/harumadiContent";

test("실제 지면은 선택 비율을 보존하고 세로 사진 아래 긴 글을 유실 없이 이어 쓴다", () => {
  const fixture = harumadiContent();
  for (const [w, h] of [[1200, 900], [1200, 1200], [900, 1200], [675, 1200]]) {
    const entry = { ...fixture.entries[0], image: "/synthetic.jpg", imageWidth: w, imageHeight: h, content: "기억하고 싶은 하루.\n".repeat(150) };
    for (const width of [240, 320, 400]) {
      const pages = buildHarumadiReaderPages(fixture.harumadi, [entry], width);
      const photo = pages.find(page => page.kind === "photo")!;
      assert.ok(Math.abs(photo.photoSize!.width / photo.photoSize!.height - w / h) < 1e-8);
      assert.ok(photo.photoSize!.height <= 320);
      assert.equal(pages.filter(page => page.entryId === entry.id).map(page => page.content).join(""), entry.content);
      assert.ok(pages.some(page => page.kind === "continuation"));
      // Next/Image interop is handled by the app bundler; inspect the actual photo frame CSS here.
      const html = renderToStaticMarkup(createElement(HarumadiPageSheet, { page: { ...photo, image: null }, coverStyle: "white-plain", number: 1 }));
      assert.match(html, /object-fit:contain/);
    }
    const only = buildHarumadiReaderPages(fixture.harumadi, [{ ...entry, title: "", content: "" }])[1];
    assert.equal(only.kind, "photo-only");
    assert.ok(Math.abs(only.photoSize!.width / only.photoSize!.height - w / h) < 1e-8);
  }
});
test("책장 펼친 미리보기와 목록 카드는 실제 세로 사진도 4:3 미리보기로 유지한다", () => {
  const fixture = harumadiContent();
  const entry = { ...fixture.entries[0], image: "/synthetic.jpg", imageWidth: 675, imageHeight: 1200 };
  const pages = buildHarumadiSpread(fixture.harumadi, [entry]);
  assert.ok(Math.abs(pages[0].photoSize!.width / pages[0].photoSize!.height - 4 / 3) < 1e-8);
  assert.match(readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8"), /aspect-ratio: 4 \/ 3/);
  assert.match(readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8"), /aspect-ratio: 4 \/ 3/);
  const spread = readFileSync("src/features/tuti/components/HarumadiSpreadPreview.tsx", "utf8");
  assert.match(spread, /number=\{index \+ 1\} preview/);
});
