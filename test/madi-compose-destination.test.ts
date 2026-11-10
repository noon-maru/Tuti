import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { cachedMadiDestination, madiDestinationScopeChanged } from "../src/lib/madiComposeDestination";
import { harumadiContent } from "./fixtures/harumadiContent";
import { madiCreateHarness } from "./fixtures/madiCreateHarness";
import { parseJournalEntryInput } from "../src/server/journal/input";

test("동일 계정·책의 캐시만 읽고 가장 최근 메타데이터를 사용한다", () => {
  const client = new QueryClient();
  const { harumadi: book } = harumadiContent();
  client.setQueryData(["library-harumadis", "owner", "all"], { pages: [{ harumadis: [book] }] }, { updatedAt: 10 });
  assert.equal(cachedMadiDestination(client, "owner", book.id)?.title, book.title);
  assert.equal(cachedMadiDestination(client, "other", book.id), undefined);
  assert.equal(cachedMadiDestination(client, "owner", "missing"), undefined);
  client.setQueryData(["compose-harumadi", "owner", book.id], { ...book, title: "새 이름", shared: true }, { updatedAt: 20 });
  assert.equal(cachedMadiDestination(client, "owner", book.id)?.title, "새 이름");
  assert.equal(madiDestinationScopeChanged({ shared: false }, { shared: true }), true);
  assert.equal(madiDestinationScopeChanged({ shared: true }, { shared: false }), true);
  assert.equal(madiDestinationScopeChanged(undefined, { shared: true }), false);
  assert.equal(madiDestinationScopeChanged({ shared: false }, { shared: false }), false);
  client.clear();
});

test("백그라운드 확인·실패·재시도 동안 입력을 보존하고 확인된 범위에서만 저장한다", async () => {
  let calls = 0;
  const content = harumadiContent();
  const props = { inHarumadi: true, destination: { ...content.harumadi, shared: false }, destinationVerified: false,
    destinationError: false, destinationScopeChanged: false, onBack() {}, onCollection() {},
    onSave: async () => { calls++; return content.entries[0]; } };
  const screen = madiCreateHarness(props);
  screen.change("기억하고 싶은 이야기", "기다리지 않고 작성한 내용");
  assert.equal(screen.control("마디 내용").disabled, false);
  assert.equal(screen.control("새로운 마디 남기기").disabled, true);
  props.destinationError = true;
  assert.equal(screen.control("기억하고 싶은 이야기").value, "기다리지 않고 작성한 내용");
  props.destinationError = false; props.destinationVerified = true;
  assert.equal(screen.control("새로운 마디 남기기").disabled, false);
  props.destinationScopeChanged = true;
  assert.equal(screen.control("새로운 마디 남기기").disabled, true);
  assert.equal(screen.control("기억하고 싶은 이야기").value, "기다리지 않고 작성한 내용");
  props.destinationScopeChanged = false;
  screen.click("새로운 마디 남기기");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
});

test("저장 요청의 예상 공유 범위는 boolean과 대상 책이 있어야 한다", () => {
  const value = { title: "", content: "이야기", placeName: "", image: null, harumadiId: "book", expectedHarumadiShared: false };
  assert.equal(parseJournalEntryInput(value)?.expectedHarumadiShared, false);
  assert.equal(parseJournalEntryInput({ ...value, expectedHarumadiShared: true })?.expectedHarumadiShared, true);
  assert.equal(parseJournalEntryInput({ ...value, expectedHarumadiShared: "false" }), null);
  assert.equal(parseJournalEntryInput({ ...value, harumadiId: undefined }), null);
});
