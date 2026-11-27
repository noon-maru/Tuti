import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicPlaceReturnPath, savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { safeLoginReturn } from "@/lib/loginContinuation";

test("완료된 마디 선택 단계는 새로고침·로그인 복귀에도 ID와 출발지만 보존한다", () => {
  const path = savedMadiSelectionPath("saved-entry", "explore");
  assert.equal(path, "/madi/new?savedEntryId=saved-entry&from=explore");
  const resumed = new URL(path, "https://tuti.test");
  assert.equal(resumed.searchParams.get("savedEntryId"), "saved-entry");
  assert.equal(new URL(safeLoginReturn(path)!, "https://tuti.test").searchParams.get("savedEntryId"), "saved-entry");
  assert.equal(savedMadiSelectionPath("entry", "https://external"), "/madi/new?savedEntryId=entry");
});

test("공유 장소에서 시작한 저장·동의·로그인 경유에도 돌아갈 장소 ID만 보존한다", () => {
  const path = savedMadiSelectionPath("saved", "place", "tourapi-1");
  assert.deepEqual(Object.fromEntries(new URL(safeLoginReturn(path)!, "https://tuti.test").searchParams),
    Object.fromEntries(new URL(path, "https://tuti.test").searchParams));
  const params = new URL(path, "https://tuti.test").searchParams;
  assert.equal(publicPlaceReturnPath(params.get("from"), params.get("placeId")), "/place/tourapi-1");
  assert.equal(publicPlaceReturnPath("place", "//evil.test"), null);
  assert.equal(publicPlaceReturnPath("place", "../settings"), null);
  assert.equal(publicPlaceReturnPath("explore", "tourapi-1"), null);
});

test("선택 단계는 현재 계정의 저장된 원본만 사용하고 생성 API를 다시 실행하지 않는다", () => {
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  const resume = flow.slice(flow.indexOf("function SavedMadiSelection"), flow.indexOf("function JournalComposer"));
  assert.match(resume, /query.entries.some\(entry => entry.id === entryId\)/);
  assert.match(resume, /query.isError/);
  assert.match(resume, /query.refetch\(\)/);
  assert.doesNotMatch(resume, /addEntry|onSave|createJournal/);
  assert.doesNotMatch(resume, /history.length|router.back/);
  assert.match(flow, /if \(!savedAsFirst && !harumadiId && !entry\.savedHarumadi\) router\.replace\(savedMadiSelectionPath/);
});
