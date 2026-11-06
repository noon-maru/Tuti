import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { distinctPlaceSuggestions, normalizePlaceQuery, type JournalPlaceSuggestion } from "../src/shared/api/placeSuggestions";

test("개인 장소를 우선하고 같은 ID·직접 입력 이름을 중복 제안하지 않는다", () => {
  const item = (key: string, id: string | null, name: string, source: "history" | "place" = "history"): JournalPlaceSuggestion => ({ key, id, name, source, region: null });
  const result = distinctPlaceSuggestions([
    item("h1", "park-a", "양평 유수지 생태공원"), item("h2", null, "우리 집 앞"), item("h3", null, "우리집앞"),
  ], [item("p1", "park-a", "다른 표기", "place"), item("p2", "manual-match", "우리집 앞", "place"), item("p3", "park-b", "양평 유수지 생태공원", "place")]);
  assert.deepEqual(result.history.map(row => row.key), ["h1", "h2"]);
  assert.deepEqual(result.places.map(row => row.id), ["park-b"], "ID가 다른 동명 장소는 유지");
  assert.equal(normalizePlaceQuery("  양평  유수지  "), "양평 유수지");
  assert.equal(normalizePlaceQuery("가".repeat(200)).length, 120);
});

test("제안 API는 인증된 계정만 사용하고 개인 응답을 공유 캐시에 저장하지 않는다", async () => {
  let authenticated = true;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const deps: Record<string, unknown> = {
    "@/server/auth/session": { authenticateUser: async () => authenticated ? { id: "owner" } : null },
    "@/server/http/cors": { isRequestOriginAllowed: () => true, withCors: (_request: unknown, response: Response) => response },
    "@/server/places/suggestions": { suggestJournalPlaces: async (owner: string, query: string) => { assert.equal(owner, "owner"); assert.equal(query, "양평"); return { history: [], places: [] }; } },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/places/suggestions/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (id: string) => deps[id], Response, URL, console });
  const request = new Request("https://tuti.today/api/places/suggestions?q=양평&ownerId=another-user");
  const response = await exports.GET!(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("vary")!, /Authorization/);
  authenticated = false;
  assert.equal((await exports.GET!(request)).status, 401);
});
