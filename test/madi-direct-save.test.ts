import assert from "node:assert/strict";
import test from "node:test";
import { madiCreateHarness } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import type { JournalEntryInput, TutiJournalEntry } from "../src/shared/api/journal";
import { readFileSync } from "node:fs";

const flush = () => new Promise(resolve => setImmediate(resolve));
test("작성 단계에서 미리보기 없이 저장하고 중복 탭은 같은 저장 한 번만 실행한다", async () => {
  let calls = 0, submitted: JournalEntryInput | undefined, finish!: (entry: TutiJournalEntry) => void;
  const screen = madiCreateHarness({ onBack() {}, onCollection() {}, onSave: input => {
    calls++; submitted = input; return new Promise(resolve => { finish = resolve; });
  } });
  assert.equal(screen.control("새로운 마디 남기기").disabled, true);
  screen.change("기억하고 싶은 이야기", "퇴근길의 작은 순간");
  const click = screen.control("새로운 마디 남기기").onClick as () => void;
  click(); click();
  assert.equal(calls, 1); assert.equal(submitted?.content, "퇴근길의 작은 순간");
  assert.equal(screen.control("마디 내용").disabled, true, "저장 응답을 기다리는 동안 새 입력을 덮어 잃지 않게 한다");
  finish(harumadiContent().entries[0]); await flush();
  assert.equal(screen.finished(), 1);
});
test("선택적 미리보기에서 고쳐도 입력을 유지하고 저장 실패 시 초안을 마치지 않는다", async () => {
  const screen = madiCreateHarness({ onBack() {}, onCollection() {}, onSave: async () => { throw Error("연결을 확인해주세요."); } });
  screen.change("기억하고 싶은 이야기", "지우면 안 되는 이야기");
  screen.click("미리보기"); screen.click("조금 더 고치기");
  assert.equal(screen.control("기억하고 싶은 이야기").value, "지우면 안 되는 이야기");
  screen.click("새로운 마디 남기기"); await flush();
  assert.equal(screen.control("기억하고 싶은 이야기").value, "지우면 안 되는 이야기");
  assert.equal(screen.finished(), 0); assert.equal(screen.control("새로운 마디 남기기").disabled, false);
  assert.equal(screen.control("마디 내용").disabled, false);
});

test("첫 마디 완료의 뒤로가기는 저장한 ID의 수정으로, 하단 완료는 책장으로 분리한다", async () => {
  const entry = { ...harumadiContent().entries[0], savedHarumadi: { id: "first-book", title: "첫 하루마디" } };
  let created = 0, collected = 0;
  const edits: string[] = [];
  const props = { firstMadi: true, onBack() {}, onCollection: () => { collected++; }, collectionLabel: "내 책장으로 돌아가기",
    onSave: async () => { created++; return entry; }, onEditSaved: (saved: TutiJournalEntry) => edits.push(saved.id) };
  const screen = madiCreateHarness(props);
  screen.change("기억하고 싶은 이야기", "다시 고칠 첫 이야기"); screen.click("첫 마디 남기기"); await flush();
  props.firstMadi = false; // The account's list now contains the newly saved entry.
  screen.click("남긴 첫 마디 수정");
  assert.deepEqual(edits, [entry.id]); assert.equal(collected, 0); assert.equal(created, 1);
  screen.click("내 책장으로 돌아가기"); assert.equal(collected, 1); assert.equal(created, 1);
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /onEditSaved=\{entry => router.replace\(`\/madi\/edit\?entryId=\$\{encodeURIComponent\(entry.id\)\}&source=detail`\)\}/);
  const edit = readFileSync("src/features/tuti/flows/JournalEditFlow.tsx", "utf8");
  assert.match(edit, /await updateEntry\(entry.id, draft\)/);
});

test("일반 마디와 책 안 연속 작성의 완료 뒤로가기는 기존 복귀 동작을 유지한다", async () => {
  const entry = harumadiContent().entries[0];
  for (const inHarumadi of [false, true]) {
    let collected = 0, edited = 0;
    const screen = madiCreateHarness({ onBack() {}, onCollection: () => { collected++; }, onEditSaved: () => { edited++; },
      inHarumadi, continueInHarumadi: inHarumadi, destination: inHarumadi ? { id: "book", title: "우리 책" } : undefined,
      onSave: async () => entry });
    screen.change("기억하고 싶은 이야기", "기존 작성 동선"); screen.click("새로운 마디 남기기"); await flush();
    screen.click(inHarumadi ? "하루마디로" : "작성 마치기");
    assert.equal(collected, 1); assert.equal(edited, 0);
  }
});
