import assert from "node:assert/strict";
import test from "node:test";
import { findSimilarVisitedPlaces } from "@/features/tuti/lib/similarVisitedPlaces";
import type { TutiPlace } from "@/lib/recommendations";
import type { TutiJournalEntry } from "@/shared/api/journal";

function place(id: string, moodTags: string[], fatigue = 30): TutiPlace {
  return {
    id,
    name: id,
    phrase: `${id} 소개`,
    note: "",
    image: "",
    travelTime: "",
    crowd: "",
    today: "",
    fatigue,
    movementLevel: "short",
    moodTags,
  };
}

function journal(placeId: string | null, theme: string): TutiJournalEntry {
  return {
    id: `journal-${placeId ?? theme}`,
    title: "기록",
    content: "",
    image: null,
    crowd: "보통",
    placeId,
    placeName: "다녀온 공간",
    theme,
    difficulty: "가벼움",
    visitedAt: "2026-09-09T00:00:00.000Z",
    publicationStatus: "private",
    publication: null,
  };
}

test("기록의 테마와 닮은 오늘 추천을 우선하고 방문·저장 장소는 제외한다", () => {
  const result = findSimilarVisitedPlaces({
    journalEntries: [journal("visited", "걷기 좋은")],
    recommendationPlaces: [
      place("visited", ["walk"]),
      place("saved", ["walk"]),
      place("quiet", ["quiet"]),
      place("walk-heavy", ["walk"], 45),
      place("walk-light", ["walk"], 20),
    ],
    savedPlaceIds: ["saved"],
  });

  assert.deepEqual(
    result.map(({ id }) => id),
    ["walk-light", "walk-heavy"],
  );
});

test("연결할 수 있는 기록 테마가 없으면 억지로 비슷한 공간을 만들지 않는다", () => {
  const result = findSimilarVisitedPlaces({
    journalEntries: [journal(null, "나만의 특별한 하루")],
    recommendationPlaces: [place("quiet", ["quiet"])],
    savedPlaceIds: [],
  });

  assert.deepEqual(result, []);
});
