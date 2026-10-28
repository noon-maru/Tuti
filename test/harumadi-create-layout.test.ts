import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");

test("새 하루마디만 표지·이름 병렬 배치와 앱 높이 기반 표지 크기를 사용한다", () => {
  assert.match(flow, /<SettingsPanel \$creating=\{!harumadi\}>/);
  assert.match(flow, /<CoverSetup \$creating=\{!harumadi\}>/);
  assert.match(flow, /<NameField \$creating=\{!harumadi\}>/);
  assert.match(flow, /--create-cover-width: clamp\(76px, 14cqh, 112px\)/);
  assert.match(flow, /grid-template-columns: var\(--create-cover-width\) minmax\(0, 1fr\)/);
  assert.match(flow, /@container app-viewport \(max-height: 620px\)/);
  assert.match(flow, /@container app-viewport \(max-width: 340px\)/);
  assert.match(flow, /display: \$\{\(\{ \$creating \}\) => \$creating \? "grid" : "contents"\}/);
});

test("작은 화면에서도 입력·표지 선택·확인·만들기 버튼을 숨기지 않고 예외적인 넘침만 스크롤한다", () => {
  assert.match(flow, /<Footer \$creating=\{!harumadi && mode === "settings"\}>/);
  assert.match(flow, /const Footer = styled.footer[\s\S]*?flex: none/);
  assert.match(flow, /overflow-y: \$\{\(\{ \$reading \}\) => \$reading \? "hidden" : "auto"\}/);
  assert.match(flow, /const TitleInput = styled.input`[^`]*font-size: 16px/);
  assert.match(flow, /min-height: 44px; padding: 10px; font-size: 13px/);
  assert.match(flow, /titleNeedsConfirmation && <Confirmation/);
  assert.match(flow, /빈 하루마디 만들기/);
  assert.match(flow, /harumadi && <BackCoverField>/);
});
