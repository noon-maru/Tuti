import assert from "node:assert/strict";
import test from "node:test";
import { rememberMadiDetailOrigin, resolveMadiDetailReturn } from "@/lib/madiDetailReturn";

test("상세 직접 접속·외부 이력·새로고침·다른 계정은 마디 목록으로 돌아간다", () => {
  const browser = Object.assign(new EventTarget(), { history: { length: 10 } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  try {
    assert.deepEqual(resolveMadiDetailReturn("owner", "entry"), { back: false, path: "/madi" });
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length++;
    assert.equal(resolveMadiDetailReturn("other", "entry").back, false);
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length++;
    browser.dispatchEvent(new Event("pagehide"));
    assert.equal(resolveMadiDetailReturn("owner", "entry").back, false);
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length++;
    assert.equal(resolveMadiDetailReturn("owner", "different").back, false);
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length += 2;
    assert.equal(resolveMadiDetailReturn("owner", "entry").back, false);
  } finally { delete (globalThis as { window?: unknown }).window; }
});

test("실제 목록에서 연 상세만 한 번 뒤로가고 popstate 뒤에는 오래된 출처를 재사용하지 않는다", () => {
  const browser = Object.assign(new EventTarget(), { history: { length: 1 } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  try {
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length++;
    assert.equal(resolveMadiDetailReturn("owner", "entry").back, true);
    assert.equal(resolveMadiDetailReturn("owner", "entry").back, false);
    rememberMadiDetailOrigin("owner", "entry"); browser.history.length++;
    browser.dispatchEvent(new Event("popstate"));
    assert.equal(resolveMadiDetailReturn("owner", "entry").back, false);
  } finally { delete (globalThis as { window?: unknown }).window; }
});
