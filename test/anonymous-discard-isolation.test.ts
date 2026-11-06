import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";
import { lockAnonymousDiscard } from "../src/server/auth/anonymousDiscard";

test("임시 계정 정리는 부모 잠금 뒤 새 데이터와 로그인 상태를 재확인한다", async () => {
  let locked = false, identities = 0;
  const counts = [0, 0, 0];
  const tx = {
    $queryRaw: async () => { locked = true; return [{ id: "a" }, { id: "b" }]; },
    authIdentity: { count: async () => { assert.ok(locked); return identities; } },
    ...Object.fromEntries(["journalEntry", "harumadi", "harumadiPdf"].map((key, i) => [key, { count: async () => { assert.ok(locked); return counts[i]; } }])),
  } as unknown as Prisma.TransactionClient;
  await lockAnonymousDiscard(tx, "a", "b", false);
  for (let i = 0; i < 3; i++) {
    counts[i] = 1;
    await assert.rejects(lockAnonymousDiscard(tx, "a", "b", false), { code: "account_discard_content_changed" });
    counts[i] = 0;
  }
  counts[0] = 1;
  await lockAnonymousDiscard(tx, "a", "b", true);
  identities = 1;
  await assert.rejects(lockAnonymousDiscard(tx, "a", "b", true), { code: "account_merge_source_changed" });
});
