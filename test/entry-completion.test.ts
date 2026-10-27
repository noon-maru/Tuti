import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { markLibraryEntryCompleted, readLibraryEntryCompleted } from "@/lib/libraryPreferences";

test("소개를 보기만 한 상태와 메인·둘러보기 도달을 구분하고 계정별로 저장한다", async t => {
  const values = new Map<string, string>();
  t.mock.method(preferencesStorage, "getItem", async (key: string) => values.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { values.set(key, value); });
  values.set("tuti-library-welcome:intro-only", "seen");
  assert.equal(await readLibraryEntryCompleted("intro-only"), false);
  await markLibraryEntryCompleted("reached-home");
  assert.equal(values.get("tuti-entry-completed:reached-home"), "complete");
  assert.equal(await readLibraryEntryCompleted("reached-home"), true);
  assert.equal(await readLibraryEntryCompleted("new-account-after-delete"), false);
});

test("저장된 도달 이력을 복원하고 소개 표시 키가 없어도 다시 안내하지 않는다", async t => {
  t.mock.method(preferencesStorage, "getItem", async (key: string) => key === "tuti-entry-completed:restored-owner" ? "complete" : null);
  assert.equal(await readLibraryEntryCompleted("restored-owner"), true);
  assert.equal(await readLibraryEntryCompleted("restored-owner"), true);
});

test("저장 장애가 나도 이번 실행에서의 도달 사실은 유지한다", async t => {
  t.mock.method(preferencesStorage, "getItem", async () => { throw new Error("storage unavailable"); });
  t.mock.method(preferencesStorage, "setItem", async () => { throw new Error("storage unavailable"); });
  await markLibraryEntryCompleted("memory-owner");
  assert.equal(await readLibraryEntryCompleted("memory-owner"), true);
});

test("재진입 확인 전에는 소개를 그리지 않고 도달 후에는 가이드 주소도 홈으로 보낸다", () => {
  const entry = readFileSync("src/features/tuti/flows/EntryFlow.tsx", "utf8");
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const explore = readFileSync("src/features/tuti/flows/ExploreFlow.tsx", "utf8");
  assert.match(entry, /completion\?\.ownerId === ownerId/);
  assert.match(entry, /entryCompleted \|\| \(Boolean\(entryRecord\)/);
  assert.match(entry, /if \(!hasHydrated \|\| !completionReady \|\| shouldRedirectToMain \|\| legacyExample\) return null/);
  assert.match(entry, /router.replace\("\/explore"\)/);
  assert.match(entry, /router.replace\("\/journal\/new\?from=welcome"\)/);
  assert.doesNotMatch(entry, /router.push\(welcomeGuidePath/);
  assert.doesNotMatch(home, /showWelcome|readLibraryWelcomeSeen|router.replace\("\/entry"\)/);
  assert.match(home, /markLibraryEntryCompleted\(ownerId\)/);
  assert.match(explore, /markLibraryEntryCompleted\(ownerId\)/);
  const create = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(create, /onBack=\{\(\) => router.replace\(harumadiId \? harumadiPath\(harumadiId\) : "\/"\)\}/);
  assert.doesNotMatch(create, /"\/entry"/);
});
