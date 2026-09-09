import assert from "node:assert/strict";
import test from "node:test";
import { createDestinationGuidanceUrl } from "@/features/tuti/lib/departureDestination";

test("목적지 이름과 좌표만 카카오맵 길찾기 링크에 넣는다", () => {
  const url = createDestinationGuidanceUrl({
    name: "국립현대미술관 서울",
    latitude: 37.5787,
    longitude: 126.9801,
  });

  assert.equal(
    url,
    "https://map.kakao.com/link/to/%EA%B5%AD%EB%A6%BD%ED%98%84%EB%8C%80%EB%AF%B8%EC%88%A0%EA%B4%80%20%EC%84%9C%EC%9A%B8,37.5787,126.9801",
  );
  assert.equal(url?.includes("from"), false);
});

test("목적지 좌표가 없거나 범위를 벗어나면 링크를 만들지 않는다", () => {
  assert.equal(
    createDestinationGuidanceUrl({
      name: "좌표 미확인 장소",
      latitude: undefined,
      longitude: undefined,
    }),
    null,
  );
  assert.equal(
    createDestinationGuidanceUrl({
      name: "잘못된 좌표",
      latitude: 91,
      longitude: 127,
    }),
    null,
  );
});
