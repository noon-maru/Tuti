import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";

test("첫 마디 안내는 진입 위치가 아니라 실제 마디가 없는 경우에만 사용한다", () => {
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /firstMadi=\{isSuccess && entries.length === 0\}/);
  assert.doesNotMatch(flow, /if \(fromWelcome\)|<JournalEditorScreen|startTransition/);
  assert.equal(flow.match(/<MadiCreateScreen/g)?.length, 1);
  for (const firstMadi of [false, true]) {
    const html = renderToStaticMarkup(createElement(MadiCreateScreen, {
      firstMadi, onBack() {}, onCollection() {},
    }));
    assert.match(html, firstMadi ? />첫 마디<\/span>/ : />새로운 마디<\/span>/);
    assert.match(html, /사진 없이 글로 시작하기/);
    assert.match(html, /앨범에서 사진 고르기/);
  }
});

test("작성 완료는 원래 화면으로 복귀하며 하루마디 연결과 추천 행동 계측을 보존한다", () => {
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /onBack=\{returnToSource\}/);
  assert.match(flow, /fromExplore \? "작은 여행으로 돌아가기"/);
  assert.match(flow, /&addEntryId=\$\{encodeURIComponent\(savedEntryId.current\)\}/);
  assert.match(flow, /harumadiSelection=\{ownerId/);
  assert.match(flow, /onDone: \(\) => \{ requestLoginNudge\("journal_created"\); returnToSource\(\); \}/);
  assert.match(flow, /action: "journal_created"/);
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(screen, /setSavedAsFirstMadi\(firstMadi && !continued\)/);
  assert.match(screen, /initialPlace && place.trim\(\) === initialPlace.name \? initialPlace.id : null/);
});

test("상단 작성 화면 제목만 키우고 마디 제목 입력·미리보기 크기는 원래대로 유지한다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(screen, /> span \{ min-width: 0; font-size: 18px; font-weight: 600/);
  assert.match(screen, /@container app-viewport \(max-width: 340px\) \{ > span \{ font-size: 16px/);
  assert.match(screen, /inHarumadi \? "하루마디에 남길 마디" : madiLabel/);
  assert.doesNotMatch(screen, /data-madi-title-field/);
  assert.match(screen, /const PageTitle = styled.h2`[^`]*font-size: 15px; font-weight: 600; line-height: 1\.6/);
  assert.match(screen, /\{title && <PageTitle>\{title\}<\/PageTitle>\}/);
  assert.match(screen, /aria-label="마디 제목 \(선택\)"[^>]*maxLength=\{FIRST_JOURNAL_TITLE_LIMIT\}/);
});
