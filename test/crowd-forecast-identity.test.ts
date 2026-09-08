import assert from "node:assert/strict";
import test from "node:test";
import type { TutiPlace } from "@/lib/recommendations";
import {
  matchTouristSpotContexts,
  type TouristSpotIdentityRecord,
} from "@/server/recommendations/crowdForecastIdentity";

function place(overrides: Partial<TutiPlace>): TutiPlace {
  return {
    id: "place",
    name: "마루공원",
    phrase: "",
    note: "",
    image: "",
    travelTime: "",
    crowd: "보통",
    today: "",
    fatigue: 0,
    movementLevel: "near",
    moodTags: [],
    ...overrides,
  };
}

const records: TouristSpotIdentityRecord[] = [
  {
    touristSpotName: "마루공원",
    areaCode: "11",
    areaName: "서울특별시",
    sigunguCode: "11680",
    sigunguName: "강남구",
    latitude: 37.4908,
    longitude: 127.0807,
  },
  {
    touristSpotName: "마루공원",
    areaCode: "41",
    areaName: "경기도",
    sigunguCode: "41130",
    sigunguName: "성남시",
    latitude: 37.3595,
    longitude: 127.1052,
  },
];

test("동명 관광지는 좌표로 서울과 성남의 서로 다른 혼잡도 문맥에 연결한다", () => {
  const contexts = matchTouristSpotContexts(
    [
      place({
        id: "seoul-maru",
        sourceSidoName: "서울특별시",
        sourceSigunguName: "강남구",
        latitude: 37.4907,
        longitude: 127.0805,
      }),
      place({
        id: "seongnam-maru",
        sourceSidoName: "경기도",
        sourceSigunguName: "성남시",
        latitude: 37.3594,
        longitude: 127.105,
      }),
    ],
    records,
  );

  assert.deepEqual(contexts.get("seoul-maru"), {
    touristSpotName: "마루공원",
    areaCode: "11",
    sigunguCode: "11680",
  });
  assert.deepEqual(contexts.get("seongnam-maru"), {
    touristSpotName: "마루공원",
    areaCode: "41",
    sigunguCode: "41130",
  });
});

test("성남 장소와 가까운 원천이 없으면 서울 동명값을 연결하지 않는다", () => {
  const contexts = matchTouristSpotContexts(
    [
      place({
        id: "seongnam-maru",
        sourceSidoName: "경기도",
        sourceSigunguName: "성남시",
        latitude: 37.3594,
        longitude: 127.105,
      }),
    ],
    [records[0]],
  );

  assert.equal(contexts.has("seongnam-maru"), false);
});

test("좌표가 없을 때는 시도와 시군구가 모두 일치해야 연결한다", () => {
  const contexts = matchTouristSpotContexts(
    [
      place({
        id: "seongnam-maru",
        sourceSidoName: "경기도",
        sourceSigunguName: "성남시",
      }),
      place({
        id: "unknown-maru",
        sourceSidoName: "경기도",
      }),
    ],
    records,
  );

  assert.equal(contexts.get("seongnam-maru")?.sigunguCode, "41130");
  assert.equal(contexts.has("unknown-maru"), false);
});
