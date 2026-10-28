import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMadiDraftStorage, type MadiDraft } from "@/lib/madiDraft";

const value: MadiDraft = { title: "걷던 하루", content: "함께라서 좋았어", date: "2026-10-28", place: "동네", placeId: null,
  image: "data:image/jpeg;base64,YQ==", originalImage: false, stage: "write" };
function fixture() {
  const values = new Map<string, string>();
  let clock = 1000;
  const storage = createMadiDraftStorage({ getItem: key => values.get(key) ?? null,
    setItem: (key, data) => { values.set(key, data); }, removeItem: key => { values.delete(key); } }, () => clock);
  return { storage, values, advance: () => { clock += 8 * 86400_000; } };
}
test("초안은 계정·작성 대상별로 복원하고 원본이 바뀌거나 7일이 지나면 적용하지 않는다", async () => {
  const { storage, advance } = fixture();
  await storage.save("owner", "new", "new", value, storage.ticket("owner"));
  await storage.save("owner", "entry-a", "original-a", { ...value, image: null, originalImage: true }, storage.ticket("owner"));
  assert.deepEqual(await storage.load("owner", "new", "new"), value);
  assert.equal(await storage.load("other", "new", "new"), null);
  assert.equal(await storage.load("owner", "entry-a", "changed-original"), null);
  await storage.remove("owner", "new");
  assert.equal(await storage.load("owner", "new", "new"), null);
  assert.ok(await storage.load("owner", "entry-a", "original-a"));
  advance(); assert.equal(await storage.load("owner", "entry-a", "original-a"), null);
});
test("로그아웃·계정 전환 후 이전 화면의 늦은 쓰기로 초안이 되살아나지 않는다", async () => {
  const { storage, values } = fixture();
  const previous = storage.ticket("owner");
  const write = storage.save("owner", "new", "new", value, previous);
  const clear = storage.clearOwner("owner");
  await Promise.all([write, clear]);
  await storage.save("owner", "new", "new", value, previous);
  assert.equal(values.size, 0);
  await storage.save("owner", "new", "new", value, storage.ticket("owner"));
  assert.deepEqual(await storage.load("owner", "new", "new"), value);
});
test("서명 URL·손상된 사진과 과도한 크기는 초안으로 저장하지 않는다", async () => {
  const { storage } = fixture();
  for (const image of ["https://tuti.today/private?signature=secret", "data:image/svg+xml;base64,YQ==", "data:image/jpeg;base64," + "a".repeat(4 * 1024 * 1024)]) {
    await assert.rejects(storage.save("owner", "new", "new", { ...value, image }, storage.ticket("owner")));
  }
  assert.equal(await storage.load("owner", "new", "new"), null);
});
test("일반 마디만 임시 저장하고 성공 저장·기기 이탈·계정 정리 경계를 연결한다", () => {
  const hook = readFileSync("src/features/tuti/hooks/useMadiDraft.ts", "utf8");
  assert.match(hook, /privateOnly \|\| !dirty/);
  assert.match(hook, /window.addEventListener\("beforeunload"/);
  assert.match(hook, /window.addEventListener\("pagehide"/);
  assert.match(hook, /stopped.current = true; latest.current = null/);
  const session = readFileSync("src/lib/auth/session.ts", "utf8");
  assert.equal(session.match(/madiDraftStorage.clearOwner\(previousUserId\)/g)?.length, 2);
  for (const file of ["MadiCreateScreen", "JournalEditorScreen"]) {
    const screen = readFileSync(`src/features/tuti/screens/journal/${file}.tsx`, "utf8");
    assert.match(screen, /await localDraft.finish\(\)/);
    assert.match(screen, /localDraft.leave\(onBack\)/);
  }
});
