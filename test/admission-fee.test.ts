import assert from "node:assert/strict";
import test from "node:test";
import type { TutiPlace } from "@/lib/recommendations";
import {
  classifyAdmissionFee,
  filterPlacesByAdmissionBudget,
} from "@/server/recommendations/admissionFee";

const sejongArboretumFee = `[개인]
- 성인 5,000원
- 청소년 4,000원
- 어린이 3,000원
[단체 (20인 이상)]
- 성인 4,000원
- 청소년 3,000원
- 어린이 2,000원
※ 무료
- 만 6세 이하 / 65세 이상 / 장애인 / 국가유공자 / 독립유공자 / 참전용사 / 기초수급자 등
※ 자세한 사항은 홈페이지 참조`;

test("국립세종수목원처럼 성인 요금과 일부 면제가 함께 있으면 유료다", () => {
  assert.equal(classifyAdmissionFee(sejongArboretumFee), "paid");
});

test("일반 입장이 명확한 무료 문구만 무료로 확정한다", () => {
  assert.equal(classifyAdmissionFee("입장료 무료"), "confirmed-free");
  assert.equal(
    classifyAdmissionFee("입장료 무료 / 체험 프로그램은 별도 요금"),
    "confirmed-free",
  );
  assert.equal(classifyAdmissionFee("만 6세 이하 무료"), "unknown");
});

test("공연별·시설별 요금과 정보 없음은 알 수 없음으로 유지한다", () => {
  assert.equal(classifyAdmissionFee("공연별 요금 상이"), "unknown");
  assert.equal(classifyAdmissionFee("시설별 이용요금 홈페이지 참조"), "unknown");
  assert.equal(classifyAdmissionFee("정보 없음"), "unknown");
});

test("무료 조건에서는 무료가 확인된 장소만 남긴다", () => {
  const places = [
    createPlace("paid", sejongArboretumFee),
    createPlace("free", "입장료 무료"),
    createPlace("unknown", "공연별 요금 상이"),
  ];

  const filtered = filterPlacesByAdmissionBudget(places, "free");
  assert.deepEqual(
    filtered.map((place) => place.id),
    ["free"],
  );
  assert.equal(filtered[0].admissionFee, "입장료 무료");
  assert.equal(filterPlacesByAdmissionBudget(places, "under_20000"), places);
});

function createPlace(id: string, admissionFee: string): TutiPlace {
  return {
    id,
    name: id,
    phrase: "",
    note: "",
    image: "",
    travelTime: "",
    crowd: "보통",
    today: "",
    fatigue: 0,
    movementLevel: "near",
    moodTags: [],
    admissionFee,
  };
}
