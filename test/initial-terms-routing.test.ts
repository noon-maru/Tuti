import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initialTermsEntryRedirect, type InitialTermsState } from "@/lib/initialServiceTerms";

const unaccepted: InitialTermsState = { hasStoredSession: false, offer: null, allowed: false };

test("미동의·약관 조회 실패 화면은 entry로 모으고 보호된 페이지를 먼저 마운트하지 않는다", () => {
  for (const pathname of ["/", "/settings", "/explore", "/madi/new", "/madi/edit", "/unknown"]) {
    assert.equal(initialTermsEntryRedirect(pathname, unaccepted), "/entry", pathname);
    assert.equal(initialTermsEntryRedirect(pathname, { ...unaccepted, hasStoredSession: true }), "/entry", pathname);
  }
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /if \(entryRedirect\) router.replace\(entryRedirect\)/);
  assert.match(gate, /entryRedirect \|\| \(!state && !error\)/);
  assert.match(gate, /reconsent && pathname !== "\/entry"/);
});

test("동의 조회 중에는 이동하지 않고 동의 완료·캐시 진입의 원래 경로를 보존한다", () => {
  for (const pathname of ["/", "/entry", "/explore", "/madi/new"]) {
    assert.equal(initialTermsEntryRedirect(pathname, null), null);
    assert.equal(initialTermsEntryRedirect(pathname, { ...unaccepted, hasStoredSession: true, allowed: true }), null);
  }
  assert.equal(initialTermsEntryRedirect("/entry", unaccepted), null);
});

test("로그인·문의는 열어두고 기존 세션의 기록 열람·삭제·철회 경로를 보존한다", () => {
  for (const hasStoredSession of [false, true]) for (const pathname of ["/login", "/inquiry"]) {
    assert.equal(initialTermsEntryRedirect(pathname, { ...unaccepted, hasStoredSession }), null);
  }
  for (const pathname of ["/madi", "/madi/detail", "/harumadi", "/harumadi/pdfs", "/harumadi/pdf/view", "/location", "/notifications"]) {
    assert.equal(initialTermsEntryRedirect(pathname, { ...unaccepted, hasStoredSession: true }), null, pathname);
    assert.equal(initialTermsEntryRedirect(pathname, unaccepted), "/entry", pathname);
  }
});
