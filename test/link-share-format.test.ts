import assert from "node:assert/strict";
import test from "node:test";
import { createLinkShareContent, shareContent } from "../src/lib/shareContent";
import { createJournalPublicShareData, shareJournalPublicUrl } from "../src/lib/journalShare";

test("장소 공유는 제목·설명·링크를 한 본문에서 빈 줄로 구분하며 중복 URL 필드를 보내지 않는다", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator"); });
  const content = { title: "서울숲", text: "초록 사이를 걸어요.", url: "https://tuti.today/place/forest" };
  const expected = { title: "서울숲", text: "서울숲\n\n초록 사이를 걸어요.\n\nhttps://tuti.today/place/forest" };
  assert.deepEqual(createLinkShareContent(content), expected);
  let shared: unknown, copied = "";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share: async (data: unknown) => { shared = data; } } });
  assert.equal(await shareContent(content), "shared");
  assert.deepEqual(shared, expected);
  assert.equal("url" in (shared as object), false);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copied = value; } } } });
  assert.equal(await shareContent(content), "copied");
  assert.equal(copied, expected.text, "복사 경로에서도 제목·URL을 두 번 넣지 않는다");
});

test("공개 마디도 웹 공유와 복사에서 같은 제목·링크 본문을 사용하고 취소는 복사하지 않는다", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator"); });
  const entry = { title: "우리의 하루", placeName: "서울숲" };
  const expected = createJournalPublicShareData("https://tuti.today/shared/example", entry);
  let copied = "", shared: unknown;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share: async (data: unknown) => { shared = data; } } });
  await shareContent(expected);
  assert.deepEqual(shared, expected);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copied = value; } } } });
  assert.equal(await shareJournalPublicUrl("example", entry), "copied");
  assert.equal(copied, "우리의 하루 | Tuti\n\nhttps://tuti.today/shared/example");
  copied = "";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share: async () => { throw new DOMException("cancelled", "AbortError"); }, clipboard: { writeText: async (value: string) => { copied = value; } } } });
  assert.equal(await shareContent(expected), "cancelled");
  assert.equal(copied, "");
});
