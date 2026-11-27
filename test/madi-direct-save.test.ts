import assert from "node:assert/strict";
import test from "node:test";
import { findMadiControl, madiCreateHarness } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import type { JournalEntryInput, TutiJournalEntry } from "../src/shared/api/journal";
import { readFileSync } from "node:fs";
import { FIRST_MADI_HANDOFF_MS, FIRST_MADI_PLACEMENT_MS, FIRST_MADI_REDUCED_HANDOFF_MS } from "../src/features/tuti/lib/firstMadiPlacementMotion";

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
    onSaved: () => { savedEvents++; }, onOpenSaved: (saved: TutiJournalEntry) => { opened = saved; }, onRenameFirstHarumadi: (book: { id: string }) => { renamed = book.id; },
    onContinueInHarumadi() {},
    onSave: async (input: JournalEntryInput, existing?: TutiJournalEntry) => {
      if (!existing) { created++; return entry; }
      updated++; edits.push({ input, id: existing.id });
      return { ...entry, ...input, savedHarumadi: undefined };
    } };
  let renamed = "";
  const screen = madiCreateHarness(props);
  screen.change("마디 제목 (선택)", "그대로 남겨둘 제목");
  screen.change("기억하고 싶은 이야기", "다시 고칠 첫 이야기"); screen.click("첫 마디 남기기"); await flush();
  const placement = () => findMadiControl(screen.render(), p => Object.hasOwn(p, "data-first-madi-placement"));
  assert.equal(placement()?.["data-placement-motion"], "assemble", "첫 저장 결과에 담긴 책이 있을 때만 지면을 움직인다");
  assert.equal(findMadiControl(screen.render(), p => Object.hasOwn(p, "data-placement-binding")), undefined, "하단 안내가 먼저 나오고 책은 아직 보이지 않는다");
  const guidance = () => findMadiControl(screen.render(), p => Object.hasOwn(p, "data-placement-guidance"));
  assert.equal(guidance()?.children, "기록을 한데 모아 볼 수 있도록 도와드릴게요.");
  assert.equal(screen.control("내 책장으로 돌아가기"), undefined);
  assert.equal(screen.control("하루마디 보기"), undefined);
  assert.ok(findMadiControl(screen.render(), p => p.firstSaved === true && p.compact === false), "첫 마디는 크게 보여준다");
  props.firstMadi = false; // The account's list now contains the newly saved entry.
  screen.click("이전으로");
  screen.advanceTime();
  assert.equal(screen.control("기억하고 싶은 이야기").value, "다시 고칠 첫 이야기");
  assert.equal(screen.control("마디 제목 (선택)").value, "그대로 남겨둘 제목");
  assert.equal(collected, 0); assert.equal(created, 1);
  screen.change("기억하고 싶은 이야기", "수정한 첫 이야기"); screen.click("변경사항 저장"); await flush();
  assert.equal(edits[0].id, entry.id); assert.equal(edits[0].input.expectedVersion, entry.version);
  assert.equal(edits[0].input.petIds?.length, 0);
  assert.equal(updated, 1); assert.equal(savedEvents, 1, "수정은 생성 후속 동작을 재실행하지 않는다");
  assert.ok(placement(), "재저장 후에도 책에 담긴 결과를 보여준다");
  assert.equal(placement()?.["data-placement-motion"], "assemble", "첫 마디 변경사항을 저장할 때도 수정된 지면을 다시 구성한다");
  assert.equal(screen.control("이름 바꾸기"), undefined);
  screen.advanceTime(FIRST_MADI_HANDOFF_MS - 1);
  assert.equal(placement()?.["data-placement-motion"], "assemble", "안내가 나타나면서 완성된 마디가 그대로 남아 있다");
  screen.advanceTime(1);
  assert.equal(placement()?.["data-placement-motion"], "book");
  assert.ok(findMadiControl(screen.render(), p => p.firstSaved === true && p.compact === true));
  assert.ok(guidance(), "책 전환이 시작되어도 안내가 남아 페이드아웃할 수 있다");
  const headingCopy = () => findMadiControl(screen.render(), p => p.id === "madi-create-heading")?.children;
  assert.equal(headingCopy(), "첫 마디를 남겼어요.");
  screen.advanceTime(FIRST_MADI_PLACEMENT_MS - 1);
  assert.equal(screen.control("이름 바꾸기"), undefined);
  assert.equal(screen.control("방금 남긴 쪽 보기"), undefined);
  assert.equal(screen.control("내 책장으로 돌아가기"), undefined);
  screen.advanceTime(1);
  assert.equal(headingCopy(), "첫 마디가 담겼어요.");
  assert.ok(screen.control("내 책장으로 돌아가기"));
  assert.equal(guidance(), undefined);
  screen.click("이름 바꾸기"); assert.equal(renamed, "first-book");
  assert.ok(screen.control("같은 하루마디에 다음 마디 남기기"));
  screen.click("방금 남긴 쪽 보기");
  assert.equal(opened?.savedHarumadi?.id, "first-book", "다듬은 후에도 처음 담긴 책을 연다");
  screen.click("첫 마디로 돌아가기");
  assert.equal(placement()?.["data-placement-motion"], undefined, "하루마디에서 돌아갈 때는 이미 완성된 마디를 그대로 보여준다");
  screen.advanceTime();
  assert.equal(placement()?.["data-placement-motion"], undefined, "뒤로 왔을 때 책으로 자동 전환하지 않는다");
  screen.click("내 책장으로 돌아가기"); assert.equal(collected, 1); assert.equal(created, 1);
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.doesNotMatch(flow, /onEditSaved|\/madi\/edit/);
  assert.match(flow, /if \(existing\) return updateEntry\(existing.id, draft\)/);
});

