import assert from "node:assert/strict";
import test from "node:test";
import type { KakaoPlaceSearchResult } from "@/server/maps/kakaoMapClient";
import {
  createRailHubDefinition,
  EXPRESS_BUS_HUB_DEFINITIONS,
  findExpressBusHubDefinition,
  isSupportedHighSpeedRailHub,
  normalizeTransportHubName,
  selectKakaoHubCandidate,
} from "@/server/transport/transportHubCatalog";

test("TAGO와 공식 철도역의 표기 차이를 같은 고속철도 허브로 처리한다", () => {
  assert.equal(isSupportedHighSpeedRailHub("여수EXPO"), true);
  assert.equal(isSupportedHighSpeedRailHub("김천(구미)"), true);
  assert.equal(isSupportedHighSpeedRailHub("진부(오대산)"), true);
  assert.equal(isSupportedHighSpeedRailHub("신도림"), false);
});

test("철도역은 지역과 기차역 카테고리가 모두 맞는 결과만 선택한다", () => {
  const definition = createRailHubDefinition("수서", "서울특별시");
  const wrongSubway = place({
    id: "subway",
    name: "수서역 3호선",
    categoryName: "교통,수송 > 지하철,전철 > 수도권3호선",
  });
  const wrongRegion = place({
    id: "other-region",
    name: "수서역",
    address: "경기 수원시 권선구 테스트로 1",
  });
  const closedStation = place({
    id: "closed",
    name: "수서역",
    categoryName: "교통,수송 > 기차,철도 > 기차역 > 폐역",
  });
  const station = place({ id: "rail", name: "수서역" });

  assert.equal(
    selectKakaoHubCandidate(
      definition,
      [wrongSubway, wrongRegion, closedStation, station],
    )?.id,
    "rail",
  );
});

test("TAGO 시도명과 카카오 축약·통합 주소를 같은 지역으로 검증한다", () => {
  const chungbuk = createRailHubDefinition("오송", "충청북도");
  const jeonnam = createRailHubDefinition("나주", "전라남도");

  assert.equal(
    selectKakaoHubCandidate(chungbuk, [
      place({
        id: "osong",
        name: "오송역",
        address: "충북 청주시 흥덕구 오송가락로 123",
      }),
    ])?.id,
    "osong",
  );
  assert.equal(
    selectKakaoHubCandidate(jeonnam, [
      place({
        id: "naju",
        name: "나주역",
        address: "전남광주통합특별시 나주시 나주역길 56",
      }),
    ])?.id,
    "naju",
  );
});

test("버스터미널은 중간 정류소와 다른 지역의 동명 결과를 거부한다", () => {
  const definition = findExpressBusHubDefinition("서울경부");
  assert.ok(definition);

  const busStop = place({
    id: "stop",
    name: "서울경부 버스정류장",
    categoryName: "교통,수송 > 교통시설 > 고속,시외버스정류장",
  });
  const wrongRegion = place({
    id: "wrong-region",
    name: "서울고속버스터미널",
    address: "경남 진주시 남강로 1",
    categoryName: "교통,수송 > 교통시설 > 고속,시외버스터미널",
  });
  const terminal = place({
    id: "terminal",
    name: "서울고속버스터미널(경부)",
    categoryName: "교통,수송 > 교통시설 > 고속,시외버스터미널",
  });

  assert.equal(
    selectKakaoHubCandidate(
      definition,
      [busStop, wrongRegion, terminal],
    )?.id,
    "terminal",
  );
});

test("주요 고속버스터미널 카탈로그에는 중복 TAGO 이름이 없다", () => {
  const names = EXPRESS_BUS_HUB_DEFINITIONS.flatMap((definition) =>
    definition.sourceNames.map(normalizeTransportHubName),
  );
  assert.equal(new Set(names).size, names.length);
});

function place(
  overrides: Partial<KakaoPlaceSearchResult> = {},
): KakaoPlaceSearchResult {
  return {
    id: "place",
    name: "수서역",
    address: "서울 강남구 밤고개로 99",
    categoryName: "교통,수송 > 기차,철도 > 기차역 > KTX,SRT정차역",
    latitude: 37.485496,
    longitude: 127.104371,
    ...overrides,
  };
}
