import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import GlobalStyles from "@/app/GlobalStyles";
import { BackButton, Button, PrimaryButton } from "@/shared/ui/buttons";
import { inputControlStyles, screenTitleStyles } from "@/shared/ui/typography";
import { palette } from "@/styles/tokens";

const source = (path: string) => readFileSync(path, "utf8");

test("뒤로가기는 공용 셰브론을 쓰고 목적지와 저장 중 보호를 유지한다", () => {
  const html = renderToStaticMarkup(createElement(BackButton, { "aria-label": "내 책장으로 돌아가기", disabled: true }));
  assert.match(html, /lucide-chevron-left/);
  assert.match(html, /aria-label="내 책장으로 돌아가기"/);
  assert.match(html, /disabled/);
  assert.match(html, /aria-hidden="true"/);
  const flow = source("src/features/tuti/flows/HarumadiFlow.tsx");
  const archive = source("src/features/tuti/flows/HarumadiPdfArchiveFlow.tsx");
  for (const file of [flow, archive]) {
    assert.doesNotMatch(file, /\bArrowLeft\b/);
    assert.match(file, /<BackButton/);
    assert.match(file, /내 책장으로 돌아가기/);
  }
  assert.match(flow, /<BackButton onClick=\{back\} disabled=\{busy\}/);
  assert.match(flow, /하루마디로 돌아가기/);
  assert.match(flow, /if \(busy \|\| closingRef.current\) return/);
  assert.match(archive, /onClick=\{\(\) => router.replace\("\/"\)\}/);
});
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
  assert.match(views, /styled\(ContextMenu\)/);
  assert.match(views, /white-space: nowrap/);
  assert.match(views, /min-height: 44px/);
});

test("첫 화면의 짙은 주요 버튼은 기본·호버 모두 흰 글자 대비를 확보한다", () => {
  for (const background of [palette.brand[800], palette.brand[900]]) {
    assert.ok(contrast(background, palette.neutral[100]) >= 4.5);
  }
  const welcome = source("src/features/tuti/screens/onboarding/WelcomeScreen.tsx");
  const next = welcome.match(/const NextButton = styled\(PrimaryButton\)`([^`]+)`/)![1];
  assert.match(next, /background: var\(--color-brand-800\)/);
  assert.match(next, /color: var\(--color-neutral-100\)/);
  assert.match(next, /:hover \{ background: var\(--color-brand-900\)/);
});

test("공통 포커스는 흰색·파랑·연두 표면에서 구분되고 스위치 터치 영역은 44px 이상이다", () => {
  for (const surface of [palette.neutral[100], palette.brand[100], palette.secondary[100]]) assert.ok(contrast(palette.brand[800], surface) >= 3);
  const css = renderToStaticMarkup(createElement(GlobalStyles));
  assert.match(css, /--color-focus-ring:var\(--color-brand-800\)/);
  assert.match(source("src/shared/ui/buttons.tsx"), /outline: 2px solid var\(--color-focus-ring\)/);
  for (const file of ["settings/SettingsScreen.tsx", "notifications/NotificationSettingsScreen.tsx"]) {
    const screen = source(`src/features/tuti/screens/${file}`);
    const control = screen.match(/const Switch = styled.label`([^`]+)`/)![1];
    assert.match(control, /height: 44px/);
    assert.match(control, /input:focus-visible \+ span/);
    assert.match(control, /var\(--color-focus-ring\)/);
  }
});

test("홈은 보기·생성·책장 메뉴를 한 줄로 묶고 제목과 권수를 반복하지 않는다", () => {
  const home = source("src/features/tuti/flows/LibraryHomeFlow.tsx");
  assert.match(home, /<Frame ref=\{frame\} aria-label="내 책장"/);
  const header = home.match(/<Header>[\s\S]*?<\/Header>/)![0];
  assert.match(header, /<LibraryViewSwitch/);
  assert.match(header, /<CreateHarumadi/);
  assert.match(header, /<LibraryMenu label="책장 메뉴"/);
  assert.doesNotMatch(home, /ShelfCount|<Heading>|<Toolbar>|library-title/);
  assert.match(home, /--screen-padding-top: calc\(40px \+ var\(--app-safe-area-top, 0px\)\)/);
  assert.match(home, /max-height: 620px[\s\S]*?--screen-padding-top: calc\(24px \+ var\(--app-safe-area-top, 0px\)\)/);
  const headerCss = home.match(/const Header = styled\.header`([^`]+)`/)![1];
  assert.match(headerCss, /display: flex/);
  assert.doesNotMatch(headerCss, /flex-wrap: wrap/);
});

test("홈 생성은 글자를 유지하고 전체 자료와 설정은 상단 공용 메뉴로 통합한다", () => {
  const home = source("src/features/tuti/flows/LibraryHomeFlow.tsx");
  const create = home.match(/const CreateHarumadi = styled\(TextAction\)`([^`]+)`/)![1];
  assert.match(create, /font-size: \.875rem/);
  assert.match(create, /min-height: 44px/);
  assert.match(create, /line-height: 1\.5/);
  assert.match(create, /font-weight: 500/);
  assert.match(home, /const TextAction = [\s\S]*?:focus-visible/);
  assert.match(home, /const LibraryMenu = styled\(ContextMenu\)`width: 44px; height: 44px/);
  assert.match(home, /const openEditor = \(\) => router.push\("\/harumadi"\)/);
  const links = home.match(/<LibraryMenu\b[\s\S]*?<\/Header>/)![0];
  assert.match(links, /\/madi/);
  assert.match(links, /\/harumadi\/pdfs/);
  assert.match(links, /label: "전체 마디 보기"/);
  assert.match(links, /label: "저장한 PDF"/);
  assert.match(links, /label: "설정"[\s\S]*?router.push\("\/settings"\)/);
  assert.match(links, /<MoreHorizontal size=\{22\} aria-hidden="true"/);
  assert.doesNotMatch(home, /LibraryLinks|ArchiveMenu|const IconButton/);
  assert.match(home, /<\/ShelfScroll>\s*<MainNavigation active="harumadi"/);
  assert.match(source("src/features/tuti/components/MainNavigation.tsx"), /border-top: 1px solid var\(--color-border\)/);
});
