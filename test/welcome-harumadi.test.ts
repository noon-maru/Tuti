import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseWelcomeHarumadiPage, welcomeHarumadiPath, welcomeHarumadiTurn, welcomeHarumadiNeighbor, WELCOME_HARUMADI_LAST_PAGE, WELCOME_HARUMADI_PAGE_COUNT } from "../src/shared/tuti/welcomeHarumadi";
import { getWelcomeHarumadiOrigin, setWelcomeHarumadiOrigin, takeWelcomeHarumadiOrigin } from "../src/lib/welcomeHarumadiNavigation";

test("예시 화면의 DOM 속성과 클릭·레이어 선택자는 소문자 data 속성을 공유한다", () => {
  const read = (file: string) => readFileSync(`src/features/tuti/screens/onboarding/${file}.tsx`, "utf8");
  const sample = read("WelcomeHarumadiSample");
  const screen = read("WelcomeScreen");
  const preview = read("WelcomeHarumadiPreview");
  for (const source of [sample, screen, preview]) assert.doesNotMatch(source, /data-[a-z-]*[A-Z]/);
  assert.match(sample, /data-harumadi-pdf-sample=/);
  assert.match(screen, /querySelector\('\[data-harumadi-pdf-sample\]'\)/);
  assert.match(preview, /data-harumadi-pdf-edge="previous"/);
  assert.match(preview, /\[data-harumadi-pdf-edge="previous"\]/);
  assert.match(preview, /data-harumadi-pdf-edge="next"/);
  assert.match(preview, /\[data-harumadi-pdf-edge="next"\]/);
});

test("하루마디 예시는 별도 화면이며 기본 진입은 눌렀던 본문 페이지다", () => {
  assert.equal(WELCOME_HARUMADI_PAGE_COUNT, 4);
  assert.equal(WELCOME_HARUMADI_LAST_PAGE, 3);
  for (const value of [null, "invalid", "-1", "4"]) assert.equal(parseWelcomeHarumadiPage(value), 1);
  for (const page of [0, 1, 2, 3] as const) {
    assert.equal(parseWelcomeHarumadiPage(String(page)), page);
    assert.equal(welcomeHarumadiPath(page), `/harumadi/example?page=${page}`);
    assert.equal(welcomeHarumadiPath(page, "library"), `/harumadi/example?page=${page}&from=library`);
  }
});

test("예시는 독립 경로에서 쪽 이동은 replace, 닫기는 실제 히스토리 back을 사용한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiExampleFlow.tsx", "utf8");
  const entry = readFileSync("src/features/tuti/flows/EntryFlow.tsx", "utf8");
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(readFileSync("src/app/(tuti)/harumadi/example/page.tsx", "utf8"), /<HarumadiExampleFlow/);
  assert.match(flow, /onPageChange=\{next => router.replace\(welcomeHarumadiPath/);
  assert.match(flow, /window.history.length > 1\) router.back\(\)/);
  assert.match(flow, /else router.replace\("\/"\)/);
  assert.doesNotMatch(flow, /router.replace\("\/entry"\)/);
  assert.doesNotMatch(entry, /<WelcomeHarumadiPreview/);
  assert.match(home, /welcomeHarumadiPath\(1, "library"\)/);
});

test("화면 분리 후에도 펼치기 좌표를 전달하며 읽기 재시도에는 유지하고 소비 후에는 지운다", () => {
  const origin = { left: 40, top: 200, width: 180, height: 240 };
  setWelcomeHarumadiOrigin(origin);
  assert.deepEqual(getWelcomeHarumadiOrigin(), origin);
  assert.deepEqual(getWelcomeHarumadiOrigin(), origin);
  assert.deepEqual(takeWelcomeHarumadiOrigin(), origin);
  assert.equal(getWelcomeHarumadiOrigin(), null);
  setWelcomeHarumadiOrigin(null);
  assert.equal(takeWelcomeHarumadiOrigin(), null);
});

test("좌우 영역과 버튼은 동일한 페이지 경계 규칙을 사용한다", () => {
  assert.equal(welcomeHarumadiNeighbor(0, -1), null);
  assert.equal(welcomeHarumadiNeighbor(3, 1), null);
  assert.equal(welcomeHarumadiNeighbor(0, 1), 1);
  assert.equal(welcomeHarumadiNeighbor(1, -1), 0);
  assert.equal(welcomeHarumadiNeighbor(1, 1), 2);
  assert.equal(welcomeHarumadiNeighbor(2, 1), 3);
  assert.equal(welcomeHarumadiNeighbor(3, -1), 2);
});

test("이전·다음 쪽은 같은 축·각도·시간을 쓰며 프레임과 가속 곡선까지 서로 역재생한다", () => {
  for (const [previous, next] of [[0, 1], [1, 2], [2, 3], [0, 3]] as const) {
    const forward = welcomeHarumadiTurn(previous, next);
    const backward = welcomeHarumadiTurn(next, previous);
    assert.equal(forward.phase, "exit");
    assert.equal(backward.phase, "enter");
    assert.equal(forward.transformOrigin, "left top");
    assert.equal(backward.transformOrigin, forward.transformOrigin);
    assert.equal(forward.duration, 520);
    assert.equal(backward.duration, forward.duration);
    forward.frames.forEach((frame, index) => {
      const reverse = backward.frames.at(-1 - index)!;
      assert.equal(reverse.transform, frame.transform);
      assert.equal(reverse.opacity, frame.opacity);
      assert.ok(Math.abs(reverse.offset - (1 - frame.offset)) < 0.000001);
    });
    assert.equal(forward.easing, "cubic-bezier(0.4, 0, 0.2, 1)");
    assert.equal(backward.easing, "cubic-bezier(0.8, 0, 0.6, 1)");
  }
});
