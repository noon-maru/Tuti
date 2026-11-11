import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { unfiledMadi } from "@/shared/tuti/unfiledMadi";
import { harumadiContent } from "./fixtures/harumadiContent";

test("미담기는 개인·공유 책 전체 연결을 빼고 미확인 목록을 0권으로 간주하지 않는다", () => {
  const { harumadi: book, entries } = harumadiContent();
  const all = [...entries, { ...entries[0], id: "other" }, { ...entries[0], id: "free" }];
  assert.equal(unfiledMadi(all, undefined), null);
  assert.deepEqual(unfiledMadi(all, []), all);
  assert.deepEqual(unfiledMadi(all, [book, { ...book, shared: true, entryIds: ["other"] }])?.map(entry => entry.id), ["free"]);
  assert.equal(all.length, 3);
});

test("기존 마디 담기는 원본 생성 없이 선택 화면을 재사용하고 요청 중 닫기를 막는다", () => {
  const dialog = readFileSync("src/features/tuti/components/MadiCollectionDialog.tsx", "utf8");
  assert.match(dialog, /busy=\{busy\}/);
  assert.match(dialog, /existingEntry onBusyChange=\{setBusy\}/);
  assert.doesNotMatch(dialog, /createJournal|addEntry\(/);
  const list = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.match(list, /library.isSuccess && !library.isFetching/);
  assert.match(list, /collectEntry = allEntries.find/);
  assert.match(list, /onlyUnfiled && unfiled === null/);
});
