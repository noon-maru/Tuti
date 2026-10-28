import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rememberMadiEditOrigin, resolveMadiEditReturn } from "@/lib/madiEditReturn";

function installWindow(events: EventTarget, after: (cleanup: () => void) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
}
test("상세와 목록에서 실제 진입한 수정은 원래 히스토리로 돌아가고 중복 화면을 만들지 않는다", t => {
  const events = new EventTarget();
  installWindow(events, cleanup => t.after(cleanup));
  for (const source of ["detail", "journal"] as const) {
    rememberMadiEditOrigin("owner", "entry-a", source);
    assert.deepEqual(resolveMadiEditReturn("owner", "entry-a", source), { back: true, path: source === "detail" ? "/madi/detail?entryId=entry-a" : "/madi" });
    assert.equal(resolveMadiEditReturn("owner", "entry-a", source).back, false);
  }
});
test("직접 접속·새로고침·다른 계정과 이전 브라우저 이동은 외부 페이지로 뒤로가지 않는다", t => {
  const events = new EventTarget();
  installWindow(events, cleanup => t.after(cleanup));
  assert.deepEqual(resolveMadiEditReturn("owner", "entry/a", "detail"), { back: false, path: "/madi/detail?entryId=entry%2Fa" });
  rememberMadiEditOrigin("owner", "entry-a", "detail");
  assert.equal(resolveMadiEditReturn("other", "entry-a", "detail").back, false);
  for (const name of ["popstate", "pagehide"]) {
    rememberMadiEditOrigin("owner", "entry-a", "detail");
    events.dispatchEvent(new Event(name));
    assert.equal(resolveMadiEditReturn("owner", "entry-a", "detail").back, false);
  }
  rememberMadiEditOrigin("owner", "entry-a", "detail");
  assert.equal(resolveMadiEditReturn("owner", "entry-b", "detail").back, false);
});
test("저장 완료와 수정 취소는 같은 안전한 복귀 경로를 사용한다", () => {
  const flow = readFileSync("src/features/tuti/flows/JournalEditFlow.tsx", "utf8");
  assert.match(flow, /resolveMadiEditReturn\(ownerId, entryId, source\)/);
  assert.match(flow, /onBack=\{returnToJournal\}/);
  assert.match(flow, /navigate: returnToJournal/);
  assert.match(flow, /else router.replace\(destination.path\)/);
  for (const path of ["src/features/tuti/flows/JournalDetailFlow.tsx", "src/app/(tuti)/(main)/madi/page.tsx"]) {
    assert.match(readFileSync(path, "utf8"), /rememberMadiEditOrigin\(ownerId, entry/);
  }
});
