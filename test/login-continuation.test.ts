import assert from "node:assert/strict";
import test from "node:test";
import { createLoginContinuation, loginPath, loginSuccessPath, safeLoginReturn } from "@/lib/loginContinuation";

test("로그인 복귀 경로는 허용한 내부 화면과 식별자만 보존한다", () => {
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/admin", "/api/account", "/login", "/madi\n"]) assert.equal(safeLoginReturn(unsafe), null);
  assert.equal(safeLoginReturn("/harumadi?harumadiId=book-1&mode=together&token=secret#secret"), "/harumadi?harumadiId=book-1&mode=together");
  assert.equal(safeLoginReturn("/madi/new?harumadiId=%2Fsecret&placeName=private"), "/madi/new");
  assert.equal(new URL(loginPath("/explore?mode=questions&step=2"), "https://tuti.test").searchParams.get("returnTo"), "/explore?mode=questions&step=2");
  assert.equal(loginSuccessPath("/entry"), "/");
  assert.equal(loginSuccessPath("/entry?next=explore"), "/explore");
  assert.equal(loginSuccessPath("/madi/detail?entryId=m1"), "/madi/detail?entryId=m1");
});

test("소셜 로그인 복귀는 재마운트에서도 유지하되 만료·완료 후 폐기한다", async () => {
  const data = new Map<string, string>(); let time = 1000;
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const first = createLoginContinuation(storage, () => time);
  await first.remember("/harumadi/invite#not-persisted");
  assert.equal(await createLoginContinuation(storage, () => time).read(), "/harumadi/invite");
  assert.doesNotMatch([...data.values()].join(""), /not-persisted/);
  time += 30 * 60_000;
  assert.equal(await first.read(), null);
  await first.remember("/settings"); await first.clear(); assert.equal(await first.read(), null);
  await first.remember("//evil.test"); assert.equal(data.size, 0);
});
