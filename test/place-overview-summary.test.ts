import assert from "node:assert/strict";
import test from "node:test";
import { createOverviewPreview } from "@/features/tuti/lib/placeOverviewSummary";

test("저장된 장소 요약을 원문 미리보기보다 우선한다", () => {
  assert.equal(
    createOverviewPreview(
      "  오래된 궁궐의 전각과 마당을 천천히 둘러보는 공간입니다.  ",
      "원문 설명",
      "대체 설명",
    ),
    "오래된 궁궐의 전각과 마당을 천천히 둘러보는 공간입니다.",
  );
});

test("저장된 요약이 없으면 원문을 180자 안팎으로 줄인다", () => {
  const overview = `${"가".repeat(100)}. ${"나".repeat(100)}`;

  assert.equal(
    createOverviewPreview(null, overview, "대체 설명"),
    `${"가".repeat(100)}.…`,
  );
});

test("요약과 원문이 모두 없으면 장소 기본 설명을 사용한다", () => {
  assert.equal(createOverviewPreview(null, null, "대체 설명"), "대체 설명");
});
