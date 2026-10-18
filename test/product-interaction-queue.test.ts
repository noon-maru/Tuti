import assert from "node:assert/strict";
import test from "node:test";
import { createProductInteractionQueue, PRODUCT_INTERACTION_QUEUE_KEY } from "../src/lib/analytics/productInteractionQueue";

const id = (number: number) => `bb17e0d4-d207-4d0e-9bf0-${String(number).padStart(12, "0")}`;
function fixture() {
  let now = 1_800_000_000_000;
  let owner = { userId: "a", accessToken: "token-a" };
  let fail = false;
  const storage = new Map<string, string>();
  const sent: Array<{ id: string; user: string; token: string }> = [];
  const tracker = createProductInteractionQueue({
    session: async () => owner, platform: () => "web", now: () => now,
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
    send: async (input, session) => {
      if (fail) throw new Error("offline or unauthorized");
      sent.push({ id: input.eventId, user: session.userId, token: session.accessToken });
    },
  });
  return { tracker, sent, storage, switchOwner: () => { owner = { userId: "b", accessToken: "token-b" }; },
    offline: (value: boolean) => { fail = value; }, advance: (days: number) => { now += days * 86400_000; }, now: () => now };
}

test("실패한 이벤트는 같은 ID·인증 소유자로 재전송하고 계정 전환 시 이전 큐를 버린다", async () => {
  const f = fixture();
  f.offline(true);
  await assert.rejects(f.tracker.record("journal_book_purchase_clicked", "completed_book", id(1)));
  f.offline(false);
  await f.tracker.flush();
  assert.deepEqual(f.sent, [{ id: id(1), user: "a", token: "token-a" }]);
  f.offline(true);
  await assert.rejects(f.tracker.record("journal_book_purchase_clicked", "completed_book", id(2)));
  f.switchOwner(); f.offline(false);
  await f.tracker.flush();
  await f.tracker.record("journal_book_purchase_clicked", "completed_book", id(3));
  assert.deepEqual(f.sent.at(-1), { id: id(3), user: "b", token: "token-b" });
  assert.equal(f.sent.length, 2);
});

test("실행 중에도 7일이 지난 큐를 파기하고 저장 데이터의 임의 필드를 전송하지 않는다", async () => {
  const f = fixture();
  f.storage.set(PRODUCT_INTERACTION_QUEUE_KEY, JSON.stringify([{ ownerId: "a", queuedAt: f.now(), input: {
    eventId: id(4), action: "welcome_viewed", platform: "web", surface: "welcome", privateText: "must be dropped",
  } }]));
  f.offline(true);
  await assert.rejects(f.tracker.flush());
  assert.doesNotMatch(f.storage.get(PRODUCT_INTERACTION_QUEUE_KEY)!, /privateText|must be dropped/);
  f.advance(8); f.offline(false);
  await f.tracker.flush();
  assert.equal(f.sent.length, 0);
  assert.equal(f.storage.get(PRODUCT_INTERACTION_QUEUE_KEY), "[]");
});

test("동시 클릭을 잃지 않고 화면 노출만 계정별 중복 제거한다", async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 12 }, (_, index) => f.tracker.record("journal_book_purchase_clicked", "completed_book", id(index + 10))));
  assert.equal(f.sent.length, 12);
  assert.equal(new Set(f.sent.map((event) => event.id)).size, 12);
  await Promise.all([f.tracker.record("welcome_viewed", "welcome", id(30)), f.tracker.record("welcome_viewed", "welcome", id(31))]);
  assert.equal(f.sent.length, 13);
  f.switchOwner();
  await f.tracker.record("welcome_viewed", "welcome", id(32));
  assert.equal(f.sent.length, 14);
});
