import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import { BaseButton, compactSecondaryButtonStyles, quietIconButtonStyles } from "@/shared/ui/buttons";

test("책장의 보조 행동은 같은 크기·강조·피드백을 공유하고 좁은 화면에서도 줄바꿈하지 않는다", () => {
  const Action = styled(BaseButton)`${compactSecondaryButtonStyles}`;
  const html = renderToStaticMarkup(createElement(Action, null, "나의 마디"));
  assert.match(html, /min-height:44px/);
  assert.match(html, /background:var\(--color-brand-100\)/);
  assert.match(html, /color:var\(--color-brand-1000\)/);
  assert.match(html, /font-size:\.875rem;font-weight:500;line-height:1.5;white-space:nowrap/);
  assert.match(html, /width:16px;height:16px;stroke-width:1.8/);
  assert.match(html, /max-width:\s*320px/);
  assert.match(html, /outline-offset:-2px/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  for (const name of ["MadiShortcut", "CreateHarumadi"]) {
    assert.match(home, new RegExp(`const ${name} = styled\\(TextAction\\)\x60\\$\\{compactSecondaryButtonStyles\\}`));
  }
});

test("검색·더보기·쪽 이동은 같은 44px 투명 버튼과 20px 아이콘·비활성 상태를 쓴다", () => {
  const Icon = styled(BaseButton)`${quietIconButtonStyles}`;
  const html = renderToStaticMarkup(createElement(Icon, { "aria-label": "다음 하루마디", disabled: true }, createElement("svg", { "aria-hidden": true })));
  assert.match(html, /width:44px;height:44px;min-height:44px/);
  assert.match(html, /background:transparent/);
  assert.match(html, /width:20px;height:20px;stroke-width:1.8/);
  assert.match(html, /:disabled\{opacity:0?\.35/);
  assert.match(html, /:hover:not\(:disabled\)/);
  assert.match(html, /:active:not\(:disabled\)/);
  assert.match(html, /outline:2px solid var\(--color-focus-ring\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  for (const file of ["flows/LibraryHomeFlow.tsx", "components/MainMenu.tsx", "components/HarumadiCarousel.tsx"]) {
    assert.match(readFileSync(`src/features/tuti/${file}`, "utf8"), /quietIconButtonStyles/);
  }
  const carousel = readFileSync("src/features/tuti/components/HarumadiCarousel.tsx", "utf8");
  assert.doesNotMatch(carousel, /background: #e8ede4/);
});
