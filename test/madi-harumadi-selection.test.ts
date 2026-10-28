import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MadiHarumadiSelection } from "@/features/tuti/screens/journal/MadiHarumadiSelection";
import { addMadiToHarumadi } from "@/lib/addMadiToHarumadi";
import { ensureSession } from "@/lib/auth/session";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { harumadiReadCache } from "@/lib/harumadiReadCache";
import { HARUMADI_PDF_MAX_ENTRIES } from "@/shared/api/harumadiPdf";
import { harumadiContent } from "./fixtures/harumadiContent";

test("첫 마디는 기존 완료 화면을 유지하고 두 번째부터 저장 후 선택 화면을 연다", () => {
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(screen, /if \(saved && !savedAsFirstMadi && harumadiSelection\) return <MadiHarumadiSelection/);
  assert.match(screen, /if \(preview \|\| \(saved && !savedAsFirstMadi && harumadiSelection\)\) return/);
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /initialBookId: harumadiId/);
  assert.match(screen, /onNext=\{startAnother\}/);
  // 담지 않고 마치기는 addEntryId를 붙이지 않는 복귀 경로다.
  assert.match(flow, /onDone: \(\) => \{ requestLoginNudge\("journal_created"\); returnToSource\(\); \}/);
});

test("선택 화면은 빈 책장·기존 책·가득 찬 책과 담지 않기를 구분한다", () => {
  const book = harumadiContent().harumadi;
  for (const variant of ["empty", "book", "full"] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const row = { ...book, entryIds: variant === "full" ? Array.from({ length: HARUMADI_PDF_MAX_ENTRIES }, (_, i) => `old-${i}`) : book.entryIds };
    client.setQueryData(["library-harumadis", "owner"], { pages: [{ harumadis: variant === "empty" ? [] : [row], nextCursor: null }], pageParams: [undefined] });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MadiHarumadiSelection, {
      ownerId: "owner", entryId: "new-entry", initialBookId: book.id, onDone() {}, onNext() {},
    })));
    assert.match(html, /담지 않고 마치기/);
    assert.match(html, /마디 저장 완료/);
    assert.doesNotMatch(html, /민감정보가 있나요/);
    if (variant === "empty") assert.match(html, /아직 하루마디가 없어요/);
    else assert.match(html, /type="radio"[^>]*checked/);
    if (variant === "full") assert.match(html, /가득 찼어요/);
    client.clear();
  }
});

test("연결은 최신 책 내용·리비전을 보존하고 중복·정원·충돌·다른 계정을 검증한다", async t => {
  const session = { userId: "selection-owner", accessToken: "s".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(session));
  await ensureSession();
  t.mock.method(harumadiReadCache, "clearBook", async () => {});
  let book = { ...harumadiContent().harumadi, revision: 7, entryIds: ["entry-a", "latest-entry"] };
  let writes = 0;
  let conflict = false;
  let loseResponse = false;
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.match(String(url), /\/harumadis\/book-a$/);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${session.accessToken}`);
    if (init?.method === "PATCH") {
      writes++;
      const input = JSON.parse(String(init.body));
      assert.equal(input.revision, book.revision);
      assert.equal(input.title, book.title);
      if (conflict) return Response.json({ error: "다른 화면에서 하루마디가 바뀌었어요." }, { status: 409 });
      book = { ...book, ...input, revision: book.revision + 1 };
      if (loseResponse) { loseResponse = false; throw new Error("응답을 받지 못했어요."); }
    }
    return Response.json({ harumadi: book });
  });
  await addMadiToHarumadi(session.userId, book.id, "new-entry");
  assert.deepEqual(book.entryIds, ["entry-a", "latest-entry", "new-entry"]);
  assert.equal(writes, 1);
  await addMadiToHarumadi(session.userId, book.id, "new-entry");
  assert.equal(writes, 1, "재시도 시 이미 담긴 마디를 중복 연결하지 않는다");
  conflict = true;
  await assert.rejects(addMadiToHarumadi(session.userId, book.id, "conflicting-entry"), /다른 화면/);
  assert.equal(book.entryIds.includes("conflicting-entry"), false);
  conflict = false;
  loseResponse = true;
  await assert.rejects(addMadiToHarumadi(session.userId, book.id, "response-lost-entry"), /응답/);
  const afterLostResponse = writes;
  await addMadiToHarumadi(session.userId, book.id, "response-lost-entry");
  assert.equal(writes, afterLostResponse);
  assert.equal(book.entryIds.filter(id => id === "response-lost-entry").length, 1);
  const before = writes;
  book.entryIds = Array.from({ length: HARUMADI_PDF_MAX_ENTRIES }, (_, i) => `full-${i}`);
  await assert.rejects(addMadiToHarumadi(session.userId, book.id, "over-limit"), /가득 찼어요/);
  assert.equal(writes, before);
  await assert.rejects(addMadiToHarumadi("other-owner", book.id, "entry"), /계정/);
  assert.equal(writes, before);
});
