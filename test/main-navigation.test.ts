import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHarumadiLibrary } from "@/features/tuti/hooks/useHarumadiLibrary";
import styled from "@emotion/styled";
import { BookOpen, Compass, Plus } from "lucide-react";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { MADI_COMPOSE_COPY } from "@/shared/tuti/madiFields";

const read = (path: string) => readFileSync(`src/features/tuti/${path}`, "utf8");

test("공유 목록 상태는 확인된 0개만 첫 마디로 판단하고 다른 계정·미확인은 구분한다", () => {
  function Status({ ownerId }: { ownerId?: string }) {
    const { isFirstMadi } = useHarumadiLibrary(ownerId);
    return createElement("span", null, isFirstMadi ? "첫 마디" : "마디");
  }
  const client = new QueryClient();
  client.setQueryData(["library-harumadis", "empty", "all"], { pages: [{ harumadis: [], nextCursor: null, recordCount: 0 }], pageParams: [undefined] });
  client.setQueryData(["library-harumadis", "existing", "all"], { pages: [{ harumadis: [], nextCursor: null, recordCount: 1 }], pageParams: [undefined] });
  client.setQueryData(["library-harumadis", "unknown-count", "all"], { pages: [{ harumadis: [], nextCursor: null }], pageParams: [undefined] });
  for (const ownerId of ["empty", "existing", "unknown-count", "not-loaded", undefined]) {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Status, { ownerId })));
    assert.equal(html, ownerId === "empty" ? "<span>첫 마디</span>" : "<span>마디</span>");
  }
  client.clear();
});

test("홈과 둘러보기는 같은 하단 바를 사용하고 기존 상단 이동은 제거한다", () => {
  const home = read("flows/LibraryHomeFlow.tsx");
  const explore = read("flows/ExploreFlow.tsx");
  assert.match(home, /<MainNavigation active="harumadi" \/>/);
  assert.match(explore, /<MainNavigation active="explore"/);
  assert.doesNotMatch(home, /<Footer>|<ExploreButton/);
  assert.doesNotMatch(explore, /내 책장으로|<Navigation/);
  assert.match(home, /<MadiShortcut.*>나의 마디/);
  assert.match(read("components/MainNavigation.tsx"), />나들이/);
  assert.doesNotMatch(read("components/MainNavigation.tsx"), />둘러보기/);
  for (const flow of ["JournalCreateFlow", "JournalDetailFlow", "JournalEditFlow", "HarumadiFlow", "AccountFlow"]) {
    assert.doesNotMatch(read(`flows/${flow}.tsx`), /MainNavigation/);
  }
  assert.doesNotMatch(read("screens/journal/JournalScreen.tsx"), /MainNavigation/);
});

test("바 크기와 고정 메뉴 이름은 부모 화면이 아닌 공통 컴포넌트에서 관리한다", () => {
  const navigation = read("components/MainNavigation.tsx");
  const home = read("flows/LibraryHomeFlow.tsx"), explore = read("flows/ExploreFlow.tsx");
  for (const source of [home, explore]) assert.doesNotMatch(source, /--main-navigation-(?:label-size|create-size|item-height|create-height|icon-size)|<MainNavigation[^>]*firstMadi/);
  for (const declaration of ["label-size: 12px", "create-size: 14px", "item-height: 56px", "create-height: 52px", "icon-size: 24px"]) assert.ok(navigation.includes(`--main-navigation-${declaration}`));
  assert.match(navigation, /useHarumadiLibrary\(ownerId\)/);
  assert.match(home, /useHarumadiLibrary\(ownerId\)/);
  assert.match(navigation, />마디 남기기/);
  assert.doesNotMatch(navigation, /첫 마디 남기기|MADI_COMPOSE_COPY.globalAction/);
  assert.match(navigation, /minmax\(max-content, 1.65fr\)/);
  const query = read("hooks/useHarumadiLibrary.ts");
  assert.match(query, /queryKey: \["library-harumadis", ownerId, "all"\]/);
  assert.match(query, /enabled: Boolean\(ownerId\)/);
  assert.match(query, /query.isSuccess && query.data\?\.pages\[0\]\?\.recordCount === 0/);
  assert.doesNotMatch(query, /fetchJournalEntries|fetchRecommendations/);
});

test("나들이는 다음 마디로 남길 경험을 발견하는 화면으로 안내하고 진입·복귀 이름을 맞춘다", () => {
  const recommendations = read("screens/recommendations/RecommendationsScreen.tsx");
  assert.match(recommendations, /answers\.petCompanion === "none" \? "다음 마디가 될 나들이" : "반려견과 함께할 나들이"/);
  assert.match(recommendations, /함께 보낼 다음 하루를 찾아보세요\./);
  assert.match(read("screens/onboarding/WelcomeScreen.tsx"), /나들이 찾아보기/);
  assert.match(read("screens/intake/IntakeScreen.tsx"), /기록 불러오기/);
  assert.match(read("flows/JournalCreateFlow.tsx"), /나들이로 돌아가기/);
  assert.match(read("data/intakeSteps.ts"), /이번 나들이/);
  for (const file of ["screens/intake/IntakeScreen.tsx", "screens/intake/DailyCheckInScreen.tsx"]) assert.match(read(file), /질문 없이 나들이 찾기/);
  assert.match(read("components/LocationConsentSheet.tsx"), /위치 없이 나들이 찾기/);
});

test("실제 하단 바는 첫 작성·기존 사용자와 두 화면 모두 책장·마디 남기기·나들이로 고정 렌더링한다", () => {
  for (const isFirstMadi of [true, false]) {
    for (const active of ["harumadi", "explore"]) {
      const flow = clientFlowHarness("src/features/tuti/components/MainNavigation.tsx", "MainNavigation", {
        "@emotion/styled": styled,
        "lucide-react": { BookOpen, Compass, Plus },
        "next/navigation": { useRouter: () => ({ push() {}, replace() {} }) },
        "@/features/tuti/components/buttons": { BaseButton: "button" },
        "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
        "@/features/tuti/hooks/useHarumadiLibrary": { useHarumadiLibrary: () => ({ isFirstMadi }) },
        "@/shared/tuti/madiFields": { MADI_COMPOSE_COPY },
      });
      const html = renderToStaticMarkup(flow.render({ active }));
      const labels = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));
      assert.deepEqual(labels, ["책장", "마디 남기기", "나들이"]);
      assert.equal((html.match(/<button\b[^>]*aria-current="page"/g) ?? []).length, 1);
      assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 3);
      flow.dispose();
    }
  }
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
