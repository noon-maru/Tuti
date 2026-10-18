import assert from "node:assert/strict";
import test from "node:test";
import { prepareFirstJournalDraft } from "../src/shared/api/firstJournal";
import { parseJournalEntryInput } from "../src/server/journal/input";

const today = "2026-10-18";
const base = { image: null, content: " 함께라서 좋았던 오후. ", date: today, place: "" };

test("첫 기록은 글만으로도 기존 기록 API에 저장할 수 있다", () => {
  const draft = prepareFirstJournalDraft(base, today);
  assert.ok(draft);
  assert.equal(draft.content, "함께라서 좋았던 오후.");
  assert.equal(draft.visitedAt, "2026-10-18T03:00:00.000Z");
  assert.equal(draft.placeName, "남긴 공간");
  assert.equal(draft.title, "");
  assert.equal(draft.crowd, "미정");
  assert.deepEqual(parseJournalEntryInput(draft), draft);
});

test("사진만으로 시작할 수 있으며 필수 분류·GPS·임의 이야기를 만들지 않는다", () => {
  const draft = prepareFirstJournalDraft({ ...base, image: "data:image/jpeg;base64,example", content: "", place: " 동네 카페 " }, today);
  assert.ok(draft);
  assert.equal(draft.content, "");
  assert.equal(draft.placeId, null);
  assert.equal(draft.placeName, "동네 카페");
  assert.equal("latitude" in draft, false);
  assert.equal("longitude" in draft, false);
});

test("빈 기록·미래 날짜·잘못된 날짜·길이 초과를 저장 전에 막는다", () => {
  for (const input of [
    { ...base, content: " " },
    { ...base, date: "2026-10-19" },
    { ...base, date: "2026-02-30" },
    { ...base, date: "" },
    { ...base, content: "가".repeat(4001) },
    { ...base, place: "가".repeat(121) },
  ]) assert.equal(prepareFirstJournalDraft(input, today), null);
});
