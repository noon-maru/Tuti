import assert from "node:assert/strict";
import test from "node:test";
import { resolveTourApiRegionLabels } from "@/shared/tourism/tourApiRegions";

test("원천 코드와 주소가 충돌하면 실제 주소 지역을 우선한다", () => {
  assert.deepEqual(
    resolveTourApiRegionLabels(
      "52",
      "부산광역시 수영구 광남로 96",
      "52",
    ),
    { sidoName: "부산광역시", sigunguName: "수영구" },
  );
  assert.deepEqual(
    resolveTourApiRegionLabels(
      "44",
      "충청북도 영동군 양산면 누교리",
      "44",
    ),
    { sidoName: "충청북도", sigunguName: "영동군" },
  );
});

test("비정형 시군구 토큰은 첫 행정구역까지만 사용한다", () => {
  assert.deepEqual(
    resolveTourApiRegionLabels(
      "26",
      "부산광역시 해운대구광역시 석대동 26",
      "26",
    ),
    { sidoName: "부산광역시", sigunguName: "해운대구" },
  );
});
