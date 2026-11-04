import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readerGroupGeometry, readerPageWidth } from "@/shared/harumadi/readerText";
import { HARUMADI_READING_LAYOUT as layout } from "@/shared/harumadi/readingTypography";

test("읽기 지면과 쪽 이동은 간격을 유지한 채 읽기 영역에서 세로 중앙 정렬한다", () => {
  const normal = readerGroupGeometry(318, 676);
  const tall = readerGroupGeometry(318, 800);
  assert.deepEqual(normal, tall);
  assert.ok(Math.abs(normal.stageHeight - 318 * 595.28 / 419.53) < .01);
  assert.equal(normal.pageWidth, 316);
  assert.equal(layout.viewer.gap, 36);
  assert.ok(normal.stageHeight + 44 + layout.viewer.gap < 676);
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  const readerCss = viewer.match(/const Reader = styled.div`([^`]+)`/)![1];
  assert.match(readerCss, /justify-content: center/);
  assert.doesNotMatch(readerCss, /justify-content: flex-start/);
  assert.match(readerCss, /gap: var\(--reader-outside-inset/);
  assert.match(viewer, /getComputedStyle\(node\).rowGap/);
});

test("작은 화면·늘어난 버튼·공동작성 서명을 회수한 높이로 페이지를 나눈다", () => {
  const caption = layout.byline.gap + layout.byline.height;
  for (const [width, height] of [[264, 400], [303, 480], [318, 676], [358, 764]]) {
    for (const navigation of [44, 60]) for (const reserved of [0, caption]) {
      const result = readerGroupGeometry(width, height, reserved, navigation);
      assert.ok(result.stageHeight + navigation + layout.viewer.gap <= height + .01);
      assert.equal(result.pageWidth, readerPageWidth(width, result.stageHeight, reserved));
      assert.ok(result.pageWidth <= width);
    }
  }
  assert.ok(readerGroupGeometry(318, 400, caption).pageWidth < readerGroupGeometry(318, 400).pageWidth);
  assert.equal(readerGroupGeometry(318, 676, caption).pageWidth, readerGroupGeometry(318, 676).pageWidth);
  assert.equal(readerGroupGeometry(318, 40).stageHeight, 0);
  const compact = readerGroupGeometry(264, 400, 0, 44, 28);
  assert.equal(compact.stageHeight, 400 - 44 - 28);
  assert.ok(compact.pageWidth > readerGroupGeometry(264, 400).pageWidth);
});

test("바깥 패딩만 늘리고 안전 영역·조작부·공유 서명과 페이지 전환 경로를 유지한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(flow, /--reader-outside-inset: 36px/);
  assert.match(flow, /max-width: 340px.*--reader-outside-inset: 28px/);
  assert.match(flow, /var\(--reader-outside-inset\) \+ var\(--app-safe-area-right, 0px\)/);
  assert.match(flow, /--reader-vertical-inset: 48px/);
  assert.match(flow, /--reader-top-inset: 96px/);
  assert.match(flow, /max-height: 620px.*--reader-top-inset: 48px/);
  assert.match(flow, /max-height: 620px.*--reader-vertical-inset: 36px/);
  assert.match(flow, /var\(--reader-vertical-inset\) \+ var\(--app-safe-area-bottom, 0px\)/);
  assert.match(flow, /\$reading \? "var\(--reader-top-inset\) calc/);
  assert.doesNotMatch(viewer, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(viewer, /style=\{\{ height: stageHeight \}\}/);
  assert.match(viewer, /observer.observe\(controls\)/);
  assert.match(viewer, /observer.disconnect\(\)/);
  assert.match(viewer, /<HarumadiByline shared=\{book.shared\}/);
  assert.match(viewer, /welcomeHarumadiTurn/);
  assert.match(viewer, /min-height: 44px/);
});
