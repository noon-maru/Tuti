import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { placeMadiPath } from "@/shared/tuti/placeMadiPath";
import { safeLoginReturn } from "@/lib/loginContinuation";

test("명시적 장소 작성은 장소명·ID만 안전하게 채우고 로그인 후에도 복원한다", () => {
  const path = placeMadiPath({ id: "tourapi-1", name: "양평 유수지 & 생태공원" }, "journey-1");
  const params = new URL(path, "https://tuti.test").searchParams;
  assert.equal(params.get("placeName"), "양평 유수지 & 생태공원");
  assert.equal(params.get("placeId"), "tourapi-1");
  assert.equal(params.get("journeyId"), "journey-1");
  assert.equal(safeLoginReturn(path), path);
  assert.ok(!safeLoginReturn("/madi/new?placeName=x%0Ay")?.includes("placeName"));
  assert.ok(!safeLoginReturn(`/madi/new?placeName=${"x".repeat(101)}`)?.includes("placeName"));
  const detail = readFileSync("src/features/tuti/screens/detail/DetailScreen.tsx", "utf8");
  assert.match(detail, /onCreateMadi && <CreateMadi type="button" onClick=\{onCreateMadi\}/);
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const general = flow.slice(flow.indexOf("onCreateMadi={() =>"), flow.indexOf("onCreatePlaceMadi={"));
  assert.doesNotMatch(general, /placeName|placeMadiPath/);
});
