import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createCachedHarumadiHydrator } from "@/lib/harumadiCachedQuery";
import { HarumadiRequestError } from "@/lib/harumadis";
import { harumadiReadCache } from "@/lib/harumadiReadCache";
import type { HarumadiRead } from "@/lib/harumadiContent";
import { HarumadiSpreadPreview } from "@/features/tuti/components/HarumadiSpreadPreview";
import { harumadiContent } from "./fixtures/harumadiContent";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const owner = "preview-cache-owner", key = ["harumadi-content", owner, "book-a"];
function cachedRead(): HarumadiRead {
  return { content: harumadiContent(), cached: true, savedAt: Date.now() - 1000, missingImages: 0,
    ticket: harumadiReadCache.ticket(owner, "book-a") };
}
function preview(client: QueryClient, shared = false) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiSpreadPreview, {
    ownerId: owner, book: { ...harumadiContent().harumadi, shared },
  })));
}
function fixture(t: { after: (fn: () => void) => void }) {
  const client = new QueryClient(); t.after(() => client.clear());
  let session = { userId: owner, accessToken: "synthetic-session-a" }, current = true, active = true;
  const hydrate = (load: () => Promise<HarumadiRead | null>) => createCachedHarumadiHydrator({
    load, session: () => session, current: () => current,
  })(client, owner, "book-a", () => active);
  return { client, hydrate, changeSession: () => { session = { ...session, accessToken: "synthetic-session-b" }; },
    changeOwner: () => { session = { ...session, userId: "another-owner" }; },
    invalidate: () => { current = false; }, unmount: () => { active = false; } };
}

test("저장된 개인 책은 서버 응답을 기다리지 않고 미리보기를 펼치고 이후 최신 내용으로 갱신한다", async t => {
  const { client, hydrate } = fixture(t), network = deferred<HarumadiRead>();
  const request = client.fetchQuery({ queryKey: key, queryFn: () => network.promise, retry: false });
  assert.match(preview(client), /data-spread-ready="false"/);
  const cached = cachedRead();
  assert.equal(await hydrate(async () => cached), true);
  assert.equal(client.getQueryState(key)?.fetchStatus, "fetching", "캐시 표시가 네트워크 조회를 취소하지 않는다");
  assert.match(preview(client), /data-spread-ready="true"/);
  assert.match(preview(client), /가볍게 걸었던 하루/);
  const latest = cachedRead(); latest.cached = false; latest.content.entries[0].content = "서버에서 바뀐 최신 마디";
  network.resolve(latest); await request;
  assert.match(preview(client), /서버에서 바뀐 최신 마디/);
});

test("캐시 사진을 함께 복원하되 늦은 파일 읽기로 최신 서버 응답을 덮지 않는다", async t => {
  const { client, hydrate } = fixture(t), cached = cachedRead();
  cached.content.entries[0].image = "data:image/jpeg;base64,YQ==";
  assert.equal(await hydrate(async () => cached), true);
  assert.equal(client.getQueryData<HarumadiRead>(key)?.content.entries[0].image, cached.content.entries[0].image);
  client.removeQueries({ queryKey: key });
  const disk = deferred<HarumadiRead | null>(), pending = hydrate(() => disk.promise);
  const latest = cachedRead(); latest.cached = false; latest.content.version = "b".repeat(64);
  client.setQueryData(key, latest);
  disk.resolve(cached);
  assert.equal(await pending, false);
  assert.equal(client.getQueryData<HarumadiRead>(key)?.content.version, latest.content.version);
});

test("조회 거절은 캐시보다 우선하며 파일을 읽는 도중의 거절도 우회하지 않는다", async t => {
  for (const status of [401, 403, 404, 409]) {
    const { client, hydrate } = fixture(t), disk = deferred<HarumadiRead | null>();
    const pending = hydrate(() => disk.promise);
    await assert.rejects(client.fetchQuery({ queryKey: key, queryFn: async () => { throw new HarumadiRequestError("synthetic denial", status); }, retry: false }));
    disk.resolve(cachedRead());
    assert.equal(await pending, false);
    let loads = 0;
    assert.equal(await hydrate(async () => { loads++; return cachedRead(); }), false);
    assert.equal(loads, 0);
  }
});

test("계정·세션 교체와 삭제 무효화 및 선택 해제 뒤에는 늦은 캐시를 주입하지 않는다", async t => {
  for (const stop of ["changeSession", "changeOwner", "invalidate", "unmount"] as const) {
    const f = fixture(t), disk = deferred<HarumadiRead | null>();
    const pending = f.hydrate(() => disk.promise);
    f[stop](); disk.resolve(cachedRead());
    assert.equal(await pending, false);
    assert.equal(f.client.getQueryData(key), undefined);
  }
});

test("공동작성·민감 마디 캐시는 거절하고 현재 공유된 책은 과거 개인 책 캐시도 먼저 노출하지 않는다", async t => {
  const f = fixture(t);
  const shared = cachedRead(); shared.content.harumadi.shared = true;
  assert.equal(await f.hydrate(async () => shared), false);
  const sensitive = cachedRead(); sensitive.content.entries[0].sensitiveContent = true;
  assert.equal(await f.hydrate(async () => sensitive), false);
  f.client.setQueryData(key, cachedRead());
  const html = preview(f.client, true);
  assert.doesNotMatch(html, /가볍게 걸었던 하루/);
  assert.match(html, /data-spread-ready="false"/);
  const component = readFileSync("src/features/tuti/components/HarumadiSpreadPreview.tsx", "utf8");
  assert.match(component, /useCachedHarumadi\(ownerId, book.id, !book.shared\)/);
  assert.match(component, /staleTime: 0, refetchOnMount: "always"/);
  assert.match(readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8"), /useCachedHarumadi\(owner, id\)/);
});
