import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlaceDisplayPhrase,
  getPlaceReasonHeadline,
} from "@/features/tuti/lib/placeDisplayCopy";

test("카드용 문구를 사용자 화면의 대표 소개로 가장 먼저 사용한다", () => {
  const place = {
    phrase: "잠깐 다른 공기를 만나기 좋은 곳",
    cardPhrase: "나무 그늘을 따라 마음의 속도를 늦추는 시간",
    reason: "지금 위치에서 부담 없이 닿을 수 있어요.",
    experienceType: "forest_garden" as const,
  };

  assert.equal(
    getPlaceDisplayPhrase(place),
    "나무 그늘을 따라 마음의 속도를 늦추는 시간",
  );
  assert.equal(
    getPlaceReasonHeadline(place),
    "지금 위치에서 부담 없이 닿을 수 있어요.",
  );
});

test("카드 문구가 없으면 추천 이유와 편집 문구를 차례로 사용한다", () => {
  assert.equal(
    getPlaceDisplayPhrase({
      phrase: "장소가 가진 고유한 이야기",
      reason: "오늘의 여유 안에서 천천히 다녀올 수 있어요.",
    }),
    "오늘의 여유 안에서 천천히 다녀올 수 있어요.",
  );
  assert.equal(
    getPlaceDisplayPhrase({ phrase: "장소가 가진 고유한 이야기" }),
    "장소가 가진 고유한 이야기",
  );
});

test("원천 데이터의 공통 문구는 경험 유형에 맞는 문구로 바꾼다", () => {
  assert.equal(
    getPlaceDisplayPhrase({
      phrase: "천천히 둘러보며 다른 감각을 만나는 곳",
      experienceType: "art_exhibition",
    }),
    "낯선 장면 앞에서 생각의 방향을 바꾸는 시간",
  );
});

test("이전 버전에 저장된 공통 문구도 그대로 다시 노출하지 않는다", () => {
  assert.equal(
    getPlaceDisplayPhrase({ phrase: "잠깐 다른 공기를 만나기 좋은 곳" }),
    "익숙한 하루에서 잠깐 벗어나 보는 시간",
  );
});
