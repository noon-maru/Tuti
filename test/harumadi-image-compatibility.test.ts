import assert from "node:assert/strict";
import test from "node:test";
import { guardClientCompatibility } from "@/server/appUpdate/clientGuard";

// Synthetic route fixture only. No database or object storage connection is used.
process.env.HARUMADI_TOGETHER_ENABLED = "true";
process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "synthetic-shared-image-test-key";
let reads = 0, entryReads = 0, member = false, accessRevision = 1;
(globalThis as { prisma?: unknown }).prisma = {
  $transaction: async (action: (tx: unknown) => unknown) => {
    reads++;
    return action({
      harumadi: { findUnique: async () => ({ ownerId: "maker", members: member ? [{ id: "member" }] : [], accessRevision }) },
      journalEntry: { findFirst: async () => { entryReads++; return null; } },
    });
  },
};
const context = { params: Promise.resolve({ harumadiId: "book-a", entryId: "entry-a" }) };
const request = (path: string) => new Request(`https://tuti.today${path}`);

test("이미지 헤더 예외 뒤에도 티켓 누락·변조·다른 책 범위·만료는 404이며 DB에 접근하지 않는다", async t => {
  const { sharedImageUrl } = await import("@/server/harumadi/media");
  const { GET } = await import("@/app/api/harumadis/[harumadiId]/images/[entryId]/route");
  const valid = sharedImageUrl("viewer", "book-a", "entry-a", 1);
  for (const path of ["/api/harumadis/book-a/images/entry-a", "/api/harumadis/book-a/images/entry-a?ticket=invalid",
    valid.replace(/.$/, valid.endsWith("0") ? "1" : "0"), sharedImageUrl("viewer", "other-book", "entry-a", 1).replace("/other-book/", "/book-a/")]) {
    assert.equal(guardClientCompatibility(request(path)), null);
    const response = await GET(request(path), context);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  const expiredAt = Date.now() + 20 * 60_000;
  t.mock.method(Date, "now", () => expiredAt);
  assert.equal((await GET(request(valid), context)).status, 404);
  assert.equal(reads, 0); assert.equal(entryReads, 0);
});

test("서명된 티켓이 있어도 나간 참여자와 변경된 접근 리비전 및 사라진 마디는 거절한다", async () => {
  const { sharedImageUrl } = await import("@/server/harumadi/media");
  const { GET } = await import("@/app/api/harumadis/[harumadiId]/images/[entryId]/route");
  const signed = sharedImageUrl("viewer", "book-a", "entry-a", 1);
  assert.equal(guardClientCompatibility(request(signed)), null);
  member = false;
  assert.equal((await GET(request(signed), context)).status, 404);
  assert.equal(entryReads, 0);
  member = true; accessRevision = 2;
  assert.equal((await GET(request(signed), context)).status, 404);
  assert.equal(entryReads, 0);
  accessRevision = 1;
  assert.equal((await GET(request(signed), context)).status, 404);
  assert.equal(entryReads, 1, "유효한 참여 상태에서만 연결된 마디를 조회한다");
});
