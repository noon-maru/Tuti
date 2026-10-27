import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WELCOME_GUIDE } from "../src/shared/tuti/welcomeGuide";

const read = (path: string) => readFileSync(`src/features/tuti/${path}`, "utf8");

test("둘러보기의 계정 복원 동선은 마디에 한정하지 않고 기록 불러오기로 안내한다", () => {
  const intake = read("screens/intake/IntakeScreen.tsx");
  assert.match(intake, /기록 불러오기/);
  assert.doesNotMatch(intake, /마디 불러오기/);
});

test("첫 마디는 사진·이야기로 설명하고 시작 동작과 빈 하루마디에 연결한다", () => {
  const welcome = read("screens/onboarding/WelcomeScreen.tsx");
  assert.match(welcome, /사진 한 장, 짧은 이야기면 충분해요/);
  assert.match(welcome, /한 마디씩 남겨요/);
  assert.match(welcome, />첫 마디 남기기</);
  assert.doesNotMatch(welcome, /첫 페이지 만들기/);
  assert.match(read("screens/onboarding/WelcomeHarumadiPreview.tsx"), />첫 마디 남기기</);
  const book = read("flows/HarumadiFlow.tsx");
  assert.match(book, /첫 마디를 채워보세요/);
  assert.match(book, /마디 골라 담기/);
  assert.match(book, /entries.isSuccess && entries.data.length === 0/);
  assert.match(book, /isFirstMadi \? "첫 마디 남기기" : "마디 남기기"/);
  assert.match(WELCOME_GUIDE[2].description, /마디를.*하루마디/s);
});

test("목록·작성·공유의 이름을 맞추고 이어 쓰기는 첫 마디와 구분한다", () => {
  assert.match(read("screens/journal/JournalScreen.tsx"), /<h1>나의 마디<\/h1>/);
  assert.match(read("screens/journal/JournalEditorScreen.tsx"), /오늘의 마디/);
  assert.match(read("components/JournalShareDialog.tsx"), /title="마디 공유하기"/);
  assert.doesNotMatch(read("screens/journal/JournalDetailScreen.tsx"), /마디가에요|마디을|마디은|마디과/);
  const first = read("screens/journal/MadiCreateScreen.tsx");
  assert.match(first, /firstMadi && !continued/);
  assert.match(first, /saved \? savedAsFirstMadi/);
  assert.match(first, /setContinued\(true\)/);
  assert.match(first, /다음 마디 남기기/);
});

test("법적 문안·활동 기록과 기존 저장 프로토콜은 제품 용어와 구분한다", () => {
  assert.match(read("components/JournalPublicationConsentDialog.tsx"), /기록 공개 운영정책/);
  assert.match(read("screens/journal/JournalEditorScreen.tsx"), /\[선택\] 이 기록의 민감정보 처리에 별도로 동의해요\./);
  assert.doesNotMatch(read("screens/journal/MadiCreateScreen.tsx"), /sensitiveConsentVersion/);
  assert.match(read("components/LocationHistorySection.tsx"), /위치정보를 이용한 기록/);
  const api = readFileSync("src/lib/tutiApi.ts", "utf8");
  assert.match(api, /행동을 기록하지 못했어요/);
  assert.match(api, /fetchWithSession\("journal-entries"\)/);
  assert.match(api, /마디를 저장하지 못했어요/);
});
