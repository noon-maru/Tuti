import assert from "node:assert/strict";
import test from "node:test";
import {
  toPublicPlaceAddress,
  toPublicPlaceName,
  toPublicRegionLabel,
} from "@/server/places/publicPlaceLabels";

test("통합 행정명은 광주 사용자에게 광주로 표시한다", () => {
  assert.equal(
    toPublicPlaceName(
      "전남광주통합특별시산수도서관",
      "전남광주통합특별시",
      "동구",
    ),
    "광주 산수도서관",
  );
  assert.equal(
    toPublicPlaceAddress(
      "전남광주통합특별시 동구 경양로 355",
      "전남광주통합특별시",
      "동구",
    ),
    "광주 동구 경양로 355",
  );
  assert.equal(
    toPublicRegionLabel("전남광주통합특별시", "동구"),
    "광주광역시 동구",
  );
});

test("통합 행정명의 전남 지역은 전남으로 표시한다", () => {
  assert.equal(
    toPublicRegionLabel("전남광주통합특별시", "나주시"),
    "전라남도 나주시",
  );
});
