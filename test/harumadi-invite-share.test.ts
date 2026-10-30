import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { harumadiInviteShareContent, harumadiInviteUrl } from "@/shared/api/harumadiTogether";
import { shareContent } from "@/lib/shareContent";

const token = "a".repeat(43);
const url = harumadiInviteUrl(token, "/api", "http://localhost:5080");
const content = harumadiInviteShareContent(url);

test("초대 안내 다음 빈 줄에 링크를 한 번만 넣고 URL 끝에 문구를 붙이지 않는다", () => {
  assert.equal(content.text, `각자의 순간을 하나의 하루마디에 담아보세요.\n\n${url}`);
  assert.equal(content.text.split(url).length - 1, 1);
  assert.equal(new URL(content.text.split("\n").at(-1)!).hash, `#${token}`);
  assert.equal("url" in content, false);
  const source = readFileSync("src/lib/harumadiTogether.ts", "utf8");
  assert.match(source, /const data = harumadiInviteShareContent\(url\)/);
  assert.match(source, /Share.share\(\{ \.\.\.data, dialogTitle:/);
  assert.match(source, /shareContent\(data\)/);
});

test("웹 공유와 클립보드 복사 모두 같은 줄바꿈과 원래 토큰을 유지한다", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator"); });
  let shared: unknown;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share: async (data: unknown) => { shared = data; } } });
  assert.equal(await shareContent(content), "shared");
  assert.deepEqual(shared, content);
  let copied = "";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copied = value; } } } });
  assert.equal(await shareContent(content), "copied");
  assert.equal(copied, `${content.title}\n${content.text}`);
  assert.equal(new URL(copied.split("\n").at(-1)!).hash, `#${token}`);
});
