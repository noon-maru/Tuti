import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import GlobalStyles from "@/app/GlobalStyles";
import { Button, PrimaryButton } from "@/shared/ui/buttons";
import { inputControlStyles, screenTitleStyles } from "@/shared/ui/typography";
import { palette } from "@/styles/tokens";

const source = (path: string) => readFileSync(path, "utf8");
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + .05) / (dark + .05);
}

test("작은 여행과 책장이 같은 역할 토큰을 쓰되 PDF 글자 규칙은 분리한다", () => {
  const css = renderToStaticMarkup(createElement(GlobalStyles));
  assert.match(css, /--ui-input-size:max\(1rem, var\(--font-size-200\)\)/);
  assert.match(css, /--ui-title-weight:600/);
  for (const file of ["src/features/tuti/screens/settings/SettingsScreen.tsx", "src/features/tuti/screens/journal/JournalScreen.tsx", "src/features/tuti/screens/journal/JournalEditorScreen.tsx", "src/features/tuti/screens/journal/MadiCreateScreen.tsx"]) {
    assert.match(source(file), /screenTitleStyles/);
  }
  assert.doesNotMatch(source("src/features/tuti/components/HarumadiSheet.tsx"), /ui-input-size|ui-title-size|shared\/ui\/typography/);
});

test("공용 입력은 최소 16px·44px 조작 높이·안쪽 포커스를 유지한다", () => {
  const Input = styled.input`${inputControlStyles}`;
  const Title = styled.h1`${screenTitleStyles}`;
  const html = renderToStaticMarkup(createElement("div", null, createElement(Title, null, "긴 제목의 하루마디"), createElement(Input, { "aria-label": "마디 제목" })));
  assert.match(html, /font-size:var\(--ui-input-size\)/);
  assert.match(html, /min-height:var\(--ui-control-height\)/);
  assert.match(html, /outline-offset:-2px/);
  assert.match(html, /overflow-wrap:anywhere/);
  for (const file of ["src/features/tuti/screens/journal/MadiCreateScreen.tsx", "src/features/tuti/screens/journal/JournalEditorScreen.tsx", "src/features/tuti/flows/HarumadiFlow.tsx"]) assert.match(source(file), /inputControlStyles/);
});

test("밝은 파랑·연두 행동 버튼은 4.5:1 이상 대비의 짙은 글자를 사용한다", () => {
  assert.ok(contrast(palette.brand[500], palette.brand[1000]) >= 4.5);
  assert.ok(contrast(palette.secondary[500], palette.secondary[1000]) >= 4.5);
  for (const child of [createElement(PrimaryButton, null, "저장하기"), createElement(Button, { $tone: "primary" }, "계속하기")]) {
    const html = renderToStaticMarkup(child);
    assert.match(html, /background:var\(--color-action-primary-background\)/);
    assert.match(html, /color:var\(--color-action-primary-text\)/);
  }
});

test("책장도 ScreenFrame 여백을 쓰며 좁은 화면에서 보기 이름과 조작 영역을 보존한다", () => {
  const home = source("src/features/tuti/flows/LibraryHomeFlow.tsx");
  assert.match(home, /const Frame = styled\(ScreenFrame\)/);
  assert.match(home, /padding: var\(--screen-padding-top\) var\(--screen-padding-right\)/);
  assert.match(home, /container-type: size/);
  const views = source("src/features/tuti/components/LibraryViewSwitch.tsx");
  assert.match(views, /max-width: 390px/); assert.match(views, /svg \{ display: none/);
  assert.match(views, /min-height: 44px/);
});
