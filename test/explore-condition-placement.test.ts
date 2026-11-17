import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("탐색 메인에는 조건 패널·동반 고지를 두지 않고 질문과 상세에서 제공한다", () => {
  const read = (path: string) => readFileSync(`src/features/tuti/${path}`, "utf8");
  assert.doesNotMatch(read("flows/ExploreFlow.tsx"), /DogOutingControls/);
  assert.doesNotMatch(read("screens/recommendations/RecommendationsScreen.tsx"), /DogAccessNotice/);
  assert.match(read("screens/detail/DetailScreen.tsx"), /place\.dogAccess && <Section><DogAccessNotice access=\{place\.dogAccess\}/);
  for (const file of ["screens/intake/IntakeScreen.tsx", "screens/intake/DailyCheckInScreen.tsx"]) {
    assert.match(read(file), /activeStep\.key === "placeCategories" &&.*<DogOutingControls/);
  }
  assert.match(read("flows/RecommendationReadyFlow.tsx"), /enabled: recommendationRequested, dogOuting/);
  assert.match(read("screens/recommendations/RecommendationsScreen.tsx"), /label: "오늘 다시 고르기",\s+onSelect: onRestartIntake/);
});
