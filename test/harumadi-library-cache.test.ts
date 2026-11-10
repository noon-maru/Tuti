import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { collectHarumadiPages } from "../src/lib/harumadis";
import { harumadiContent } from "./fixtures/harumadiContent";

test("전체 페이지를 끝까지 수집하며 순서·첫 마디 수를 보존하고 중복을 제거한다", async () => {
  const book = harumadiContent().harumadi;
  const calls: Array<string | undefined> = [];
  const result = await collectHarumadiPages(async cursor => {
    calls.push(cursor);
    return cursor ? { harumadis: [book, { ...book, id: "last" }], nextCursor: null } : { harumadis: [book], recordCount: 7, nextCursor: "next" };
  });
  assert.deepEqual(calls, [undefined, "next"]);
  assert.deepEqual(result.pages.flatMap(page => page.harumadis).map(book => book.id), [book.id, "last"]);
  assert.equal(result.pages[0].recordCount, 7);
});
test("중간 실패·반복 커서·취소는 불완전한 전체 목록을 반환하지 않는다", async () => {
  let calls = 0;
  await assert.rejects(collectHarumadiPages(async () => {
    if (++calls === 2) throw Error("연결 실패");
    return { harumadis: [], nextCursor: "next" };
  }), /연결 실패/);
  await assert.rejects(collectHarumadiPages(async () => ({ harumadis: [], nextCursor: "repeat" })), /끝까지/);
  const controller = new AbortController();
  await assert.rejects(collectHarumadiPages(async () => { controller.abort(); return { harumadis: [], nextCursor: "next" }; }, controller.signal), { name: "AbortError" });
});
test("계정별 전체 캐시는 요청을 공유하고 실패 시 이전 전체 결과를 유지한다", async () => {
  const client = new QueryClient();
  const key = ["library-harumadis", "owner", "all"];
  let requests = 0;
  const options = { queryKey: key, staleTime: 30_000, retry: false,
    queryFn: () => collectHarumadiPages(async () => { requests++; return { harumadis: [harumadiContent().harumadi], nextCursor: null }; }) };
  try {
    client.setQueryData(["library-harumadis", "owner"], { pages: [{ harumadis: [], nextCursor: "partial" }] });
    const [a, b] = await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    assert.equal(requests, 1); assert.equal(a, b);
    assert.equal(client.getQueryData(["library-harumadis", "other", "all"]), undefined);
    await client.fetchQuery(options); assert.equal(requests, 1);
    await client.invalidateQueries({ queryKey: ["library-harumadis", "owner"] });
    assert.equal(client.getQueryState(key)?.isInvalidated, true);
    await assert.rejects(client.fetchQuery({ ...options, queryFn: async () => { throw Error("새로고침 실패"); } }));
    assert.deepEqual(client.getQueryData(key), a);
  } finally { client.clear(); }
});
