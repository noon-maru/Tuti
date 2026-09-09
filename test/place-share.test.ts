import assert from "node:assert/strict";
import test from "node:test";
import { createPublicPlaceUrl } from "@/features/tuti/lib/placeShare";

test("장소 ID가 포함된 공개 상세 링크를 만든다", () => {
  assert.equal(
    createPublicPlaceUrl("place-123", "https://tuti.today"),
    "https://tuti.today/place/place-123",
  );
  assert.equal(
    createPublicPlaceUrl("place/한글", "https://example.com/api"),
    "https://example.com/place/place%2F%ED%95%9C%EA%B8%80",
  );
});
