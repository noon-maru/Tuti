import assert from "node:assert/strict";
import test from "node:test";

import { withCors } from "../src/server/http/cors.ts";

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
