import assert from "node:assert/strict";
import test from "node:test";
import { createReadingPositions, readingIndex, readingPosition } from "../src/lib/harumadiReadingPosition";
import { buildHarumadiReaderPages } from "../src/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";

test("읽던 위치는 쪽번호가 아닌 마디 ID를 따라가고 삭제·재배치·분량 변화를 견딘다", () => {
  const fixture = harumadiContent();
  const a = fixture.entries[0], b = { ...a, id: "b", content: "이야기 ".repeat(500) };
  const book = { ...fixture.harumadi, entryIds: [a.id, b.id] };
  const pages = buildHarumadiReaderPages(book, [a, b]);
  const at = pages.findIndex(page => page.entryId === "b");
  const position = readingPosition(pages, at + 1)!;
  assert.equal(position.entryId, "b"); assert.equal(position.part, 1);
  const reordered = buildHarumadiReaderPages({ ...book, entryIds: ["b", a.id] }, [a, b], 280);
  assert.equal(reordered[readingIndex(reordered, position)].entryId, "b");
  const shortened = buildHarumadiReaderPages(book, [a, { ...b, content: "짧게" }]);
  assert.equal(shortened[readingIndex(shortened, position)].entryId, "b");
  const removed = buildHarumadiReaderPages(book, [a]);
  assert.equal(readingIndex(removed, position), 1);
  assert.equal(readingPosition(pages, 0), null);
});
test("계정별 읽기 환경설정은 손상·만료를 무시하고 동시 저장·삭제를 순서대로 처리한다", async () => {
  const values = new Map<string, string>(); let now = 1_800_000_000_000;
  const storage = { async getItem(key: string) { return values.get(key) ?? null; }, async setItem(key: string, value: string) { values.set(key, value); }, async removeItem(key: string) { values.delete(key); } };
  const preferences = createReadingPositions(storage, () => now);
  await Promise.all([preferences.save("a", "book", { entryId: "madi", part: 0 }), preferences.save("a", "other", { entryId: "other", part: 2 })]);
  assert.equal((await preferences.load("a", "book"))?.entryId, "madi");
  assert.equal(await preferences.load("b", "book"), null);
  now += 91 * 86400_000; assert.equal(await preferences.load("a", "book"), null);
  values.set("tuti-reading-position:a", "broken"); assert.equal(await preferences.load("a", "book"), null);
  await preferences.save("a", "book", { entryId: "madi", part: 0 });
  await preferences.clearOwner("a"); assert.equal(values.size, 0);
});
