import assert from "node:assert/strict";
import test from "node:test";
import { createDepartureSuggestedPlan } from "@/server/departure/departureSuggestedPlan";
import type { TourismPlaceDetail } from "@/shared/api/placeDetails";

function detail(
  overrides: Partial<TourismPlaceDetail> = {},
): TourismPlaceDetail {
  return {
    contentId: "place-1",
    contentTypeId: "14",
    overview: "작품과 기록을 만나는 전시 공간이에요.",
    overviewSummary: null,
    homepage: null,
    phone: null,
    openingHours: null,
    restDate: null,
    admissionFee: null,
    parking: null,
    reservation: null,
    usageDuration: null,
    experienceGuide: "상설 전시 관람",
    sections: [],
    images: [],
    syncedAt: "2026-10-01T00:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

test("저장된 장소별 행동을 첫 번째 제안에 우선 사용한다", () => {
  const plan = createDepartureSuggestedPlan({
    placeName: "기록미술관",
    contentTypeId: "14",
    suggestedAction: "  대표 작품 한 점 오래 바라보기  ",
    detail: detail(),
  });

  assert.equal(plan[0]?.title, "대표 작품 한 점 오래 바라보기");
  assert.match(plan[0]?.description ?? "", /상설 전시 관람/);
  assert.equal(plan[1]?.title, "마음이 가는 전시나 공간 한 곳부터 보기");
});

test("저장된 행동이 없으면 기존 장소 특성 제안을 유지한다", () => {
  const plan = createDepartureSuggestedPlan({
    placeName: "마을도서관",
    contentTypeId: "12",
    suggestedAction: null,
    detail: null,
  });

  assert.equal(plan[0]?.title, "마음이 가는 책이나 자리에 잠시 머물기");
});
