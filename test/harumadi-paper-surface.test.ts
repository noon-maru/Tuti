import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { HarumadiPaperSurface } from "@/features/tuti/components/HarumadiPaperSurface";

test("지면은 원본 한 번만 렌더링하고 표지·미리보기의 기존 크기를 유지한다", () => {
  let renders = 0;
  const Content = () => { renders++; return createElement("span", { "data-original-content": true }, "하루의 이야기"); };
  const html = renderToStaticMarkup(createElement(HarumadiPaperSurface, null, createElement(Content)));
  assert.equal(renders, 1);
  assert.equal((html.match(/data-original-content/g) ?? []).length, 1);
  assert.match(html, /aspect-ratio:148\/210/);
  assert.match(html, /data-paper-source/);
  assert.doesNotMatch(html, /data-paper-flex-layer|visibility:hidden/);
});

test("표지 열기·닫기와 미리보기에서 휨·복제 레이어 코드를 제거한다", () => {
  for (const file of ["src/lib/harumadiOpen.ts", "src/lib/harumadiClose.ts", "src/features/tuti/components/HarumadiPaperSurface.tsx", "src/features/tuti/components/HarumadiSpreadPreview.tsx"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /animateHarumadiPaperFlex|restorePaper|cloneNode|paperFlexLayer/);
  }
  assert.equal(existsSync("src/lib/harumadiPaperFlex.ts"), false);
  const surface = readFileSync("src/features/tuti/components/HarumadiPaperSurface.tsx", "utf8");
  assert.doesNotMatch(surface, /useLayoutEffect|useRef|\.animate\(/);
});
