import assert from "node:assert/strict";
import test from "node:test";
import { parseHarumadiOrder } from "../src/shared/api/harumadi";
import { moveEntry, orderByEntryIds } from "../src/shared/harumadi/order";
import { orderedLinks } from "../src/server/harumadi/order";
import { buildHarumadiReaderPages } from "../src/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";
import { createHarumadiPdfPreviewHandler } from "../src/server/harumadi/pdfPreview";

test("순서 입력은 리비전·고유 ID를 요구하고 이동은 원본 배열을 바꾸지 않는다", () => {
  assert.deepEqual(parseHarumadiOrder({ revision: 2, entryIds: ["b", "a"] }), { revision: 2, entryIds: ["b", "a"] });
  for (const value of [null, {}, { revision: 0, entryIds: [] }, { revision: 1, entryIds: ["a", "a"] }, { revision: 1, entryIds: [3] }]) assert.equal(parseHarumadiOrder(value), null);
  const ids = ["a", "b", "c"];
  assert.deepEqual(moveEntry(ids, "c", 0), ["c", "a", "b"]);
  assert.deepEqual(moveEntry(ids, "a", 2), ["b", "c", "a"]);
  assert.deepEqual(moveEntry(ids, "a", -1), ids);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("미지정 연결은 날짜순, 새 연결은 지정 순서 뒤이며 같은 마디도 책별로 독립적이다", () => {
  const link = (entryId: string, date: string, position: number | null = null) => ({ entryId, position, entry: { visitedAt: new Date(date) } });
  const a = link("a", "2026-10-02"), b = link("b", "2026-10-01"), c = link("c", "2026-09-01");
  assert.deepEqual(orderedLinks([a, b]).map(l => l.entryId), ["b", "a"]);
  assert.deepEqual(orderedLinks([{ ...a, position: 0 }, { ...b, position: 1 }, c]).map(l => l.entryId), ["a", "b", "c"]);
  assert.deepEqual(orderedLinks([a, b]).map(l => l.entryId), ["b", "a"]);
});

test("읽기·사진 표지는 지정 순서를 따르되 날짜 범위는 역전되지 않는다", () => {
  const fixture = harumadiContent();
  const a = { ...fixture.entries[0], id: "a", title: "먼저", image: "/a.jpg", content: "", visitedAt: "2026-10-03T00:00:00Z" };
  const b = { ...a, id: "b", title: "나중", image: "/b.jpg", visitedAt: "2026-10-01T00:00:00Z" };
  const book = { ...fixture.harumadi, coverStyle: "white-image" as const, entryIds: ["a", "b"] };
  const pages = buildHarumadiReaderPages(book, [b, a]);
  assert.equal(pages[0].image, "/a.jpg");
  assert.equal(pages[0].date, "2026.10.01\n- 2026.10.03");
  assert.deepEqual(pages.filter(p => p.kind === "photo").map(p => p.title), ["먼저", "나중"]);
  assert.deepEqual(orderByEntryIds([b, a], book.entryIds).map(e => e.id), ["a", "b"]);
});

test("PDF 미리보기는 DB 조회 순서·날짜순으로 지정 순서를 덮어쓰지 않는다", async () => {
  const entries = ["a", "b"].map((id, index) => ({ id, title: id, content: "", placeName: "", image: null, visitedAt: new Date(`2026-10-0${index + 1}`) }));
  const handler = createHarumadiPdfPreviewHandler({
    authenticate: async () => ({ id: "owner" }), findEntries: async () => entries,
    approve: async () => "approval", render: async (_input, ordered) => {
      assert.deepEqual(ordered.map(e => e.id), ["b", "a"]); return new Uint8Array([1]);
    },
  });
  const response = await handler(new Request("https://tuti.test/api/harumadi-pdfs/preview", { method: "POST", body: JSON.stringify({
    title: "하루", coverStyle: "white-plain", entryIds: ["b", "a"], letter: "", coverEntryId: null,
  }) }));
  assert.equal(response.status, 200);
});
