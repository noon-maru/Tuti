import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalDetailScreen } from "@/features/tuti/screens/journal/JournalDetailScreen";
import { harumadiContent } from "./fixtures/harumadiContent";

const base = harumadiContent().entries[0];
const callbacks = { publicationEnabled: false, onBack() {}, onDelete() {}, onEdit() {}, onCopyPublicLink() {}, onSharePublicLink() {}, onPublish() {}, onUnpublish() {} };

test("글 전용 마디에는 빈 사진·제목·가짜 장소를 렌더링하지 않는다", () => {
  const html = renderToStaticMarkup(createElement(JournalDetailScreen, { ...callbacks,
    entry: { ...base, title: "", image: null, placeName: "남긴 공간", content: "혼자 걸었던 길을 기억해요." },
  }));
  assert.doesNotMatch(html, /role="img"|<h2|남긴 공간|지난 공간/);
  assert.match(html, /혼자 걸었던 길을 기억해요/);
  assert.match(html, /나의 마디로 돌아가기/);
});

test("사진과 선택 제목·장소가 있으면 유지하며 원본 비율로 표시한다", () => {
  const image = "https://example.invalid/portrait.jpg";
  const html = renderToStaticMarkup(createElement(JournalDetailScreen, { ...callbacks, entry: { ...base, image, content: "" } }));
  assert.match(html, /role="img"/); assert.match(html, /산책 사진/);
  assert.match(html, /background-size:contain/); assert.doesNotMatch(html, /background-size:cover/);
  assert.match(html, /<h2[^>]*>산책<\/h2>/); assert.match(html, /동네 공원/);
});

test("글 전용·동작 줄이기는 이미지 확대 대기를 건너뛰고 상세 조회 실패는 재시도한다", () => {
  const transition = readFileSync("src/features/tuti/components/JournalEntryTransition.tsx", "utf8");
  assert.match(transition, /if \(!image \|\| window.matchMedia\("\(prefers-reduced-motion: reduce\)"\).matches\) \{\s+clearTransition\(\);\s+return;/);
  const flow = readFileSync("src/features/tuti/flows/JournalDetailFlow.tsx", "utf8");
  assert.ok(flow.indexOf("if (isError && !entry)") < flow.indexOf("if (!entry)"));
  assert.match(flow, /onRetry=\{\(\) => void refetch\(\)\}/);
});
