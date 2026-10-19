import assert from "node:assert/strict";
import test from "node:test";
import { createOrderedStorage } from "../src/lib/storage/orderedStorage";

test("예전 기기 저장이 철회 상태를 나중에 덮지 않도록 쓰기·삭제 순서를 보장한다", async () => {
  let release!: () => void;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  let value: string | null = null;
  const calls: string[] = [];
  const storage = createOrderedStorage({
    getItem: () => value,
    setItem: async (_key, data) => { if (data === "located") await delay; value = data; calls.push(data); },
    removeItem: () => { value = null; calls.push("delete"); },
  });
  const old = storage.setItem("ui", "located");
  const withdrawn = storage.setItem("ui", "withdrawn");
  release();
  await Promise.all([old, withdrawn, storage.flush()]);
  assert.equal(await storage.getItem("ui"), "withdrawn");
  await storage.removeItem("ui");
  assert.deepEqual(calls, ["located", "withdrawn", "delete"]);
});

test("저장 실패는 호출자에게 전파하고 후속 철회 저장까지 영구 차단하지 않는다", async () => {
  const storage = createOrderedStorage({ getItem: () => null, setItem: (_key, value) => { if (value === "fail") throw new Error("failed"); }, removeItem: () => {} });
  await assert.rejects(storage.setItem("ui", "fail"));
  await assert.rejects(storage.flush());
  await storage.setItem("ui", "withdrawn");
  await storage.flush();
});
