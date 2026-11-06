import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("공동작성·댓글은 같은 화면 제목과 입력 규칙을 쓰고 댓글 용어를 맞춘다", () => {
  const comments = readFileSync("src/features/tuti/components/HarumadiComments.tsx", "utf8");
  const together = readFileSync("src/features/tuti/components/HarumadiTogetherPanel.tsx", "utf8");
  const togetherView = readFileSync("src/features/tuti/components/HarumadiTogetherView.tsx", "utf8");
  assert.match(comments, /<h1>댓글·답글<\/h1>/);
  assert.doesNotMatch(comments, /이야기 나누기|이야기 남기기/);
  assert.match(comments, /\$\{inputControlStyles\}/);
  assert.match(comments, /border-inline-start: 1px/);
  for (const source of [comments, togetherView]) {
    assert.match(source, /\$\{screenTitleStyles\}/);
    assert.match(source, /\$\{captionStyles\}/);
    assert.match(source, /min-width: 0; overflow-wrap: anywhere/);
  }
  assert.match(comments, /id: crypto.randomUUID\(\)/);
  assert.match(comments, /revision: edit.revision/);
  assert.match(together, /if \(inFlight.current\) return/);
});

test("인라인 장소 검색과 구매 안내는 공통 입력 규칙·요청 취소·관심 계측을 유지한다", () => {
  const places = readFileSync("src/features/tuti/components/JournalPlacePicker.tsx", "utf8");
  const hook = readFileSync("src/features/tuti/hooks/useJournalPlaceSuggestions.ts", "utf8");
  assert.match(places, /role="combobox"/);
  assert.match(places, /aria-activedescendant=/);
  assert.match(places, /\$\{inputControlStyles\}/);
  assert.match(hook, /controller.signal/); assert.match(hook, /controller.abort\(\)/);
  const purchase = readFileSync("src/features/tuti/components/HarumadiPurchaseButton.tsx", "utf8");
  assert.match(purchase, /recordProductInteraction\("harumadi_purchase_clicked", surface, eventId\)/);
  assert.match(purchase, /trackLifecycle\("purchase_viewed"/);
  assert.match(purchase, /trackLifecycle\("purchase_clicked"/);
  assert.match(purchase, /아직 주문하거나 결제할 수는 없어요/);
});
