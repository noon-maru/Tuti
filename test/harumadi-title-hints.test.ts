import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Prisma } from "@/generated/prisma/client";
import { markDuplicateHarumadiTitles, normalizeHarumadiTitle, harumadiTitleHint, shouldNotifyDuplicateTitle, DUPLICATE_HARUMADI_TITLE_NOTICE } from "@/shared/harumadi/titleHints";
import { withHarumadiTitleHints } from "@/server/harumadi/titleHints";
import { HarumadiShelf } from "@/features/tuti/components/HarumadiShelf";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { MadiHarumadiSelection } from "@/features/tuti/screens/journal/MadiHarumadiSelection";
import { harumadiContent } from "./fixtures/harumadiContent";

test("같은 ID 재등장은 중복이 아니며 공백·대소문자·한글 조합만 다른 이름은 함께 구분한다", () => {
  assert.equal(normalizeHarumadiTitle("  DAILY\n하루  "), "daily 하루");
  assert.equal(normalizeHarumadiTitle("하루"), "하루");
  const original = { id: "a", title: "우리의 하루" };
  assert.equal(markDuplicateHarumadiTitles([original], [original])[0].duplicateTitle, undefined);
  assert.equal(markDuplicateHarumadiTitles([original], [])[0].duplicateTitle, undefined);
  const marked = markDuplicateHarumadiTitles([original], [original, { id: "off-page", title: " 우리의   하루 " }]);
  assert.equal(marked[0].duplicateTitle, true); assert.equal(marked[0].title, original.title);
});

test("생성·실제 이름 변경만 토스트를 안내하고 표지 수정·일반 이름은 방해하지 않는다", () => {
  const saved = { title: "같은 이름", duplicateTitle: true };
  assert.equal(shouldNotifyDuplicateTitle(undefined, saved), true);
  assert.equal(shouldNotifyDuplicateTitle({ title: "다른 이름" }, saved), true);
  assert.equal(shouldNotifyDuplicateTitle({ title: " 같은  이름 " }, saved), false);
  assert.equal(shouldNotifyDuplicateTitle(undefined, { title: "새 이름" }), false);
  assert.match(DUPLICATE_HARUMADI_TITLE_NOTICE, /보조 정보가 함께 표시/);
  assert.equal(DUPLICATE_HARUMADI_TITLE_NOTICE.split("\n")[0], "같은 이름의 하루마디가 있어요.");
  const source = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(source, /shouldNotifyDuplicateTitle\(harumadi, saved\)\) showToast/);
  assert.ok(source.indexOf("const saved = harumadi ? await updateHarumadi") < source.indexOf("showToast(DUPLICATE_HARUMADI_TITLE_NOTICE)"));
});

test("본인·활성 초대 책만 조회하며 다음 페이지의 동명도 판단하고 비공개 책은 제외한다", async t => {
  const previous = process.env.HARUMADI_TOGETHER_ENABLED;
  t.after(() => { if (previous === undefined) delete process.env.HARUMADI_TOGETHER_ENABLED; else process.env.HARUMADI_TOGETHER_ENABLED = previous; });
  const base = { ...harumadiContent().harumadi, title: "공통 이름" };
  let shared = false;
  const tx = { harumadi: { findMany: async ({ where, select }: { where: unknown; select: unknown }) => {
    assert.deepEqual(select, { id: true, title: true });
    assert.deepEqual(where, shared ? { OR: [{ ownerId: "owner" }, { members: { some: { userId: "owner", endedAt: null } } }] } : { ownerId: "owner" });
    return [{ id: base.id, title: base.title }, ...(shared ? [{ id: "shared-other-page", title: base.title }] : [])];
  } } } as unknown as Prisma.TransactionClient;
  process.env.HARUMADI_TOGETHER_ENABLED = "false";
  assert.equal((await withHarumadiTitleHints(tx, "owner", [base]))[0].duplicateTitle, undefined);
  shared = true; process.env.HARUMADI_TOGETHER_ENABLED = "true";
  assert.equal((await withHarumadiTitleHints(tx, "owner", [base]))[0].duplicateTitle, true);
});

test("표지·책등·한 권씩과 담기 선택 화면에만 필요한 생성 시각을 표시한다", () => {
  const book = { ...harumadiContent().harumadi, title: "같은 하루", duplicateTitle: true, createdAt: "2026-11-03T15:05:06Z", role: "contributor" as const, ownerName: "친구" };
  assert.deepEqual(harumadiTitleHint(book), { date: "2026.11.04", time: "00:05:06" });
  assert.equal(harumadiTitleHint({ ...book, duplicateTitle: false }), null);
  assert.equal(harumadiTitleHint({ ...book, createdAt: "invalid" }), null);
  const render = (child: ReturnType<typeof createElement>, client = new QueryClient()) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, child));
  for (const view of ["covers", "spines"] as const) {
    const html = render(createElement(HarumadiShelf, { books: [book], ownerId: "owner", view, onOpen() {} }));
    assert.match(html, /data-harumadi-title-hint="true"/); assert.match(html, /2026\.11\.04/); assert.match(html, /00:05:06/);
    assert.match(html, new RegExp(`height:${view === "spines" ? 132 : 164}px`));
    assert.match(html, /친구님의 하루마디/);
    assert.doesNotMatch(render(createElement(HarumadiShelf, { books: [{ ...book, duplicateTitle: false }], ownerId: "owner", view, onOpen() {} })), /data-harumadi-title-hint="true"/);
  }
  assert.match(render(createElement(HarumadiCarousel, { books: [book], ownerId: "owner", onOpen() {} })), /data-harumadi-title-hint="true"/);
  const client = new QueryClient();
  client.setQueryData(["library-harumadis", "owner"], { pages: [{ harumadis: [book], nextCursor: null }], pageParams: [undefined] });
  assert.match(render(createElement(MadiHarumadiSelection, { ownerId: "owner", entryId: "entry", onDone() {}, onNext() {} }), client), /data-harumadi-title-hint="true"/);
  client.clear();
});
