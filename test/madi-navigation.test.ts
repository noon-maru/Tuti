import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("마디 목록·작성·상세·수정은 새 라우트만 제공한다", () => {
  for (const suffix of ["", "/new", "/detail", "/edit"]) {
    assert.equal(existsSync(`src/app/(tuti)/(main)/madi${suffix}/page.tsx`), true);
    assert.equal(existsSync(`src/app/(tuti)/(main)/journal${suffix}/page.tsx`), false);
  }
  const page = readFileSync("src/app/(tuti)/(main)/madi/page.tsx", "utf8");
  assert.match(page, /window.history.length > 1 \? router.back\(\) : router.replace\(backPath\)/);
  assert.match(page, /router.push\("\/madi\/new"\)/);
  assert.match(page, /`\/madi\/detail\?entryId=/);
});

test("나의 마디는 위 스와이프 이탈 없이 셰브론으로 돌아가고 카드 넘기기는 유지한다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.doesNotMatch(screen, /useVerticalSwipeBack|useBrowserHistoryExit|swipeBack|gestureProps|enterFromHistory/);
  assert.match(screen, /<BackButton type="button" aria-label="이전 화면으로" onClick=\{onBack\}/);
  assert.match(screen, /onPointerMove=\{updateStackDrag\}/);
  assert.match(screen, /onWheel=\{scrollStack\}/);
});
