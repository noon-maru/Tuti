import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findMadiControl, madiCreateHarness } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";

const flush = () => new Promise(resolve => setImmediate(resolve));
const entry = harumadiContent().entries[0];
test("같은 책 계속 쓰기는 실제 담은 책을 명시적으로 선택한 후에만 이동한다", async () => {
  const continued: string[] = [];
  const screen = madiCreateHarness({ draftOwnerId: "owner", onBack() {}, onCollection() {},
    onSave: async () => ({ ...entry, savedHarumadi: null }),
    harumadiSelection: { ownerId: "owner", onDone() {} }, onContinueInHarumadi: id => continued.push(id) });
  screen.change("기억하고 싶은 이야기", "한 줄"); screen.click("새로운 마디 남기기"); await flush();
  assert.deepEqual(continued, []);
  const selection = findMadiControl(screen.render(), p => p.entryId === entry.id)!;
  (selection.onNext as (bookId: string) => void)("chosen-book");
  assert.deepEqual(continued, ["chosen-book"]);
});
test("연속 모드만 완료 뒤 다음 작성을 제공하고 매번 요청을 새로 시작한다", async () => {
  let saves = 0, resets = 0, done = 0;
  const screen = madiCreateHarness({ inHarumadi: true, continueInHarumadi: true,
    destination: { id: "book", title: "우리 책", shared: true }, onBack() {}, onCollection: () => { done++; },
    onStartAnother: () => { resets++; }, onSave: async () => { saves++; return { ...entry, id: `entry-${saves}`, savedHarumadi: { id: "book", title: "우리 책" } }; } });
  screen.change("기억하고 싶은 이야기", "같은 내용"); screen.click("새로운 마디 남기기"); await flush();
  assert.equal(done, 0);
  screen.click("이 하루마디에 다음 마디 남기기");
  assert.equal(resets, 1);
  screen.click("사진 없이 글로 시작하기"); screen.change("기억하고 싶은 이야기", "같은 내용");
  screen.click("새로운 마디 남기기"); await flush();
  assert.equal(saves, 2); screen.click("하루마디로 돌아가기"); assert.equal(done, 1);
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /const resetComposition = \(\) => \{ request.current = null; savedEntryId.current = null;/);
  assert.match(flow, /onStartAnother=\{resetComposition\}/);
  assert.match(flow, /&continue=1/);
});
test("일반 책 안 작성은 즉시 복귀하고 자동 생성된 첫 책도 명시적으로만 이어 쓴다", async () => {
  let done = 0, next = "";
  const book = { id: "book", title: "첫 책", shared: false };
  const ordinary = madiCreateHarness({ inHarumadi: true, destination: book, onBack() {}, onCollection: () => { done++; }, onSave: async () => entry });
  ordinary.change("기억하고 싶은 이야기", "내용"); ordinary.click("새로운 마디 남기기"); await flush();
  assert.equal(done, 1);
  const first = madiCreateHarness({ firstMadi: true, onBack() {}, onCollection() {}, onContinueInHarumadi: id => { next = id; },
    onSave: async () => ({ ...entry, savedHarumadi: { id: "actual-book", title: "첫 책" } }) });
  first.change("기억하고 싶은 이야기", "첫 내용"); first.click("첫 마디 남기기"); await flush();
  assert.equal(next, ""); first.click("같은 하루마디에 다음 마디 남기기"); assert.equal(next, "actual-book");
});
