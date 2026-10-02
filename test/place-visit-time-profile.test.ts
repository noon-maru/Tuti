import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaceVisitTimeSourceFingerprint,
  deriveVisitAccessProfile,
  getDefaultStayDuration,
  resolveStayDuration,
} from "@/server/recommendations/placeVisitTimeProfile";

test("장소 경험 유형별 최소·일반·최대 체류시간 기본값을 제공한다", () => {
  assert.deepEqual(
    getDefaultStayDuration({ experienceType: "forest_garden" }),
    { minimumMinutes: 20, typicalMinutes: 45, maximumMinutes: 90 },
  );
  assert.deepEqual(
    getDefaultStayDuration({ experienceType: "activity" }),
    { minimumMinutes: 60, typicalMinutes: 100, maximumMinutes: 180 },
  );
});

test("주차와 예약 안내를 정적 접근 부담으로 분류한다", () => {
  const profile = deriveVisitAccessProfile({
    name: "숲 체험장",
    experienceType: "activity",
    parking: "인근 공영주차장 이용",
    experienceGuide: "사전 예약 필수, 시작 전 안전교육과 장비 착용",
  });

  assert.equal(profile.parkingAvailability, "nearby");
  assert.equal(profile.reservationRequirement, "required");
  assert.equal(profile.entryProcess, "checkin");
  assert.deepEqual(profile.parkingBuffer, {
    minimumMinutes: 10,
    typicalMinutes: 15,
    maximumMinutes: 25,
  });
  assert.deepEqual(profile.entryBuffer, {
    minimumMinutes: 10,
    typicalMinutes: 20,
    maximumMinutes: 30,
  });
});

test("방문시간 근거가 바뀌면 소스 지문도 바뀐다", () => {
  const original = createPlaceVisitTimeSourceFingerprint({
    name: "작은 박물관",
    usageDuration: "약 1시간",
  });
  const changed = createPlaceVisitTimeSourceFingerprint({
    name: "작은 박물관",
    usageDuration: "약 2시간",
  });

  assert.notEqual(original, changed);
});

test("설명 원문이 바뀌면 접근성 소스 지문도 바뀐다", () => {
  const original = createPlaceVisitTimeSourceFingerprint({
    name: "작은 공원",
    overview: "도심 속 공원",
  });
  const changed = createPlaceVisitTimeSourceFingerprint({
    name: "작은 공원",
    overview: "출입이 제한된 구역",
  });

  assert.notEqual(original, changed);
});

test("도선국사와 선박 전시를 배편 접근으로 오인하지 않는다", () => {
  const profile = deriveVisitAccessProfile({
    name: "해양 박물관",
    overview: "도선국사 이야기와 선박 자료를 전시한다.",
  });

  assert.equal(profile.accessConstraint, "none");
});

test("주차 공간이 없다는 안내를 구내 주차로 오인하지 않는다", () => {
  const profile = deriveVisitAccessProfile({
    name: "작은 전망대",
    parking: "주차 공간 없음",
  });

  assert.equal(profile.parkingAvailability, "none");
  assert.equal(profile.carSuitability, "difficult");
});

test("명시적인 출입 제한은 도보 안내보다 우선한다", () => {
  const profile = deriveVisitAccessProfile({
    name: "탐방로",
    experienceGuide: "등산 탐방로이지만 현재 입산 통제 중",
  });

  assert.equal(profile.accessConstraint, "restricted");
  assert.equal(profile.carSuitability, "difficult");
});

test("과거 출입 제한 뒤 현재 개방된 장소는 제한 상태로 보지 않는다", () => {
  const profile = deriveVisitAccessProfile({
    name: "해안 공원",
    overview: "예전에는 출입이 금지되었으나 1993년에 시민에게 개방되었다.",
  });

  assert.equal(profile.accessConstraint, "none");
});

test("개인 차량 이동이 불가능하다는 안내는 자동차 접근 불가로 분류한다", () => {
  const profile = deriveVisitAccessProfile({
    name: "역사공원",
    overview: "개인차량으로 이동이 불가능하며 반드시 전용 열차를 이용한다.",
  });

  assert.equal(profile.carSuitability, "unavailable");
});

test("기본값 판정은 구조화 결과의 임의 수치 대신 공통표를 사용한다", () => {
  const stay = resolveStayDuration(
    { contentTypeId: "14", experienceType: "art_exhibition" },
    {
      minimumMinutes: 40,
      typicalMinutes: 70,
      maximumMinutes: 100,
      source: "type_default",
      confidence: 50,
      evidence: "일정별 상이",
    },
  );

  assert.deepEqual(stay, {
    minimumMinutes: 30,
    typicalMinutes: 60,
    maximumMinutes: 90,
    source: "type_default",
    confidence: 50,
    evidence: "일정별 상이",
  });
});
