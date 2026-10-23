import assert from "node:assert/strict";
import test from "node:test";
import { Capacitor } from "@capacitor/core";
import { clientFetch, clientRequestHeaders } from "@/lib/api/clientFetch";
import { apiUrl } from "@/lib/api/apiUrl";
import { CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";

test("교차 출처 요청은 처음부터 현행 규약을 사용하며 구서버 약관 협상을 하지 않는다", async t => {
  const calls: string[] = [];
  const controller = new AbortController();
  let reject = false;
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), CLIENT_PROTOCOL);
    assert.equal(headers.get(CLIENT_PLATFORM_HEADER), "web");
    assert.equal(headers.get(CLIENT_VERSION_HEADER), null);
    if (String(input) === apiUrl("journal-books")) {
      assert.equal(headers.get("Authorization"), "Bearer test-session");
      assert.equal(headers.get("X-Tuti-Journal-Book-Approval"), "test-approval");
      assert.equal(init?.body, "test-pdf-body");
      assert.equal(init?.signal, controller.signal);
    }
    return reject ? Response.json({ code: "client_update_required" }, { status: 426 }) : Response.json({ ok: true });
  });
  await clientFetch(apiUrl("app-update"));
  await clientFetch(apiUrl("service-terms"));
  const write = () => clientFetch(apiUrl("journal-books"), { method: "POST", headers: { Authorization: "Bearer test-session", "X-Tuti-Journal-Book-Approval": "test-approval" }, body: "test-pdf-body", signal: controller.signal });
  await write();
  assert.deepEqual(calls, [apiUrl("app-update"), apiUrl("service-terms"), apiUrl("journal-books")]);
  reject = true;
  assert.equal((await write()).status, 426);
  assert.equal(calls.length, 4, "거절된 요청을 구서버 협상이나 다른 계정으로 재전송하지 않는다");
});

test("Android·iOS 환경 헤더는 앱 버전과 현행 규약을 쓰고 호출자의 가짜 헤더를 대체한다", () => {
  for (const platform of ["android", "ios"]) {
    const headers = clientRequestHeaders({ [CLIENT_VERSION_HEADER]: "0.0.0", [CLIENT_PLATFORM_HEADER]: "web" }, platform, "1.4.1");
    assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), CLIENT_PROTOCOL);
    assert.equal(headers.get(CLIENT_PLATFORM_HEADER), platform);
    assert.equal(headers.get(CLIENT_VERSION_HEADER), "1.4.1");
    assert.throws(() => clientRequestHeaders(undefined, platform));
  }
});
