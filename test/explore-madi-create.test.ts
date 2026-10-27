import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("둘러보기 아래 드래그·휠은 목록이 아니라 작성 화면으로 연결한다", () => {
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const screen = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  assert.match(flow, /router.prefetch\("\/journal\/new"\)/);
  assert.match(flow, /onCreateMadi=\{\(\) => \{/);
  assert.match(flow, /new URLSearchParams\(\{ from: "explore" \}\)/);
  assert.match(flow, /router.push\(`\/journal\/new\?\$\{search.toString\(\)\}`\)/);
  assert.doesNotMatch(flow, /router.push\("\/journal\?from=explore"\)/);
  assert.equal(screen.match(/onCreateMadi\(\);/g)?.length, 2);
  assert.doesNotMatch(screen, /<JournalScreen|onJournal/);
});

test("작성 전환 미리보기는 비활성이고 정책 요청을 발생시키지 않는다", () => {
  const screen = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  const editor = readFileSync("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "utf8");
  assert.match(screen, /<TransitionLayer[^>]*aria-hidden="true" inert>/);
  assert.match(screen, /<JournalEditorScreen preview /);
  assert.match(editor, /if \(preview\) return;[\s\S]*?fetchSensitiveJournalPolicy/);
});

test("둘러보기 작성은 방문 장소를 추정하지 않고 저장 후 추천 화면으로 복귀한다", () => {
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const callback = flow.slice(flow.indexOf("onCreateMadi="), flow.indexOf("onAdmin="));
  assert.doesNotMatch(callback, /activePlace|placeId|placeName|return_confirmed/);
  assert.match(callback, /action: "journal_started"/);
  const create = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(create, /const fromExplore = searchParams.get\("from"\) === "explore"/);
  assert.match(create, /if \(fromExplore\) \{\s*returnToJournal\(\);\s*return;/);
  assert.match(create, /onBack=\{returnToJournal\}/);
});
