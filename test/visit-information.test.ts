import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationBadge,
  createVisitInformationFacts,
} from "@/features/tuti/lib/visitInformation";
import type { TourismPlaceDetail } from "@/shared/api/placeDetails";

function detail(
  overrides: Partial<TourismPlaceDetail> = {},
): TourismPlaceDetail {
  return {
    contentId: "place-1",
    contentTypeId: "14",
    overview: null,
    homepage: null,
    phone: null,
    openingHours: "09:00~18:00",
    restDate: "매주 월요일",
    admissionFee: "무료",
    parking: "주차 가능",
    reservation: null,
    usageDuration: "약 1시간",
    experienceGuide: null,
    sections: [],
    images: [],
    syncedAt: "2026-09-09T00:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

test("비용과 운영 정보가 없으면 확인 필요 항목을 명시한다", () => {
  const facts = createVisitInformationFacts(null);

  assert.deepEqual(
    facts.map(({ key, value, needsVerification }) => ({
      key,
      value,
      needsVerification,
    })),
    [
      {
        key: "openingHours",
        value: "운영 시간 정보 없음",
        needsVerification: true,
      },
      {
        key: "restDate",
        value: "휴무일 정보 없음",
        needsVerification: true,
      },
      {
        key: "admissionFee",
        value: "요금 정보 없음",
        needsVerification: true,
      },
    ],
  );
});

test("정보가 많아도 이용 요금과 주차를 생략하지 않는다", () => {
  const facts = createVisitInformationFacts(detail());

  assert.deepEqual(
    facts.map(({ key }) => key),
    ["openingHours", "restDate", "usageDuration", "admissionFee", "parking"],
  );
});

test("확실한 운영 상태만 오늘 운영 또는 오늘 휴무로 표시한다", () => {
  const monday = new Date("2026-09-07T03:00:00.000Z");

  assert.equal(
    createOperationBadge(detail({ restDate: "연중무휴" }), monday),
    "오늘 운영",
  );
  assert.equal(createOperationBadge(detail(), monday), "오늘 휴무");
  assert.equal(
    createOperationBadge(detail(), new Date("2026-09-08T03:00:00.000Z")),
    "오늘 운영 여부 확인 필요",
  );
  assert.equal(
    createOperationBadge(detail({ isStale: true }), monday),
    "운영 정보 확인 필요",
  );
});
