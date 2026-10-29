import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseHarumadiInviteUrl, rememberHarumadiInviteUrl, pendingHarumadiInvite, clearHarumadiInvite, setHarumadiInviteResume } from "@/lib/harumadiInviteIntent";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { parseHarumadiPdfInput } from "@/shared/api/harumadiPdf";
import { harumadiInviteUrl } from "@/shared/api/harumadiTogether";

test("초대는 검증된 경로의 fragment로 전달하며 로그인 전후에도 명시 수락을 기다린다", async t => {
  const token = "a".repeat(43);
  assert.equal(parseHarumadiInviteUrl(`https://tuti.today/harumadi/invite#${token}`), token);
  assert.equal(parseHarumadiInviteUrl(`com.noonmaru.tuti://harumadi/invite#${token}`), token);
  for (const url of [`https://evil.test/harumadi/invite#${token}`, `https://tuti.today/login#${token}`, "https://tuti.today/harumadi/invite#short"]) assert.equal(parseHarumadiInviteUrl(url), null);
  const values = new Map<string, string>();
  t.mock.method(preferencesStorage, "getItem", async (key: string) => values.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { values.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { values.delete(key); });
  await rememberHarumadiInviteUrl(`https://tuti.today/harumadi/invite#${token}`);
  assert.equal(await pendingHarumadiInvite(), token);
  assert.equal(await pendingHarumadiInvite(true), token);
  await setHarumadiInviteResume(false);
  assert.equal(await pendingHarumadiInvite(true), null, "사용자가 뒤로 가면 홈에서 다시 초대로 끌어오지 않는다");
  assert.equal(await pendingHarumadiInvite(), token);
  await setHarumadiInviteResume(true);
  assert.equal(await pendingHarumadiInvite(true), token);
  await clearHarumadiInvite(); assert.equal(await pendingHarumadiInvite(), null);
});
test("개발 초대는 개발 API origin으로, 앱의 운영 초대는 운영 API origin으로 전달한다", () => {
  const token = "a".repeat(43);
  assert.equal(harumadiInviteUrl(token, "/api", "http://127.0.0.1:5080"), `http://127.0.0.1:5080/harumadi/invite#${token}`);
  assert.equal(harumadiInviteUrl(token, "https://tuti.today/api", "capacitor://localhost"), `https://tuti.today/harumadi/invite#${token}`);
  assert.throws(() => harumadiInviteUrl("wrong", "/api", "https://tuti.today"));
});

test("공동 PDF 입력은 책 ID·리비전을 묶고 개인 PDF 입력과 분리한다", () => {
  const input = { title: "함께 채운 하루", entryIds: ["a"], letter: "", coverEntryId: null };
  assert.ok(parseHarumadiPdfInput(input));
  assert.equal(parseHarumadiPdfInput({ ...input, harumadiId: "book" }), null);
  assert.equal(parseHarumadiPdfInput({ ...input, harumadiId: "../other", harumadiRevision: 1 }), null);
  assert.equal(parseHarumadiPdfInput({ ...input, harumadiId: "book", harumadiRevision: 1 })?.harumadiId, "book");
  const completion = readFileSync("src/app/api/harumadi-pdfs/route.ts", "utf8");
  assert.match(completion, /book\.accessRevision !== prepared\.sourceHarumadi\.accessRevision/);
  assert.match(completion, /harumadiEntries: \{ some: \{ harumadiId: prepared\.sourceHarumadi\.id/);
});

test("초대는 웹 대안·네이티브 링크·약관과 로그인 후 복귀를 연결한다", () => {
  const callback = readFileSync("src/features/tuti/components/NativeOAuthCallbackHandler.tsx", "utf8");
  assert.match(callback, /rememberHarumadiInviteUrl/);
  assert.match(readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8"), /rememberHarumadiInviteUrl\(window\.location\.href\)/);
  assert.match(readFileSync("src/features/tuti/flows/AccountFlow.tsx", "utf8"), /pendingHarumadiInvite\(true\)/);
  assert.match(readFileSync("android/app/src/main/AndroidManifest.xml", "utf8"), /android:host="harumadi" android:path="\/invite"/);
});
