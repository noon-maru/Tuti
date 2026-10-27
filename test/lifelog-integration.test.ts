import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";
import { CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER } from "../src/shared/api/clientProtocol";

test("목업 관심 수집도 현재 규약과 계정에 고정된 인증을 사용한다", async t => {
  const owner = { userId: "lifelog-user", accessToken: "a".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async (key: string) => key === "tuti-session" ? JSON.stringify(owner) : null);
  let sent = false;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(input).endsWith("product-interactions"));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), CLIENT_PROTOCOL);
    assert.equal(headers.get("Authorization"), `Bearer ${owner.accessToken}`);
    assert.equal(JSON.parse(String(init?.body)).action, "welcome_viewed");
    sent = true;
    return Response.json({ recorded: true }, { status: 201 });
  });
  const { recordProductInteraction } = await import("../src/lib/productInteraction");
  await recordProductInteraction("welcome_viewed", "welcome", "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a");
  assert.equal(sent, true);
  assert.equal(requiresServiceTerms("/api/product-interactions", "POST"), true);
  assert.equal(requiresServiceTerms("/api/product-interactions", "OPTIONS"), false);
});

test("새 마디 간편 작성은 일반 마디로 저장하며 미동의 권리 경로는 추천 없이 유지한다", () => {
  const first = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(first, /sensitiveContent: false/);
  assert.match(first, /if \(!draft \|\| savingRef.current \|\| preview \|\| !onSave\) return/);
  assert.doesNotMatch(first, /sensitiveConsentVersion|fetchSensitiveJournalPolicy/);
  const main = readFileSync("src/features/tuti/flows/MainFlow.tsx", "utf8");
  assert.doesNotMatch(main, /<RecommendationsFlow|router\.replace/);
  assert.match(main, /rightsOnly \|\| !hasHydrated \|\| !entryRecord \|\| pathname !== "\/explore"/);
});
