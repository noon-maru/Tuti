import assert from "node:assert/strict";
import test from "node:test";

import { createPreflightResponse, withCors } from "../src/server/http/cors.ts";

for (const origin of ["https://localhost", "capacitor://localhost"]) {
  test(`${origin}: 알림 설정 PUT 사전 요청에 메서드와 앱 인증 헤더를 허용한다`, () => {
    const requestedHeaders = [
      "authorization", "content-type", "x-tuti-client-protocol",
      "x-tuti-client-platform", "x-tuti-client-version",
    ];
    const response = createPreflightResponse(new Request("https://tuti.today/api/notifications/settings", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": requestedHeaders.join(", "),
      },
    }));

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    const methods = response.headers.get("access-control-allow-methods")!.split(/,\s*/);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.ok(methods.includes(method), method);
    }
    const allowedHeaders = response.headers.get("access-control-allow-headers")!.toLowerCase().split(/,\s*/);
    for (const header of requestedHeaders) assert.ok(allowedHeaders.includes(header), header);
  });
}

test("알림 설정 PUT 사전 요청도 허용하지 않은 출처는 차단한다", () => {
  const response = createPreflightResponse(new Request("https://tuti.today/api/notifications/settings", {
    method: "OPTIONS",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "PUT" },
  }));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-methods"), null);
});

test("원본 요청에도 Origin 기준 캐시 구분을 명시한다", async () => {
  const response = withCors(
    new Request("https://tuti.today/api/example"),
    new Response("image"),
  );

  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(await response.text(), "image");
});

test("Android WebView의 허용된 Origin에는 CORS 헤더를 반환한다", () => {
  const response = withCors(
    new Request("https://tuti.today/api/example", {
      headers: { Origin: "https://localhost" },
    }),
    new Response(null),
  );

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://localhost",
  );
  assert.equal(response.headers.get("vary"), "Origin");
});

test("허용되지 않은 Origin에는 CORS 허용 헤더를 반환하지 않는다", () => {
  const response = withCors(
    new Request("https://tuti.today/api/example", {
      headers: { Origin: "https://example.com" },
    }),
    new Response(null),
  );

  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("vary"), "Origin");
});
