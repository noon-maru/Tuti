import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readerGroupGeometry, readerPageWidth } from "@/shared/harumadi/readerText";
import { HARUMADI_READING_LAYOUT as layout } from "@/shared/harumadi/readingTypography";

test("쪽 이동을 분리해 지면 자체의 중심이 읽기 영역 중심과 일치한다", () => {
  const normal = readerGroupGeometry(318, 676);
  const tall = readerGroupGeometry(318, 800);
  assert.deepEqual(normal, tall);
  assert.ok(Math.abs(normal.stageHeight - 318 * 595.28 / 419.53) < .01);
  assert.equal(normal.pageWidth, 316);
  assert.equal(layout.viewer.gap, 12);
  assert.ok(normal.stageHeight + 44 + layout.viewer.gap < 676);
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  const readerCss = viewer.match(/const Reader = styled.div`([^`]+)`/)![1];
  assert.match(readerCss, /justify-content: center/);
  assert.doesNotMatch(readerCss, /justify-content: flex-start/);
  assert.match(readerCss, /position: relative/);
  assert.match(viewer, /const Navigation = styled.nav`position: absolute/);
  assert.match(viewer, /navigationOffset/);
  assert.match(viewer, /getComputedStyle\(node\).rowGap/);
});

test("작은 화면·늘어난 버튼·공동작성 서명을 회수한 높이로 페이지를 나눈다", () => {
  const caption = layout.byline.gap + layout.byline.height;
  for (const [width, height] of [[264, 400], [303, 480], [318, 676], [358, 764]]) {
    for (const navigation of [44, 60]) for (const reserved of [0, caption]) {
      const result = readerGroupGeometry(width, height, reserved, navigation);
      const readerHeight = Math.max(height, result.minimumHeight);
      assert.ok(readerHeight / 2 + result.navigationOffset + navigation <= readerHeight + .01);
      assert.equal(result.pageWidth, readerPageWidth(width, result.stageHeight, reserved));
      assert.ok(result.pageWidth <= width);
      const paperTop = readerHeight / 2 - result.stageHeight / 2 + result.stageOffset;
      const paperHeight = result.stageHeight - reserved;
      assert.ok(Math.abs(paperTop + paperHeight / 2 - readerHeight / 2) < .01, "작성자 서명이 있어도 종이 자체를 중심에 놓는다");
      assert.ok(Math.abs(readerHeight / 2 + result.navigationOffset - (paperTop + result.stageHeight) - layout.viewer.gap) < .01);
    }
  }
  assert.ok(readerGroupGeometry(318, 400, caption).pageWidth < readerGroupGeometry(318, 400).pageWidth);
  assert.equal(readerGroupGeometry(318, 676, caption).pageWidth, readerGroupGeometry(318, 676).pageWidth);
  for (const height of [40, 100]) {
    const tiny = readerGroupGeometry(264, height, caption);
    assert.ok(tiny.minimumHeight > height);
    assert.ok(tiny.stageHeight > caption);
    assert.ok(tiny.minimumHeight / 2 + tiny.navigationOffset + 44 <= tiny.minimumHeight + .01);
  }
  const compact = readerGroupGeometry(264, 400, 0, 44, 8);
  assert.equal(compact.stageHeight, 400 - 2 * (44 + 8));
  assert.ok(compact.pageWidth > readerGroupGeometry(264, 400).pageWidth);
});

test("바깥 패딩만 늘리고 안전 영역·조작부·공유 서명과 페이지 전환 경로를 유지한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(flow, /--reader-outside-inset: 36px/);
  assert.match(flow, /max-width: 340px.*--reader-outside-inset: 28px/);
  assert.match(flow, /var\(--reader-outside-inset\) \+ var\(--app-safe-area-right, 0px\)/);
  assert.match(flow, /\$reading && `padding-top: calc\(40px \+ var\(--app-safe-area-top, 0px\)\)/);
  assert.match(flow, /<Header \$reading=\{mode === "pages"\}/);
  assert.match(flow, /max-height: 620px.*padding-top: calc\(24px \+ var\(--app-safe-area-top, 0px\)\)/);
  assert.doesNotMatch(flow, /--reader-top-inset|--reader-vertical-inset/);
  assert.match(flow, /\$reading \? "12px calc/);
  const actions = flow.match(/const ReaderTools = styled.nav`([^`]+)`/)![1];
  assert.match(actions, /16px \+ var\(--app-safe-area-right, 0px\)/);
  assert.match(actions, /16px \+ var\(--app-safe-area-bottom, 0px\)/);
  assert.match(flow, /<\/Body>\s*\{mode === "pages" && harumadi && <ReaderTools/);
  assert.doesNotMatch(viewer, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(viewer, /style=\{\{ height: stageHeight, transform:/);
  assert.match(viewer, /observer.observe\(controls\)/);
  assert.match(viewer, /observer.disconnect\(\)/);
  assert.match(viewer, /style=\{\{ minHeight: minimumHeight \}\}/);
  assert.match(flow, /overflow-y: auto/);
  assert.match(viewer, /<HarumadiByline shared=\{book.shared\}/);
  assert.match(viewer, /welcomeHarumadiTurn/);
  assert.match(viewer, /min-height: 44px/);
});
