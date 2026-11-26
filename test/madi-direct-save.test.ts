import assert from "node:assert/strict";
import test from "node:test";
import { findMadiControl, madiCreateHarness } from "./fixtures/madiCreateHarness";
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

test("첫 마디 완료의 뒤로가기는 입력한 이전 단계로 돌아가고 재저장은 같은 ID·버전으로 수정한다", async () => {
  const entry = { ...harumadiContent().entries[0], version: "2026-11-19T00:00:00.000Z", savedHarumadi: { id: "first-book", title: "첫 하루마디" } };
  let created = 0, updated = 0, collected = 0, savedEvents = 0, opened: TutiJournalEntry | undefined;
  const edits: Array<{ input: JournalEntryInput; id: string }> = [];
  const props = { firstMadi: true, onBack() {}, onCollection: () => { collected++; }, collectionLabel: "내 책장으로 돌아가기",
    onSaved: () => { savedEvents++; }, onOpenSaved: (saved: TutiJournalEntry) => { opened = saved; },
    onContinueInHarumadi() {},
    onSave: async (input: JournalEntryInput, existing?: TutiJournalEntry) => {
      if (!existing) { created++; return entry; }
      updated++; edits.push({ input, id: existing.id });
      return { ...entry, ...input, savedHarumadi: undefined };
    } };
  const screen = madiCreateHarness(props);
  screen.change("마디 제목 (선택)", "그대로 남겨둘 제목");
  screen.change("기억하고 싶은 이야기", "다시 고칠 첫 이야기"); screen.click("첫 마디 남기기"); await flush();
  props.firstMadi = false; // The account's list now contains the newly saved entry.
  screen.click("이전으로");
  assert.equal(screen.control("기억하고 싶은 이야기").value, "다시 고칠 첫 이야기");
  assert.equal(screen.control("마디 제목 (선택)").value, "그대로 남겨둘 제목");
  assert.equal(collected, 0); assert.equal(created, 1);
  screen.change("기억하고 싶은 이야기", "수정한 첫 이야기"); screen.click("변경사항 저장"); await flush();
  assert.equal(edits[0].id, entry.id); assert.equal(edits[0].input.expectedVersion, entry.version);
  assert.equal(edits[0].input.petIds?.length, 0);
  assert.equal(updated, 1); assert.equal(savedEvents, 1, "수정은 생성 후속 동작을 재실행하지 않는다");
  assert.ok(screen.control("같은 하루마디에 다음 마디 남기기"));
  screen.click("방금 남긴 쪽 보기");
  assert.equal(opened?.savedHarumadi?.id, "first-book", "다듬은 후에도 처음 담긴 책을 연다");
  screen.click("내 책장으로 돌아가기"); assert.equal(collected, 1); assert.equal(created, 1);
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.doesNotMatch(flow, /onEditSaved|\/madi\/edit/);
  assert.match(flow, /if \(existing\) return updateEntry\(existing.id, draft\)/);
});

test("아직 책에 담기지 않은 첫 마디는 바로 읽거나 담을 책을 선택할 수 있다", async () => {
  const entry = harumadiContent().entries[0];
  const actions: string[] = [];
  const screen = madiCreateHarness({ firstMadi: true, onBack() {}, onCollection() {},
    harumadiSelection: { ownerId: "owner", onDone() {} }, onSave: async () => entry,
    onOpenSaved: madi => actions.push(`open:${madi.id}`), onSelectHarumadi: madi => actions.push(`choose:${madi.id}`),
  });
  screen.change("기억하고 싶은 이야기", "집에서 보낸 첫 하루");
  screen.click("첫 마디 남기기"); await flush();
  screen.click("방금 남긴 마디 보기"); screen.click("하루마디에 담기");
  assert.deepEqual(actions, [`open:${entry.id}`, `choose:${entry.id}`]);
});

test("일반 마디와 책 안 연속 작성의 완료 뒤로가기는 기존 복귀 동작을 유지한다", async () => {
  const entry = harumadiContent().entries[0];
  for (const inHarumadi of [false, true]) {
    let collected = 0;
    const screen = madiCreateHarness({ onBack() {}, onCollection: () => { collected++; },
      inHarumadi, continueInHarumadi: inHarumadi, destination: inHarumadi ? { id: "book", title: "우리 책" } : undefined,
      onSave: async () => entry });
    screen.change("기억하고 싶은 이야기", "기존 작성 동선"); screen.click("새로운 마디 남기기"); await flush();
    screen.click(inHarumadi ? "하루마디로" : "작성 마치기");
    assert.equal(collected, 1);
  }
});

test("완료 전 미리보기·사진·반려동물 선택을 복원하고 수정 실패에도 입력과 ID를 유지한다", async () => {
  const entry = { ...harumadiContent().entries[0], image: "/api/journal-entry-images/entry-a?signature=test", version: "2026-11-19T00:00:00.000Z", savedHarumadi: { id: "first-book", title: "첫 책" } };
  let creates = 0, fails = true;
  const updates: JournalEntryInput[] = [];
  const screen = madiCreateHarness({ firstMadi: true, onBack() {}, onCollection() {},
    onSave: async (input, existing) => {
      if (!existing) { creates++; return entry; }
      assert.equal(existing.id, entry.id); updates.push(input);
      if (fails) throw Error("연결을 확인해주세요.");
      return entry;
    } }, "photo");
  await (screen.control("앨범 사진 선택").onChange as (event: unknown) => Promise<void>)({ target: { files: [{}], value: "photo" } });
  (findMadiControl(screen.render(), p => typeof p.onToggle === "function")!.onToggle as (event: unknown) => void)({ currentTarget: { open: true } });
  (findMadiControl(screen.render(), p => Array.isArray(p.selected))!.onChange as (ids: string[]) => void)(["pet-a"]);
  screen.click("미리보기"); screen.click("이대로 마디 남기기"); await flush();
  screen.click("이전으로");
  assert.ok(screen.control("조금 더 고치기"), "별도 수정 화면이 아니라 저장 직전 미리보기다");
  screen.click("조금 더 고치기");
  assert.equal((findMadiControl(screen.render(), p => Array.isArray(p.selected))!.selected as string[])[0], "pet-a");
  const save = screen.control("변경사항 저장").onClick as () => void;
  save(); save(); await flush();
  assert.equal(updates.length, 1); assert.equal(creates, 1);
  assert.equal(updates[0].image, entry.image, "사진이 같으면 저장된 사진 참조를 재사용한다");
  assert.equal(updates[0].petIds?.[0], "pet-a"); assert.equal(updates[0].expectedVersion, entry.version);
  assert.ok(screen.control("변경사항 저장"));
  fails = false; screen.click("변경사항 저장"); await flush();
  assert.equal(updates.length, 2); assert.equal(creates, 1);
});
