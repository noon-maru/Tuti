import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { MainMenu } from "@/features/tuti/components/MainMenu";
import { mainMenuItems } from "@/features/tuti/navigation/mainMenuItems";

const actions = { onDownload() {}, onSettings() {}, onAdmin() {} };

test("책장·작은 여행의 공통 항목은 같은 순서와 플랫폼·관리자 노출 조건을 사용한다", () => {
  for (const target of ["web", "app", undefined]) {
    for (const adminAccess of [false, true]) {
      const items = mainMenuItems({ ...actions, adminAccess }, target);
      assert.equal(items.filter(item => item.label === "설정").length, 1);
      assert.equal(items.some(item => item.label === "앱 다운로드"), target === "web");
      assert.equal(items.some(item => item.label === "관리자 페이지"), adminAccess && target !== "app");
      assert.equal(items.find(item => item.label === "설정")?.group, "도움말 · 설정");
    }
  }
  assert.deepEqual(mainMenuItems({ ...actions, adminAccess: true }, "web").map(item => item.label), ["앱 다운로드", "설정", "관리자 페이지"]);
});

test("공통 메뉴는 동작 콜백과 화면별 항목을 보존하고 작은 여행 기능을 책장에 섞지 않는다", () => {
  const selected: string[] = [];
  const items = mainMenuItems({
    items: [{ group: "보관함", label: "전체 마디 보기", onSelect: () => { selected.push("madis"); } }],
    helpItems: [{ label: "하루마디 예시 펼쳐보기", onSelect: () => { selected.push("example"); } }],
    adminAccess: true,
    onDownload: () => { selected.push("download"); }, onSettings: () => { selected.push("settings"); }, onAdmin: () => { selected.push("admin"); },
  }, "web");
  for (const item of items) item.onSelect({} as HTMLButtonElement);
  assert.deepEqual(selected, ["madis", "example", "download", "settings", "admin"]);
  assert.deepEqual(items.map(item => item.group), ["보관함", "도움말 · 설정", "도움말 · 설정", "도움말 · 설정", "운영"]);
  assert.equal(items.some(item => /재추천|외출 조건|익숙한/.test(item.label)), false);
});

test("두 메인 메뉴는 동일한 세로 점 아이콘·44px 조작 영역·메뉴 접근성을 렌더링한다", () => {
  for (const label of ["책장 메뉴", "메인 메뉴"]) {
    const html = renderToStaticMarkup(createElement(MainMenu, { ...actions, label }));
    assert.ok(html.includes(`aria-label="${label}"`));
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /lucide-(?:ellipsis-vertical|more-vertical)/);
    assert.doesNotMatch(html, /lucide-(?:ellipsis |more-horizontal)/);
    assert.match(html, /width:44px;height:44px/);
  }
  const component = readFileSync("src/features/tuti/components/MainMenu.tsx", "utf8");
  assert.match(component, /quietIconButtonStyles/);
  assert.match(component, /aria-hidden="true"/);
});

test("두 화면은 공통 메뉴를 사용하고 책장의 공통 목적지·역할 연결과 전용 동작을 유지한다", () => {
  const library = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const explore = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  for (const source of [library, explore]) {
    assert.match(source, /<MainMenu/);
    assert.doesNotMatch(source, /<MoreHorizontal|<LibraryMenu|<ContextMenu/);
  }
  for (const path of ["/download", "/settings", "/admin", "/madi", "/harumadi/pdfs"]) assert.ok(library.includes(`router.push("${path}")`));
  assert.match(library, /adminAccess=\{session.account\?\.role === "admin"\}/);
  assert.match(library, /onSelect: openExample/);
  assert.match(library, /<TextAction onClick=\{openExample\}/);
  for (const action of ["onRestartIntake", "onRefreshFromCurrentLocation", "onSavedPlaces", "replayInitialHelp"]) assert.ok(explore.includes(action));
});
