import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";

test("지정한 하루마디의 실제 제목과 공유 범위를 작성 시작부터 표시한다", () => {
  for (const shared of [false, true]) {
    const html = renderToStaticMarkup(createElement(MadiCreateScreen, {
      inHarumadi: true, destination: { id: "book", title: "함께 걷는 하루", shared }, onBack() {}, onCollection() {},
    }));
    assert.match(html, /함께 걷는 하루/);
    assert.match(html, shared ? /함께 채우는 사람들에게 보여요/ : /나만 보는 하루마디에 담아요/);
  }
  const html = renderToStaticMarkup(createElement(MadiCreateScreen, {
    inHarumadi: true, destinationError: true, onRetryDestination() {}, onBack() {}, onCollection() {},
  }));
  assert.match(html, /담을 곳을 확인하지 못했어요/);
  assert.match(html, /다시 확인하기/);
});

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
  assert.match(screen, /const \[placeId, setPlaceId\] = useState<string \| null>\(initialPlace\?\.id \?\? null\)/);
  assert.match(screen, /onTextChange=\{value => \{ setPlace\(value\); setPlaceId\(null\); \}\}/);
});

test("화면 제목과 입력은 공통 규칙을 사용하고 마디 지면 미리보기 크기는 따로 유지한다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(screen, /const HeaderTitle = styled.span[^`]*`\$\{screenTitleStyles\}/);
  assert.match(screen, /input, textarea \{ \$\{inputControlStyles\} \}/);
  assert.match(screen, /destination\.title\}에 남길 마디` : "하루마디에 남길 마디" : madiLabel/);
  assert.doesNotMatch(screen, /data-madi-title-field/);
  assert.match(screen, /const PageTitle = styled.h2`[^`]*font-size: 15px; font-weight: 600; line-height: 1\.6/);
  assert.match(screen, /\{title && <PageTitle>\{title\}<\/PageTitle>\}/);
  assert.match(screen, /aria-label="마디 제목 \(선택\)"[^>]*maxLength=\{FIRST_JOURNAL_TITLE_LIMIT\}/);
});

test("iOS 날짜 입력의 기본 최소 폭이 작성 그리드를 밀어내지 않으며 날짜 선택은 유지한다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  const fields = screen.slice(screen.indexOf("const Fields ="), screen.indexOf("const Page ="));
  assert.equal(fields.match(/grid-template-columns: minmax\(0, 1fr\)/g)?.length, 2, "필드와 라벨 모두 기본 최소 폭을 해제한다");
  assert.match(fields, /input, textarea \{ \$\{inputControlStyles\} \}/);
  const shared = readFileSync("src/shared/ui/typography.ts", "utf8");
  assert.match(shared, /box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%/);
  assert.match(fields, /input\[type="date"\] \{ \$\{nativeDateInputStyles\} \}/);
  assert.match(shared, /-webkit-appearance: none; appearance: none; min-inline-size: 0; inline-size: 100%; max-inline-size: 100%/);
  assert.match(shared, /::-webkit-date-and-time-value \{ min-width: 0; text-align: left/);
  assert.match(screen, /aria-label="마디 날짜" type="date" max=\{today\} value=\{date\}/);
  assert.match(screen, /dateEdited.current = true; setDate\(event.target.value\)/);
  const globalStyles = readFileSync("src/app/GlobalStyles.tsx", "utf8");
  assert.match(globalStyles, /input\[type="date"\]/);
  assert.match(globalStyles, /font-size: max\(16px, 1em\) !important/);
});

test("작성 입력창의 포커스 강조는 너비와 스크롤 여백을 바꾸지 않고 테두리 안에 표시한다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  const fields = screen.slice(screen.indexOf("const Fields ="), screen.indexOf("const Page ="));
  assert.match(fields, /input, textarea \{ \$\{inputControlStyles\} \}/);
  const shared = readFileSync("src/shared/ui/typography.ts", "utf8");
  assert.match(shared, /&:focus-visible \{ outline: 2px solid var\(--color-brand-700\); outline-offset: -2px; \}/);
  assert.match(shared, /box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%/);
  assert.match(screen, /padding: 2px 2px 24px/);
  assert.doesNotMatch(fields, /outline: none|outline: 0/);
});
