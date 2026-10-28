import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("책장·첫 화면·질문 상단은 워드마크를 반복하지 않는다", () => {
  const paths = ["flows/LibraryHomeFlow.tsx", "screens/onboarding/WelcomeScreen.tsx", "screens/intake/IntakeScreen.tsx"];
  const sources = paths.map(path => readFileSync(`src/features/tuti/${path}`, "utf8"));
  for (const source of sources) assert.doesNotMatch(source, /TutiWordmark|HeaderWordmark|<Wordmark/);
  assert.match(sources[0], /aria-label="설정"/);
  assert.match(sources[0], /justify-content: space-between/);
  assert.match(sources[0], /<h1 id="library-title">나의 하루마디<\/h1>/);
  assert.match(sources[1], /이용 방법 이전 화면/);
  assert.match(sources[1], /href="\/login"/);
  assert.match(sources[1], /<GuideButton type="button" onClick=\{onGuideOpen\}>이용 방법/);
  assert.match(sources[2], /onClick=\{onRestoreRecords\}/);
  assert.match(sources[2], /justify-content: flex-end/);
});

test("약관 제목은 작은 Tuti 워드마크와 이용약관 동의를 한 줄로 묶는다", () => {
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /<h1[^>]*><TutiWordmark priority \/><span>/);
  assert.match(gate, /"이용약관 동의"/);
  assert.match(gate, /font-size: 18px/);
  assert.match(gate, /width: 52px/);
});
