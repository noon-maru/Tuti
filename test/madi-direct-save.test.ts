import assert from "node:assert/strict";
import test from "node:test";
import { madiCreateHarness } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import type { JournalEntryInput, TutiJournalEntry } from "../src/shared/api/journal";

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
