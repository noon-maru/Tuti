import assert from "node:assert/strict";
import test from "node:test";
import { journalCardPreview } from "../src/shared/tuti/journalCard";

test("글 기록 카드는 제목·본문 일부·중복되지 않는 장소를 표시한다", () => {
  assert.deepEqual(journalCardPreview({ title: " 오후 산책 ", content: " 함께 걷던\n\n길. ", placeName: " 동네 공원 " }), {
    heading: "오후 산책", excerpt: "함께 걷던 길.", place: "동네 공원",
  });
});
test("제목이 없으면 장소를 사용하고 기본 장소명은 실제 장소처럼 표시하지 않는다", () => {
  assert.deepEqual(journalCardPreview({ title: " ", content: "이야기", placeName: "동네 카페" }), {
    heading: "동네 카페", excerpt: "이야기", place: null,
  });
  assert.equal(journalCardPreview({ title: "", content: "이야기", placeName: "남긴 공간" }).heading, "");
  assert.equal(journalCardPreview({ title: "", content: "", placeName: "남긴 공간" }).heading, "남겨둔 이야기");
});
test("긴 본문은 이모지 문자를 쪼개지 않고 요약 표시 길이를 제한한다", () => {
  const preview = journalCardPreview({ title: "제목", content: "🌿".repeat(300), placeName: "제목" });
  assert.equal(Array.from(preview.excerpt).length, 180);
  assert.equal(preview.place, null);
});
