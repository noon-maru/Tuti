import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalDetailScreen } from "@/features/tuti/screens/journal/JournalDetailScreen";
import { harumadiContent } from "./fixtures/harumadiContent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { petProfilesKey } from "@/features/tuti/hooks/usePetProfiles";

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

test("내 마디에는 연결된 반려동물의 원형 프로필 사진과 이름만 표시한다", () => {
  const client = new QueryClient();
  const pet = { id: "momo", name: "모모", species: "cat" as const, weightKg: null };
  const pictured = { ...pet, hasPhoto: true, revision: 3 };
  const withoutPhoto = { ...pet, id: "dori", name: "도리", hasPhoto: false };
  client.setQueryData(petProfilesKey("owner"), { pets: [pictured, withoutPhoto, { ...pictured, id: "unlinked", name: "미연결" }] });
  const entry = { ...base, image: null, pets: [pet, withoutPhoto] };
  const render = (ownerId?: string) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(JournalDetailScreen, { ...callbacks, ownerId, entry })));
  try {
    const html = render("owner");
    assert.match(html, /aria-label="함께한 반려동물"/);
    assert.match(html, /border-radius:50%/);
    assert.match(html, /data-pet-photo[^>]*aria-hidden="true"/);
    assert.equal((html.match(/data-pet-photo="true"/g) ?? []).length, 1, "사진이 있는 연결 프로필에만 원형 사진 자리를 둔다");
    assert.match(html, />모모</); assert.match(html, />도리</);
    assert.doesNotMatch(html, /미연결/);
    assert.doesNotMatch(render(), /함께한 반려동물|data-pet-photo/);
  } finally { client.clear(); }
});

test("글 전용·동작 줄이기는 이미지 확대 대기를 건너뛰고 상세 조회 실패는 재시도한다", () => {
  const transition = readFileSync("src/features/tuti/components/JournalEntryTransition.tsx", "utf8");
  assert.match(transition, /if \(!image \|\| window.matchMedia\("\(prefers-reduced-motion: reduce\)"\).matches\) \{\s+clearTransition\(\);\s+return;/);
  const flow = readFileSync("src/features/tuti/flows/JournalDetailFlow.tsx", "utf8");
  assert.ok(flow.indexOf("if (isError && !entry)") < flow.indexOf("if (!entry)"));
  assert.match(flow, /onRetry=\{\(\) => void refetch\(\)\}/);
});
