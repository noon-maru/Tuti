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

function journal(placeId: string | null): TutiJournalEntry {
  return {
    id: `journal-${placeId ?? "freeform"}`,
    title: "기록",
    content: "",
    image: null,
    placeId,
    placeName: "다녀온 공간",
    visitedAt: "2026-09-09T00:00:00.000Z",
    publicationStatus: "private",
    publication: null,
  };
}

test("연결된 방문 장소의 분위기를 참고하고 방문·저장 장소는 제외한다", () => {
  const result = findSimilarVisitedPlaces({
    journalEntries: [journal("visited")],
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

test("장소 연결이 없는 자유 기록에서는 취향을 임의로 추론하지 않는다", () => {
  const result = findSimilarVisitedPlaces({
    journalEntries: [journal(null)],
    recommendationPlaces: [place("quiet", ["quiet"])],
    savedPlaceIds: [],
  });

  assert.deepEqual(result, []);
});
