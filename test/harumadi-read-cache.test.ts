import assert from "node:assert/strict";
import test from "node:test";
import { createHarumadiReadCache, HARUMADI_CACHE_TTL, type ReadCacheStorage } from "@/lib/harumadiReadCache";
import { harumadiContent } from "./fixtures/harumadiContent";

function fixture() {
  const files = new Map<string, string>(), blocked = new Set<string>();
  let clock = 100_000, failClear = false;
  const storage: ReadCacheStorage = {
    read: async (owner, file) => { const value = files.get(`${owner}/${file}`); if (!value) throw Error("not found"); return value; },
    write: async (owner, file, data) => { files.set(`${owner}/${file}`, data); },
    remove: async (owner, file) => { files.delete(`${owner}/${file}`); },
    clear: async owner => { if (failClear) throw Error("disk unavailable"); for (const key of files.keys()) if (key.startsWith(`${owner}/`)) files.delete(key); },
    blocked: async owner => blocked.has(owner), block: async (owner, value) => { if (value) blocked.add(owner); else blocked.delete(owner); },
  };
  return { files, blocked, storage, cache: createHarumadiReadCache(storage, () => clock), advance: (amount: number) => { clock += amount; }, fail: (value: boolean) => { failClear = value; } };
}

test("일반 마디만 계정·로그인 세션별 저장하고 서명 URL·토큰은 남기지 않는다", async () => {
  const { cache, files } = fixture(); const content = harumadiContent();
  content.entries[0].image = "/api/journal-entry-images/entry-a?signature=private-signature";
  await cache.put("owner-a", "book-a", "binding-hash", content);
  const read = await cache.get("owner-a", "book-a", "binding-hash");
  assert.equal(read?.content.entries[0].content, content.entries[0].content);
  assert.equal(read?.content.entries[0].image, null); assert.equal(read?.missingImages, 1);
  assert.doesNotMatch(files.get("owner-a/book-a.json")!, /private-signature|accessToken|signature=/);
  assert.equal(await cache.get("owner-b", "book-a", "binding-hash"), null);
  assert.equal(await cache.get("owner-a", "book-a", "different-session"), null);
});

test("민감정보·분류 미확정·철회 데이터와 손상된 캐시는 표시하지 않는다", async () => {
  for (const sensitiveContent of [true, null, undefined]) {
    const { cache, files } = fixture(); const content = harumadiContent(); content.entries[0].sensitiveContent = sensitiveContent;
    await cache.put("owner", "book-a", "binding", content); assert.equal(files.size, 0);
  }
  const { cache, files } = fixture(); await cache.put("owner", "book-a", "binding", harumadiContent());
  files.set("owner/book-a.json", "not-json"); assert.equal(await cache.get("owner", "book-a", "binding"), null);
  assert.equal(files.has("owner/book-a.json"), false);
});

test("7일 유효기간과 최근 5권 제한을 적용하고 작은 사진만 보관한다", async () => {
  const { cache, files, advance } = fixture();
  for (let i = 0; i < 6; i++) { await cache.put("owner", `book-${i}`, "binding", harumadiContent(`book-${i}`)); advance(1); }
  assert.equal(await cache.get("owner", "book-0", "binding"), null);
  assert.equal(files.has("owner/book-0.json"), false);
  const content = harumadiContent("book-5"); content.entries[0].image = "/api/image";
  await cache.put("owner", "book-5", "binding", content, { "entry-a": "data:image/jpeg;base64,YQ==" });
  assert.equal((await cache.get("owner", "book-5", "binding"))?.content.entries[0].image, "data:image/jpeg;base64,YQ==");
  advance(HARUMADI_CACHE_TTL + 1); assert.equal(await cache.get("owner", "book-5", "binding"), null);
});

test("삭제·철회·로그아웃 전 시작된 저장은 지운 캐시를 다시 만들지 못한다", async () => {
  const { cache } = fixture(); const content = harumadiContent();
  const old = cache.ticket("owner", "book-a"); await cache.clearOwner("owner");
  await cache.put("owner", "book-a", "binding", content, {}, old);
  assert.equal(await cache.get("owner", "book-a", "binding"), null);
  const previous = cache.ticket("owner", "book-a"); await cache.clearBook("owner", "book-a");
  await cache.put("owner", "book-a", "binding", content, {}, previous);
  assert.equal(await cache.get("owner", "book-a", "binding"), null);
  await cache.put("other-owner", "book-a", "binding", content);
  assert.ok(await cache.get("other-owner", "book-a", "binding"));
});

test("삭제와 진행 중인 파일 쓰기가 겹쳐도 삭제가 최종 상태다", async () => {
  const state = fixture(); let release!: () => void; let started!: () => void;
  const writing = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = state.storage.write;
  state.storage.write = async (...args) => { if (args[1] === "book-a.json") { started(); await gate; } await original(...args); };
  const saving = state.cache.put("owner", "book-a", "binding", harumadiContent());
  await writing; const clearing = state.cache.clearOwner("owner"); release(); await Promise.all([saving, clearing]);
  assert.equal(await state.cache.get("owner", "book-a", "binding"), null);
});

test("파일 삭제 실패 시 영속 차단을 남겨 재사용하지 않고 복구 후에만 해제한다", async () => {
  const state = fixture(); await state.cache.put("owner", "book-a", "binding", harumadiContent());
  state.fail(true); await assert.rejects(state.cache.clearOwner("owner"));
  assert.equal(state.blocked.has("owner"), true); assert.equal(await state.cache.get("owner", "book-a", "binding"), null);
  state.fail(false); await state.cache.clearOwner("owner"); assert.equal(state.blocked.has("owner"), false);
});

test("이전 조회의 늦은 사진 저장은 더 최신 본문 스냅샷을 덮지 못한다", async () => {
  const { cache } = fixture(); const old = cache.begin("owner", "book-a");
  const next = cache.begin("owner", "book-a"); const content = harumadiContent(); content.version = "b".repeat(64);
  await cache.put("owner", "book-a", "binding", content, {}, next);
  await cache.put("owner", "book-a", "binding", harumadiContent(), {}, old);
  assert.equal((await cache.get("owner", "book-a", "binding"))?.content.version, content.version);
});