test("동작 줄이기에서는 안내를 읽을 짧은 여유만 두고 책을 보여준다", async () => {
  const entry = { ...harumadiContent().entries[0], savedHarumadi: { id: "first-book", title: "첫 하루마디" } };
  const screen = madiCreateHarness({ firstMadi: true, onBack() {}, onCollection() {}, onSave: async () => entry }, "write", {}, true);
  screen.change("기억하고 싶은 이야기", "첫 이야기");
  screen.click("첫 마디 남기기");
  await flush();
  const phase = () => findMadiControl(screen.render(), p => Object.hasOwn(p, "data-first-madi-placement"))?.["data-placement-motion"];
  assert.ok(FIRST_MADI_REDUCED_HANDOFF_MS < FIRST_MADI_HANDOFF_MS);
  screen.advanceTime(FIRST_MADI_REDUCED_HANDOFF_MS - 1);
  assert.equal(phase(), "assemble");
  screen.advanceTime(1);
  assert.equal(phase(), "book");
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
  assert.equal(findMadiControl(screen.render(), p => Object.hasOwn(p, "data-first-madi-placement")), undefined);
  screen.click("방금 남긴 마디 보기"); screen.click("하루마디에 담기");
  assert.deepEqual(actions, [`open:${entry.id}`, `choose:${entry.id}`]);
});

test("후속 마디는 책에 연결되어도 첫 저장 연출을 반복하지 않는다", async () => {
  const entry = { ...harumadiContent().entries[0], savedHarumadi: { id: "book", title: "우리 책" } };
  const screen = madiCreateHarness({ onBack() {}, onCollection() {}, onSave: async () => entry });
  screen.change("기억하고 싶은 이야기", "다음으로 남긴 순간");
  screen.click("새로운 마디 남기기"); await flush();
  assert.equal(findMadiControl(screen.render(), p => Object.hasOwn(p, "data-first-madi-placement")), undefined);
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
  const pet = { id: "pet-a", name: "몽실이", species: "dog", weightKg: null, hasPhoto: true, revision: 2 };
  let creates = 0, fails = true;
  const updates: JournalEntryInput[] = [];
  const screen = madiCreateHarness({ firstMadi: true, draftOwnerId: "owner", onBack() {}, onCollection() {},
    onSave: async (input, existing) => {
      if (!existing) { creates++; return entry; }
      assert.equal(existing.id, entry.id); updates.push(input);
      if (fails) throw Error("연결을 확인해주세요.");
      return entry;
    } }, "photo", { "@/features/tuti/hooks/usePetProfiles": { usePetProfiles: () => ({ data: { pets: [pet] } }) } });
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
  const composedPage = findMadiControl(screen.render(), props => props.firstSaved === true);
  const placementPets = composedPage?.pets as typeof pet[];
  assert.equal(placementPets?.length, 1);
  assert.deepEqual(placementPets[0], pet, "저장 응답에 반려동물 정보가 없으면 선택한 프로필의 이름과 사진 정보를 사용한다");
  assert.equal(composedPage?.ownerId, "owner");
  assert.equal(composedPage?.content, entry.content);
  assert.equal(composedPage?.place, entry.placeName);
  assert.equal(composedPage?.image, "data:image/jpeg;base64,synthetic", "이미 표시된 사진으로 연출을 시작해 재다운로드를 기다리지 않는다");
});
