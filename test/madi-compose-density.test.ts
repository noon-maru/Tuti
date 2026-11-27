import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findMadiControl, madiCreateHarness } from "./fixtures/madiCreateHarness";

test("첫 선택 단계만 여백을 분산하고 글 작성 단계에는 작은 제목을 사용한다", () => {
  const page = madiCreateHarness({ onBack() {}, onCollection() {} }, "photo");
  assert.equal(findMadiControl(page.render(), props => "$choosing" in props)?.$choosing, true);
  assert.equal(findMadiControl(page.render(), props => "$compact" in props)?.$compact, false);
  page.click("사진 없이 글로 시작하기");
  assert.equal(findMadiControl(page.render(), props => "$choosing" in props)?.$choosing, false);
  assert.equal(findMadiControl(page.render(), props => "$compact" in props)?.$compact, true);
  assert.ok(findMadiControl(page.render(), props => props["aria-label"] === "마디 제목 (선택)"));
  assert.ok(findMadiControl(page.render(), props => props["aria-label"] === "기억하고 싶은 이야기"));
  assert.ok(findMadiControl(page.render(), props => props["aria-label"] === "마디 날짜"));
});

test("짧은 화면은 첫 단계 여백을 되돌리고 입력·저장 영역과 사진 비율은 보존한다", () => {
  const source = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(source, /padding-top: clamp\(24px, 7cqh, 64px\)/);
  assert.match(source, /@container app-viewport \(max-height: 620px\) \{ padding-top: 2px; gap: 16px;/);
  assert.match(source, /overflow-y: auto/);
  assert.match(source, /textarea \{ min-height: 130px; resize: vertical;/);
  assert.match(source, /const Footer = styled.footer`\s*flex: none/);
  assert.match(source, /const PhotoChoices[^`]*`[^`]*> button \{ min-height: 52px;/);
  assert.match(source, /const SelectedPhoto[^`]*`[^`]*aspect-ratio: 4 \/ 3/);
});
