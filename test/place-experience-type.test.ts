import assert from "node:assert/strict";
import test from "node:test";
import { assessPlaceExperienceType } from "@/server/recommendations/experienceType";

type AssessmentInput = Parameters<typeof assessPlaceExperienceType>[0];

function assessPlace(
  name: string,
  overrides: Partial<AssessmentInput> = {},
) {
  return assessPlaceExperienceType({
    name,
    phrase: "",
    note: "",
    sourceContentType: "12",
    moodTags: [],
    ...overrides,
  });
}

test("워터파크는 수변 경관이 아니라 체험 활동으로 분류한다", () => {
  const assessment = assessPlace("씨랄라 워터파크", {
    overview: "도심에서 물놀이와 슬라이드를 즐기는 실내 시설이다.",
  });

  assert.equal(assessment.type, "activity");
  assert.equal(assessment.confidence, 95);
  assert.deepEqual(assessment.evidence, ["장소명: 활동 명칭"]);
});

test("지방문화원은 주변 해변 설명에 영향받지 않고 지역 문화 이야기로 분류한다", () => {
  const assessment = assessPlace("제주문화원", {
    overview: "제주 해변공연장 내에서 향토 자료를 수집하고 문화학교를 운영한다.",
  });

  assert.equal(assessment.type, "museum_story");
  assert.deepEqual(assessment.evidence, ["장소명: 문화·박물관 명칭"]);
});

test("감영과 관아는 조망 설명보다 역사 유산 정체성을 우선한다", () => {
  const assessment = assessPlace("원주 강원감영", {
    overview: "조선시대 관찰사가 머물던 관아로 후원 누각의 전망을 볼 수 있다.",
  });

  assert.equal(assessment.type, "history_heritage");
  assert.deepEqual(assessment.evidence, ["장소명: 역사·유산 명칭"]);
});

test("산 지형은 주변 바다 설명보다 전망 정체성을 우선한다", () => {
  const assessment = assessPlace("금련산", {
    overview: "광안리 해변과 바다를 내려다볼 수 있는 해발 415m의 산이다.",
  });

  assert.equal(assessment.type, "viewpoint");
  assert.deepEqual(assessment.evidence, ["장소명: 전망·산 명칭"]);
});

test("레포츠공원은 일반 공원보다 체육 활동 용도를 우선한다", () => {
  const assessment = assessPlace("황령산레포츠공원", {
    overview: "축구장과 테니스장, 배드민턴장을 갖춘 생활체육 시설이다.",
  });

  assert.equal(assessment.type, "activity");
  assert.deepEqual(assessment.evidence, ["장소명: 활동 명칭"]);
});

test("자연 명칭을 포함한 문화 시설은 구체적인 시설 용도를 우선한다", () => {
  assert.equal(
    assessPlace("폭포책방 아름인도서관").type,
    "museum_story",
  );
  assert.equal(assessPlace("조현화랑").type, "art_exhibition");
  assert.equal(assessPlace("치악예술관").type, "art_exhibition");
});

test("역사·문화 시설의 세부 명칭을 경험 유형으로 반영한다", () => {
  assert.equal(assessPlace("인왕산 국사당").type, "history_heritage");
  assert.equal(
    assessPlace("장기려기념 더 나눔센터").type,
    "museum_story",
  );
  assert.equal(
    assessPlace("주정공장수용소 4·3역사관").type,
    "museum_story",
  );
  assert.equal(
    assessPlace("경주 불국사 [유네스코 세계유산]").type,
    "history_heritage",
  );
  assert.equal(
    assessPlace("경주 석굴암 [유네스코 세계유산]").type,
    "history_heritage",
  );
  assert.equal(assessPlace("경주 성덕왕릉").type, "history_heritage");
  assert.equal(
    assessPlace("경주 남산 탑곡 마애불상군").type,
    "history_heritage",
  );
});

test("수변공원과 해수 목욕 시설을 경관 단어만으로 혼동하지 않는다", () => {
  assert.equal(assessPlace("민락수변공원").type, "waterside");
  assert.equal(assessPlace("두물수변공원").type, "waterside");
  assert.equal(assessPlace("중앙해수랜드").type, "wellness");
});

test("하리보 해피월드 전시는 제한된 브랜드 명칭 오버라이드를 사용한다", () => {
  const assessment = assessPlace("하리보 해피월드");

  assert.equal(assessment.type, "art_exhibition");
  assert.equal(assessment.confidence, 100);
  assert.deepEqual(assessment.evidence, ["장소명: 전시 브랜드 명칭"]);
});

test("세부 명칭 확장이 유사한 일반 지명과 시설을 과대 분류하지 않는다", () => {
  assert.equal(assessPlace("인왕산").type, "viewpoint");
  assert.equal(assessPlace("테디베어뮤지엄 군산").type, "museum_story");
  assert.equal(assessPlace("오산리선사유적박물관").type, "museum_story");
  assert.equal(assessPlace("무궁화동산").type, "other");
  assert.equal(assessPlace("화랑대 철도공원").type, "forest_garden");
  assert.equal(assessPlace("제주기념품센터").type, "other");
  assert.equal(assessPlace("중앙랜드").type, "other");
  assert.equal(assessPlace("폭포").type, "waterside");
});

test("전형적인 해수욕장과 공원의 기존 분류를 유지한다", () => {
  assert.equal(assessPlace("을왕리해수욕장").type, "waterside");
  assert.equal(assessPlace("서울숲공원").type, "forest_garden");
});
