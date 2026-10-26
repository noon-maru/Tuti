import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { animateRequiredConsents } from "@/lib/requiredConsentAnimation";

test("필수 두 항목을 차례로 체크하고 마지막 표시 시간 뒤 저장 단계로 넘긴다", async () => {
  const events: Array<string | number> = [];
  await animateRequiredConsents({ ageConfirmed: false, termsConfirmed: false,
    confirmAge: () => { events.push("age"); }, confirmTerms: () => { events.push("terms"); },
    reducedMotion: false, signal: new AbortController().signal,
  }, async ms => { events.push(ms); });
  assert.deepEqual(events, [80, "age", 140, "terms", 180]);
});

test("이미 체크한 항목은 다시 재생하지 않고 동작 줄이기는 대기하지 않는다", async () => {
  for (const ageConfirmed of [false, true]) for (const termsConfirmed of [false, true]) {
    const events: Array<string | number> = [];
    await animateRequiredConsents({ ageConfirmed, termsConfirmed,
      confirmAge: () => { events.push("age"); }, confirmTerms: () => { events.push("terms"); },
      reducedMotion: true, signal: new AbortController().signal,
    }, async ms => { events.push(ms); });
    assert.deepEqual(events, [...(!ageConfirmed ? ["age"] : []), ...(!termsConfirmed ? ["terms"] : [])]);
  }
  await animateRequiredConsents({ ageConfirmed: true, termsConfirmed: true,
    confirmAge: () => assert.fail("already checked"), confirmTerms: () => assert.fail("already checked"),
    reducedMotion: false, signal: new AbortController().signal,
  }, async () => { assert.fail("no animation needed"); });
});

test("화면을 떠나면 뒤늦은 체크나 후속 저장 단계로 진행하지 않는다", async () => {
  const controller = new AbortController();
  const events: string[] = [];
  await assert.rejects(animateRequiredConsents({ ageConfirmed: false, termsConfirmed: false,
    confirmAge: () => { events.push("age"); }, confirmTerms: () => { events.push("terms"); },
    reducedMotion: false, signal: controller.signal,
  }, async ms => { if (ms === 140) controller.abort(); }), { name: "AbortError" });
  assert.deepEqual(events, ["age"]);
});

test("시작은 명시적 클릭에만 연결하고 위치 선택은 자동 체크하지 않는다", () => {
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  const accept = gate.slice(gate.indexOf("const accept = async"), gate.indexOf("return <Form"));
  assert.match(accept, /if \(submitting.current\) return/);
  assert.ok(accept.indexOf("await animateRequiredConsents") < accept.indexOf("await submitInitialConsents"));
  assert.match(accept, /if \(!active.current \|\| controller.signal.aborted\) return/);
  assert.doesNotMatch(accept, /setLocationConfirmed\(true\)/);
  assert.match(gate, /버튼을 누르면 만 14세 이상임을 확인하고/);
  assert.match(gate, /위치 동의는 선택한 경우에만 포함돼요/);
  assert.match(gate, /prefers-reduced-motion: reduce/);
});

test("시작 라벨은 필수 두 항목만으로 바뀌고 처리 중 안내를 우선한다", () => {
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  const button = gate.match(/<Button type="submit"[^>]*>(.*?)<\/Button>/s)?.[1];
  assert.ok(button);
  assert.match(button, /ageConfirmed && termsConfirmed \? "동의하고 시작하기" : "필수 항목에 동의하고 시작하기"/);
  assert.match(button, /confirming \? "필수 항목을 확인하고 있어요" : saving \? "동의를 저장하고 있어요"/);
  assert.doesNotMatch(button, /locationConfirmed/);
});
