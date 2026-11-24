import assert from "node:assert/strict";
import test from "node:test";
import { acceptedEntryReceipt } from "../src/shared/legal/serviceTerms.ts";

const offer = { version: "2026-10-22", documentHash: "a".repeat(64) };
const response = {
  receipt: { termsVersion: offer.version, documentHash: offer.documentHash, acceptedAt: "2026-11-24T06:00:00Z" },
  entry: { ...offer, accepted: true, required: false },
};
test("서버 저장 영수증과 현재 약관 확인이 일치할 때만 중복 GET을 생략한다", () => {
  assert.deepEqual(acceptedEntryReceipt(response, offer), offer);
});
test("서버 전환 중 entry가 없는 응답은 기존 GET 확인을 요구한다", () => {
  assert.equal(acceptedEntryReceipt({ receipt: response.receipt }, offer), null);
  assert.equal(acceptedEntryReceipt(null, offer), null);
});
test("미동의·약관 변경·다른 영수증·잘못된 날짜는 완료로 처리하지 않는다", () => {
  for (const entry of [{ ...response.entry, accepted: false }, { ...response.entry, required: true },
    { ...response.entry, version: "new-version" }, { ...response.entry, documentHash: "b".repeat(64) }, null]) {
    assert.throws(() => acceptedEntryReceipt({ ...response, entry }, offer));
  }
  for (const receipt of [{ ...response.receipt, termsVersion: "other" }, { ...response.receipt, documentHash: "b".repeat(64) },
    { ...response.receipt, acceptedAt: "invalid" }, null]) {
    assert.throws(() => acceptedEntryReceipt({ ...response, receipt }, offer));
  }
});
