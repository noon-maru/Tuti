import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(`src/features/tuti/${path}`, "utf8");

test("홈과 둘러보기는 같은 하단 바를 사용하고 기존 상단 이동은 제거한다", () => {
  const home = read("flows/LibraryHomeFlow.tsx");
  const explore = read("flows/ExploreFlow.tsx");
  assert.match(home, /<MainNavigation active="harumadi" firstMadi=\{isFirstMadi\}/);
  assert.match(explore, /<MainNavigation active="explore"/);
  assert.doesNotMatch(home, /<Footer>|<ExploreButton/);
  assert.doesNotMatch(explore, /내 책장으로|<Navigation/);
  assert.match(home, /전체 마디 보기/);
  for (const flow of ["JournalCreateFlow", "JournalDetailFlow", "JournalEditFlow", "HarumadiFlow", "AccountFlow"]) {
    assert.doesNotMatch(read(`flows/${flow}.tsx`), /MainNavigation/);
  }
  assert.doesNotMatch(read("screens/journal/JournalScreen.tsx"), /MainNavigation/);
});

test("탭은 선택 상태를 표시하고 히스토리를 교체하며 작성은 별도 행동이다", () => {
  const navigation = read("components/MainNavigation.tsx");
  assert.match(navigation, /aria-label="주요 화면"/);
  assert.equal(navigation.match(/aria-current=\{/g)?.length, 2);
  assert.match(navigation, /active !== "harumadi"\) router.replace\("\/"\)/);
  assert.match(navigation, /active !== "explore"\) router.replace\("\/explore"\)/);
  assert.match(navigation, /router.push\(`\/madi\/new\?from=/);
  assert.match(navigation, /app-safe-area-bottom/);
  assert.match(navigation, /focus-visible/);
  assert.doesNotMatch(navigation, /position: fixed|100vw|useTutiRecommendations|requestLocation/);
});
