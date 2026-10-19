import assert from "node:assert/strict";
import test from "node:test";
import { cancelLocationRequests, locationRequestSignal, memoizeLocationRequest, withLocationRequestScope } from "../src/server/location/requestScope";

test("위치 경로 중복 계산은 요청 안에서만 합치고 다음 요청·다른 사용자와 공유하지 않는다", async () => {
  let calls = 0;
  const calculate = async () => ++calls;
  await withLocationRequestScope("a", async () => {
    assert.deepEqual(await Promise.all([memoizeLocationRequest("route", calculate), memoizeLocationRequest("route", calculate)]), [1, 1]);
    await withLocationRequestScope("b", async () => assert.equal(await memoizeLocationRequest("route", calculate), 2));
  });
  await withLocationRequestScope("a", async () => assert.equal(await memoizeLocationRequest("route", calculate), 3));
});

test("철회는 해당 사용자의 진행 요청만 중단하고 재동의 후 새 요청은 허용한다", async () => {
  await withLocationRequestScope("a", async () => {
    const signal = locationRequestSignal(1000);
    await withLocationRequestScope("b", async () => {
      const other = locationRequestSignal(1000);
      cancelLocationRequests("a");
      assert.equal(signal.aborted, true);
      assert.equal(other.aborted, false);
    });
    assert.throws(() => memoizeLocationRequest("route", async () => "old"), { name: "AbortError" });
  });
  await withLocationRequestScope("a", async () => assert.equal(await memoizeLocationRequest("route", async () => "new"), "new"));
});

test("요청 종료 시 하위 작업도 중단하고 실패한 계산은 재시도할 수 있다", async () => {
  let signal: AbortSignal | undefined;
  await withLocationRequestScope("a", async () => {
    signal = locationRequestSignal(1000);
    await assert.rejects(memoizeLocationRequest("route", async () => { throw new Error("failed"); }));
    assert.equal(await memoizeLocationRequest("route", async () => "ok"), "ok");
  });
  assert.equal(signal?.aborted, true);
});
