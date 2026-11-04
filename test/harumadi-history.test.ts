import assert from "node:assert/strict";
import test from "node:test";
import { createHarumadiHistory } from "@/lib/harumadiHistory";

function browser() {
  const stack: Record<string, unknown>[] = [{ __NA: true, tree: ["router-state"] }];
  let index = 0, backs = 0;
  const listeners = new Set<() => void>();
  const pending: (() => void)[] = [];
  const pop = () => { for (const listener of listeners) listener(); };
  const host = { location: { href: "https://tuti.today/" }, history: {
    get state() { return stack[index]; },
    pushState(state: Record<string, unknown>) { stack.splice(index + 1); stack.push(state); index++; },
    replaceState(state: Record<string, unknown>) { stack[index] = state; },
    back() { backs++; pending.push(() => { index = Math.max(0, index - 1); pop(); }); },
  }, addEventListener(_name: "popstate", listener: () => void) { listeners.add(listener); },
    removeEventListener(_name: "popstate", listener: () => void) { listeners.delete(listener); } };
  return { host, stack, listeners, get backs() { return backs; },
    back: () => { index = Math.max(0, index - 1); pop(); }, forward: () => { index = Math.min(stack.length - 1, index + 1); pop(); },
    flush: () => { for (const task of pending.splice(0)) task(); } };
}
test("웹 뒤로가기는 책만 닫고 앞으로가기는 같은 책을 다시 펼친다", () => {
  const b = browser(); let shown: string | null = null;
  const history = createHarumadiHistory(b.host, "owner", value => { shown = value as string | null; });
  history.open("book-a"); assert.equal(shown, "book-a");
  assert.equal(b.stack.length, 2);
  assert.equal(b.host.location.href, "https://tuti.today/");
  assert.deepEqual(b.host.history.state.tree, ["router-state"]);
  b.back(); assert.equal(shown, null); assert.equal(b.backs, 0);
  b.forward(); assert.equal(shown, "book-a");
  history.dispose(); assert.equal(b.listeners.size, 0);
  assert.equal(b.host.history.state.__NA, true);
});
test("닫기·Esc·Android 뒤로가기의 중복 닫기는 히스토리를 한 번만 소비한다", () => {
  const b = browser(); let shown: string | null = null;
  const history = createHarumadiHistory<string>(b.host, "owner", value => { shown = value; });
  history.open("settings"); history.close(); history.close();
  assert.equal(shown, null); assert.equal(b.backs, 1);
  b.flush(); assert.equal(shown, null);
  b.forward(); assert.equal(shown, "settings");
  history.close(); b.flush(); assert.equal(b.backs, 2);
  history.dispose();
});
test("새 계정·새 실행은 이전 책을 복원하지 않고 다른 주소의 히스토리를 소비하지 않는다", () => {
  const b = browser();
  const first = createHarumadiHistory<string>(b.host, "old-owner", () => {});
  first.open("private-book"); first.dispose();
  assert.equal(b.host.history.state.__tutiHarumadi, undefined);
  let shown: string | null = null;
  const next = createHarumadiHistory<string>(b.host, "new-owner", value => { shown = value; });
  b.back(); b.forward(); assert.equal(shown, null);
  next.open("new-book"); b.host.location.href = "https://tuti.today/madi/new";
  next.close(); assert.equal(b.backs, 0);
  next.dispose();
});

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
test("미저장 책의 브라우저 뒤로가기는 편집을 유지하고 명시적으로 버릴 때만 닫는다", async () => {
  const b = browser(); let shown: string | null = null;
  const history = createHarumadiHistory<string>(b.host, "owner", value => { shown = value; });
  history.open("edited-book");
  let allow = false, asked = 0;
  history.setCloseGuard(async () => { asked++; return allow; });
  b.back(); assert.equal(shown, "edited-book");
  await settle(); assert.equal(shown, "edited-book"); assert.equal(asked, 1);
  assert.equal(b.host.history.state.__NA, true);
  allow = true; b.back(); await settle(); assert.equal(shown, null);
  assert.equal(b.backs, 1); b.flush(); assert.equal(shown, null);
  history.dispose();
});

test("확인 중 반복 뒤로가기나 계정 해제 뒤의 늦은 승인은 책을 추가로 닫지 않는다", async () => {
  const b = browser(); let shown: string | null = null;
  const history = createHarumadiHistory<string>(b.host, "owner", value => { shown = value; });
  history.open("book"); let resolve!: (value: boolean) => void, calls = 0;
  history.setCloseGuard(() => { calls++; return new Promise(done => { resolve = done; }); });
  b.back(); await settle(); b.back(); assert.equal(calls, 1); assert.equal(shown, "book");
  history.dispose(); resolve(true); await settle(); assert.equal(b.backs, 0);
});
