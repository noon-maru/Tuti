import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HarumadiSettingsCover } from "@/features/tuti/components/HarumadiSettingsCover";
import { HarumadiPageSheet } from "@/features/tuti/components/HarumadiSheet";
import { buildHarumadiCoverPage, buildHarumadiReaderPages } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_COVER_STYLES } from "@/shared/api/harumadiPdf";
import { harumadiContent } from "./fixtures/harumadiContent";

test("설정과 실제 표지는 같은 날짜·첫 사진 선택 및 빈 책 상태를 공유한다", () => {
  const { harumadi, entries } = harumadiContent();
  const values = [{ ...entries[0], id: "later", visitedAt: "2026-10-28T00:00:00Z", image: "/later.jpg" },
    { ...entries[0], id: "first", visitedAt: "2026-10-26T00:00:00Z", image: "/first.jpg" }];
  for (const coverStyle of HARUMADI_PDF_COVER_STYLES) {
    const book = { ...harumadi, coverStyle };
    const page = buildHarumadiCoverPage(book, values);
    assert.deepEqual(page, buildHarumadiReaderPages(book, values)[0]);
    assert.equal(page.image, coverStyle.endsWith("-image") ? "/first.jpg" : null);
    assert.equal(page.date, "2026.10.26\n- 2026.10.28");
    assert.equal(buildHarumadiCoverPage(book, []).date, "아직 쓰지 않은, 우리 이야기");
  }
});

test("설정 표지는 별도 디자인 대신 실제 표지 지면을 축소하고 네 가지 표지를 반영한다", () => {
  const { entries } = harumadiContent();
  for (const coverStyle of HARUMADI_PDF_COVER_STYLES) {
    const title = "오래 간직할 하루";
    const page = buildHarumadiCoverPage({ title, coverStyle }, entries);
    const preview = renderToStaticMarkup(createElement(HarumadiSettingsCover, { title, coverStyle, entries }));
    const actual = renderToStaticMarkup(createElement(HarumadiPageSheet, { page, coverStyle, number: 0 }));
    for (const html of [preview, actual]) {
      assert.match(html, /data-harumadi-page="cover"/);
      assert.match(html, /오래 간직할 하루/);
      assert.match(html, /2026\.10\.26/);
      assert.match(html, />Tuti<\/span>/);
      assert.match(html, coverStyle.startsWith("green") ? /#EBF5D5/ : /#FFFFFF/);
      assert.doesNotMatch(html, /Tuti \/ 하루마디|첫 사진이 표지가/);
    }
    assert.match(preview, /--hm-title:5\.625cqw/);
  }
  const empty = renderToStaticMarkup(createElement(HarumadiSettingsCover, { title: " ", coverStyle: "green-image", entries: [] }));
  assert.match(empty, /하루마디 제목/);
  assert.match(empty, /아직 쓰지 않은, 우리 이야기/);
  assert.match(empty, /#8CBDEF/);
  assert.doesNotMatch(empty, /<img/);
});

test("생성·수정 미리보기는 현재 설정과 담긴 마디를 쓰고 기존 압축 배치 크기를 유지한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /<CoverPreview title=\{settings.title\} coverStyle=\{settings.coverStyle\} entries=\{chosen\}/);
  assert.match(flow, /styled\(HarumadiSettingsCover\)/);
  assert.doesNotMatch(flow, /const PhotoPlaceholder|<small>Tuti \/ 하루마디<\/small>/);
  const cover = readFileSync("src/features/tuti/components/HarumadiSettingsCover.tsx", "utf8");
  assert.match(cover, /<HarumadiPageSheet[^>]*compactCover/);
  assert.doesNotMatch(cover, /useQuery|fetch|useEffect/);
});
