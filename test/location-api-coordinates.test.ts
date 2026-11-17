import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { requestCoordinates } from "@/shared/location/requestCoordinates";
import { RecommendationRequestError, requestRecommendationResponse, shouldRetryRecommendation } from "@/lib/api/recommendationError";

function loadFunctions(file: string, names: string[], bindings: Record<string, unknown> = {}) {
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const selected = ast.statements.filter(node => {
    const name = (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) ? node.name?.text : undefined;
    return name && names.includes(name);
  }).map(node => node.getText(ast).replace(/^export /, "")).join("\n");
  const compiled = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}; return {${names.join(",")}};`)(...Object.values(bindings));
}

const location = Object.freeze({ latitude: 37.5, longitude: 127, accuracy: 25 });
const { normalizeLocation } = loadFunctions("src/app/api/recommendations/route.ts", ["InvalidRecommendationRequestError", "normalizeLocation", "assertOnlyKeys", "isRecord"]);

for (const [name, args, field, response] of [
  ["fetchRecommendations", [{ movement: "near", transport: "transit" }, location], "location", { recommendationId: "test", algorithmVersion: "test", places: [] }],
  ["fetchDeparturePlan", ["place", location, "transit"], "origin", { plan: {} }],
  ["fetchDepartureRoute", ["place", location, "walking"], "origin", { route: {} }],
  ["fetchTravelTime", ["place", location, "transit"], "origin", { summary: {} }],
  ["fetchNearbyPlaces", [location], "location", { places: [] }],
] as const) {
  test(`${name}: 정확도가 있는 기기 위치도 위도·경도만 전송해 실제 서버 검증을 통과한다`, async () => {
    let body: Record<string, unknown> = {};
    const api = loadFunctions("src/lib/tutiApi.ts", [name], {
      requestCoordinates, requestRecommendationResponse, RecommendationRequestError,
      fetchWithSession: async (_path: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        // 실제 서버 normalizeLocation을 거쳐 알 수 없는 항목(accuracy) 재발을 검증한다.
        normalizeLocation(body[field]);
        return Response.json(response);
      },
    });
    await api[name](...args);
    assert.deepEqual(body[field], { latitude: location.latitude, longitude: location.longitude });
    assert.equal(location.accuracy, 25, "로컬 이동 판정에 필요한 원본 정확도는 유지한다");
  });
}

test("위치 미제공 추천은 좌표를 새로 만들거나 정확도를 전송하지 않는다", async () => {
  let body: Record<string, unknown> = {};
  const api = loadFunctions("src/lib/tutiApi.ts", ["fetchRecommendations"], {
    requestCoordinates, requestRecommendationResponse, RecommendationRequestError,
    fetchWithSession: async (_path: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Response.json({ places: [] });
    },
  });
  const region = { areaCode: "1", name: "서울", sigunguName: "종로구" };
  await api.fetchRecommendations({}, undefined, "answered", region);
  assert.equal("location" in body, false);
  assert.deepEqual(body.preferredRegion, region);
});

test("400 요청 오류는 한 번으로 종료하고 QueryObserver 로딩 대신 오류 상태가 된다", async () => {
  let requests = 0;
  const api = loadFunctions("src/lib/tutiApi.ts", ["fetchRecommendations"], {
    requestCoordinates, requestRecommendationResponse, RecommendationRequestError,
    fetchWithSession: async () => { requests++; return Response.json({ error: "요청 형식을 확인해주세요." }, { status: 400 }); },
  });
  const client = new QueryClient();
  const observer = new QueryObserver(client, {
    queryKey: ["bad-recommendation"], queryFn: () => api.fetchRecommendations({}, location),
    retry: shouldRetryRecommendation, retryDelay: 0, gcTime: 0,
  });
  const stop = observer.subscribe(() => {});
  try {
    const result = await observer.refetch();
    assert.equal(requests, 1);
    assert.equal(result.isError, true);
    assert.equal(result.isLoading, false);
    assert.equal(result.fetchStatus, "idle");
    assert.equal((result.error as RecommendationRequestError).status, 400);
  } finally { stop(); client.clear(); }
});

test("일시 통신·서버 장애는 한 번만 재시도하고 4xx·후보 부족은 반복하지 않는다", () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    assert.equal(shouldRetryRecommendation(0, new RecommendationRequestError("거절", status)), false);
  }
  for (const error of [new TypeError("network"), new RecommendationRequestError("장애", 503)]) {
    assert.equal(shouldRetryRecommendation(0, error), true);
    assert.equal(shouldRetryRecommendation(1, error), false);
  }
  assert.equal(shouldRetryRecommendation(0, new RecommendationRequestError("후보 없음", 503, "long_distance_unavailable")), false);
});

test("요청 전 조건 대기는 실제 추천 로딩으로 표시하지 않는다", () => {
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  assert.match(flow, /loading=\{isLoading && !dailyCheckInVisible\}/);
  assert.doesNotMatch(flow, /loading=\{isPending && !dailyCheckInVisible\}/);
});
