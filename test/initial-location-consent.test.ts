import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { submitInitialConsents } from "@/lib/initialConsent";
import { getSessionSnapshot } from "@/lib/auth/session";
import { serviceTermsAcceptanceCache } from "@/lib/serviceTermsAcceptanceCache";
import { getLocationTermsVersion } from "@/shared/location/terms";
import documents from "@/shared/legal/finalizedDocuments.json";

const offer = { ...documents["service-terms"], accepted: false, publishedAt: "2026-10-23T05:11:40.612Z", effectiveAt: "2026-10-23T05:11:40.612Z" };

test("최초 선택 위치 동의는 필수 약관 뒤 별도로 저장하고 미선택·실패는 마디 이용을 막지 않는다", async t => {
  const data = new Map<string, string>();
  t.mock.method(preferencesStorage, "getItem", async (key: string) => data.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { data.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { data.delete(key); });
  t.mock.method(serviceTermsAcceptanceCache, "write", async () => {});
  let accepted = false, failTerms = false, failLocation = false;
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), "https://tuti.today").pathname;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (path === "/api/anonymous-session") return Response.json({ session: { userId: "initial-location-user", accessToken: "q".repeat(40) } });
    if (path === "/api/service-terms") {
      if (method === "POST") {
        if (failTerms) return Response.json({ error: "terms failed" }, { status: 503 });
        accepted = true;
        return Response.json({});
      }
      return Response.json({ current: { ...offer, accepted }, upcoming: null, required: !accepted });
    }
    if (path === "/api/location-consent") {
      assert.equal(accepted, true);
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${"q".repeat(40)}`);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.status, "accepted");
      assert.equal(body.termsVersion, getLocationTermsVersion());
      assert.equal(body.ageConfirmed, true);
      assert.equal("location" in body, false);
      return failLocation ? Response.json({ error: "location failed" }, { status: 503 }) : Response.json({ consent: { status: "accepted" } });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  const confirmations = { ageConfirmed: true, importantTermsConfirmed: true };
  await t.test("필수 확인 전에는 위치 동의도 저장하지 않는다", async () => {
    await assert.rejects(submitInitialConsents(offer, { ...confirmations, ageConfirmed: false }, true));
    assert.equal(calls.length, 0);
  });
  await t.test("미선택이면 위치 동의·거부를 생성하지 않는다", async () => {
    const result = await submitInitialConsents(offer, confirmations, false);
    assert.equal(result.state.allowed, true);
    assert.equal(result.locationError, undefined);
    assert.equal(calls.some(path => path.includes("location-consent")), false);
  });
  await t.test("체크한 경우 같은 계정에 별도 동의만 기록한다", async () => {
    calls.length = 0;
    const result = await submitInitialConsents(offer, confirmations, true);
    assert.equal(result.state.allowed, true);
    assert.equal(result.locationError, undefined);
    assert.equal(calls.filter(path => path === "POST /api/location-consent").length, 1);
    assert.ok(calls.indexOf("POST /api/service-terms") < calls.indexOf("POST /api/location-consent"));
    assert.equal(getSessionSnapshot()?.userId, result.state.userId);
  });
  await t.test("위치 저장만 실패하면 필수 동의 상태와 선택적 재시도 안내를 반환한다", async () => {
    failLocation = true;
    const result = await submitInitialConsents(offer, confirmations, true);
    assert.equal(result.state.allowed, true);
    assert.match(result.locationError!, /필수 동의는 저장|위치 없이 시작/);
    failLocation = false;
  });
  await t.test("필수 동의 저장에 실패하면 위치 동의까지 진행하지 않는다", async () => {
    failTerms = true;
    calls.length = 0;
    await assert.rejects(submitInitialConsents(offer, confirmations, true));
    assert.equal(calls.some(path => path.includes("location-consent")), false);
  });
});

test("위치 선택은 시작 버튼의 필수 조건이 아니며 약관 열람 중 체크 상태를 유지한다", () => {
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /locationConfirmed, setLocationConfirmed\] = useState\(false\)/);
  assert.match(gate, /위치기반서비스 이용약관에 동의해요\.<small>선택/);
  assert.match(gate, /<MainPanel hidden=\{Boolean\(documentOpen\)\}/);
  assert.match(gate, /\$fullWidth disabled=\{saving\}/);
  assert.match(gate, /ageConfirmed: true, importantTermsConfirmed: true/);
  assert.match(gate, /if \(active.current\) onAccepted\(result.state\)/);
  assert.doesNotMatch(gate, /acceptedState|위치 동의 없이 시작하기/);
  const provider = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  assert.doesNotMatch(provider, /regionPreferenceRequired/);
  assert.match(provider, /!locationFailure && regionSheetOpen/);
  assert.match(provider, /const declineRequest[\s\S]*?setRegionSheetOpen\(true\)/);
  assert.doesNotMatch(readFileSync("src/lib/initialConsent.ts", "utf8"), /requestDeviceLocation|requestPermissions|getCurrentPosition/);
});
