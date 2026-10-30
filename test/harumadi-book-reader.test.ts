import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("책장 표지와 설정은 중첩 버튼 없이 같은 책 읽기 화면을 별도로 연다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /<HarumadiCard[^>]*data-harumadi-card/);
  assert.match(home, /<\/HarumadiButton><BookMenu/);
  assert.match(home, /items=\{harumadiActions\(harumadiPdf\)/);
  assert.match(home, /openBook\(harumadiPdf, trigger, action.mode\)/);
  assert.match(home, /<HomeSurface inert=\{Boolean\(opening\)\}/);
  assert.match(home, /<HarumadiBookReader opening=\{opening\}/);
  assert.doesNotMatch(home, /router.push\(harumadiPath/);
});

test("책 펼치기는 앱 영역·축 회전·동작 줄이기·키보드와 기존 읽기 보호를 유지한다", () => {
  const reader = readFileSync("src/features/tuti/components/HarumadiBookReader.tsx", "utf8");
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(reader, /role="dialog" aria-modal="true"/);
  assert.match(reader, /position: absolute; inset: 0/);
  assert.match(reader, /transform-origin: left center/);
  assert.match(reader, /rotateY\(-105deg\)/);
  assert.match(reader, /prefers-reduced-motion: reduce/);
  assert.match(reader, /event.key === "Escape"/);
  assert.match(reader, /event.key !== "Tab"/);
  assert.match(reader, /const previous = returnFocus.current/);
  assert.match(reader, /previous\?\.focus\(\)/);
  assert.match(flow, /bookId \?\? routeId/);
  assert.match(flow, /initialHarumadiMode\(initial, initialMode\)/);
  assert.match(flow, /if \(onClose\) onClose\(\); else router.replace/);
  assert.match(flow, /readOnly = Boolean\(harumadi && !verified\)/);
});
