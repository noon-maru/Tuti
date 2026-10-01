import assert from "node:assert/strict";
import test from "node:test";
import { createPlaceOverviewSummaryFingerprint } from "@/server/tourism/placeOverviewSummary";

test("같은 장소 설명은 항상 같은 지문을 만든다", () => {
  const source = {
    contentTypeId: "12",
    overview: "숲길을  천천히\n걸을 수 있어요.",
    experienceGuide: null,
  };

  assert.equal(
    createPlaceOverviewSummaryFingerprint(source),
    createPlaceOverviewSummaryFingerprint(source),
  );
});

test("원문, 공백 형태나 체험 정보가 바뀌면 장소 요약 지문도 바뀐다", () => {
  const source = {
    contentTypeId: "12",
    overview: "숲길을 걸을 수 있어요.",
    experienceGuide: null,
  };

  assert.notEqual(
    createPlaceOverviewSummaryFingerprint(source),
    createPlaceOverviewSummaryFingerprint({
      ...source,
      overview: "숲길과 정원을 함께 걸을 수 있어요.",
    }),
  );
  assert.notEqual(
    createPlaceOverviewSummaryFingerprint(source),
    createPlaceOverviewSummaryFingerprint({
      ...source,
      overview: "숲길을  걸을 수 있어요.",
    }),
  );
  assert.notEqual(
    createPlaceOverviewSummaryFingerprint(source),
    createPlaceOverviewSummaryFingerprint({
      ...source,
      experienceGuide: "해설 프로그램",
    }),
  );
});
