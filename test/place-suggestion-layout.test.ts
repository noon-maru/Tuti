import assert from "node:assert/strict";
import test from "node:test";
import { placeSuggestionGroups, placeSuggestionPosition } from "../src/features/tuti/components/placeSuggestionLayout";

const full = { top: 0, left: 0, right: 390, bottom: 844 };
test("위쪽 추천은 폼 높이를 바꾸지 않고 입력창·PC 목업·키보드 가용 영역 안에 고정된다", () => {
  const anchor = { top: 600, bottom: 654, left: 24, right: 366 };
  assert.deepEqual(placeSuggestionPosition(anchor, full, full, 844), { left: 24, width: 342, bottom: 250, maxHeight: 300 });
  const frame = { top: 50, bottom: 790, left: 300, right: 690 };
  const desktop = { top: 0, bottom: 900, left: 0, right: 1200 };
  assert.deepEqual(placeSuggestionPosition({ ...anchor, left: 324, right: 666 }, frame, desktop, 900),
    { left: 324, width: 342, bottom: 306, maxHeight: 300 });
  // iOS keyboard pans the visual viewport instead of resizing the layout viewport.
  const keyboard = { ...full, top: 170, bottom: 540 };
  const position = placeSuggestionPosition({ ...anchor, top: 410, bottom: 464 }, full, keyboard, 844)!;
  assert.equal(position.maxHeight, 226);
  assert.equal(844 - position.bottom, 404);
  assert.ok(844 - position.bottom - position.maxHeight >= keyboard.top + 8);
  assert.equal(placeSuggestionPosition(anchor, full, keyboard, 844), null);
  assert.equal(placeSuggestionPosition({ ...anchor, top: 40, bottom: 94 }, full, full, 844), null);
});

test("최근 개인 장소는 가장 아래, DOM과 키보드도 시각 순서와 일치한다", () => {
  const recent = { key: "recent", id: null, name: "최근", region: null, source: "history" as const };
  const older = { ...recent, key: "older", name: "이전" };
  const general = { ...recent, key: "general", source: "place" as const };
  const data = { history: [recent, older], places: [general] };
  assert.deepEqual(placeSuggestionGroups(data).flatMap(group => group.rows).map(row => row.key), ["general", "older", "recent"]);
  assert.deepEqual(data.history.map(row => row.key), ["recent", "older"]);
});
