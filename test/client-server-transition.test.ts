import assert from "node:assert/strict";
import test from "node:test";
import { Capacitor } from "@capacitor/core";
import { clientFetch } from "@/lib/api/clientFetch";
import { apiUrl } from "@/lib/api/apiUrl";
import { CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";

test("교차 출처 클라이언트는 구서버 CORS와 호환하고 전환 뒤 새 규약을 재협상한다", async t => {
  let upgraded = false;
  let invalidProbe = false;
  let probes = 0;
  let writes = 0;
  const controller = new AbortController();
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://localhost" } } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (String(input) === apiUrl("service-terms")) {
      probes++;
      assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), null, "협상 조회에 구서버가 허용하지 않는 헤더를 보내지 않는다");
      assert.equal(headers.get("Authorization"), null);
      if (invalidProbe) return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json({ current: null, upcoming: null, required: false, ...(upgraded ? { clientProtocol: CLIENT_PROTOCOL, enforcementEnabled: false } : {}) });
    }
    if (String(input) === apiUrl("app-update")) {
      assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), null);
      return Response.json({ required: false });
    }
    assert.equal(String(input), apiUrl("journal-books"));
    assert.equal(headers.get("Authorization"), "Bearer test-session");
    assert.equal(headers.get("X-Tuti-Journal-Book-Approval"), "test-approval");
    assert.equal(init?.signal, controller.signal);
    assert.equal(init?.body, "test-pdf-body");
    if (upgraded && !headers.has(CLIENT_PROTOCOL_HEADER)) return Response.json({ code: "client_update_required" }, { status: 426 });
    if (upgraded) {
      assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), CLIENT_PROTOCOL);
      assert.equal(headers.get(CLIENT_PLATFORM_HEADER), "web");
      assert.equal(headers.get(CLIENT_VERSION_HEADER), null);
    } else {
      for (const name of [CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER]) assert.equal(headers.get(name), null);
    }
    writes++;
    return Response.json({ ok: true });
  });
  const write = () => clientFetch(apiUrl("journal-books"), { method: "POST", headers: { Authorization: "Bearer test-session", "X-Tuti-Journal-Book-Approval": "test-approval" }, body: "test-pdf-body", signal: controller.signal });
  await t.test("최초 버전 확인·약관 조회부터 구서버가 허용하는 헤더만 쓴다", async () => {
    assert.equal((await clientFetch(apiUrl("app-update"))).status, 200);
    assert.equal((await clientFetch(apiUrl("service-terms"))).status, 200);
  });
  await t.test("협상 조회 실패를 구서버로 추정하지 않으며 쓰기를 시작하지 않는다", async () => {
    invalidProbe = true;
    await assert.rejects(write());
    assert.equal(writes, 0);
    invalidProbe = false;
  });
  await t.test("구서버에서 기존 인증·PDF 승인·본문·취소 신호를 보존한다", async () => {
    assert.equal((await write()).status, 200);
    assert.equal(writes, 1);
  });
  await t.test("서버 전환 후 명시적 426에만 재협상·1회 재요청하며 실제 쓰기는 중복하지 않는다", async () => {
    upgraded = true;
    const before = probes;
    assert.equal((await write()).status, 200);
    assert.equal(probes, before + 1);
    assert.equal(writes, 2);
    assert.equal((await write()).status, 200);
    assert.equal(probes, before + 1, "지원 확인 후 일반 요청마다 재조회하지 않는다");
    assert.equal(writes, 3);
  });
});
